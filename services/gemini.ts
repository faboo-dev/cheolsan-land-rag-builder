import { GoogleGenAI } from "@google/genai";
import { KnowledgeSource, ContentChunk } from "../types";
import { cosineSimilarity } from "../utils/textProcessing";

// Model constants
const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = "gemini-2.5-flash";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Clean text for embedding
    const cleanText = text.replace(/\n/g, " ");
    
    const result = await this.ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: cleanText,
    });

    // Handle potential array structure in response
    const embeddingValues = result.embeddings?.[0]?.values;

    if (!embeddingValues) {
      throw new Error("Failed to generate embedding");
    }

    return embeddingValues;
  }

  async getAnswer(query: string, sources: KnowledgeSource[]): Promise<{ text: string; sources: any[] }> {
    // 1. Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // 2. Gather all chunks from all processed sources
    const allChunks: { chunk: ContentChunk; source: KnowledgeSource; score: number }[] = [];

    sources.forEach(source => {
      source.chunks.forEach(chunk => {
        if (chunk.embedding) {
          const score = cosineSimilarity(queryEmbedding, chunk.embedding);
          allChunks.push({ chunk, source, score });
        }
      });
    });

    // 3. Sort by relevance (cosine similarity)
    allChunks.sort((a, b) => b.score - a.score);

    // 4. Take top K relevant chunks (Context Window)
    const topChunks = allChunks.slice(0, 15);
    
    const contextText = topChunks.map(item => {
      return `
---
Source ID: ${item.source.id}
Source Title: ${item.source.title}
Date: ${item.source.date}
URL: ${item.source.url}
Type: ${item.source.type}
Content Snippet: ${item.chunk.text}
---
`;
    }).join('\n');

    // 5. Construct Prompt
    const prompt = `
You are the AI assistant for "Cheolsan Land", a travel brand. 
Your goal is to answer user questions using ONLY the provided context below.
This context comes from the owner's YouTube channel and Naver Blog.

Context Information:
${contextText}

Instructions:
1. Answer the user's question explicitly based on the context provided.
2. If the answer is not in the context, politely say you don't have that information in your current database.
3. **IMPORTANT**: Prioritize newer information if there are conflicting details (check the 'Date' field).
4. **CITATIONS (Strict)**: 
   - You MUST cite your sources at the end of the sentence or paragraph.
   - **YouTube Timestamps**: Look for patterns like (02:30), [10:15], or just time codes in the text.
     - If found: [Video Title @ 02:30](URL) 
     - If no timestamp: [Video Title](URL)
   - **Blog**: Format as: [Blog Title](URL)
5. Tone: Friendly, helpful, like a travel expert. Speak in Korean (honorifics/존댓말).

User Question: ${query}
    `;

    // 6. Generate Answer
    const response = await this.ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
    });

    // Extract unique sources for UI display
    const uniqueSources = Array.from(new Set(topChunks.map(tc => JSON.stringify({
      title: tc.source.title,
      url: tc.source.url,
      date: tc.source.date,
      type: tc.source.type
    })))).map(s => JSON.parse(s));

    return {
      text: response.text || "No response generated.",
      sources: uniqueSources
    };
  }
}
