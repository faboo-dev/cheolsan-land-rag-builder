
import { GoogleGenAI } from "@google/genai";
import { KnowledgeSource, ContentChunk, DebugSnippet } from "../types";
import { cosineSimilarity } from "../utils/textProcessing";

// Model constants
const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = "gemini-2.5-flash";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // @ts-ignore
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const cleanText = text.replace(/\n/g, " ");
    if (!cleanText.trim()) return [];

    try {
        const result = await this.ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: cleanText,
        });

        const embeddingValues = result.embeddings?.[0]?.values;

        if (!embeddingValues) {
          console.warn("Embedding generated but no values found.");
          return [];
        }

        return embeddingValues;
    } catch (error) {
        console.error("Embedding Error:", error);
        throw error; // Let the caller handle UI feedback
    }
  }

  // --- Web Search Helper ---
  private async fetchWebInfo(query: string): Promise<{ text: string; sources: any[] }> {
    try {
      const response = await this.ai.models.generateContent({
        model: CHAT_MODEL,
        contents: `Search the web for the latest information regarding: "${query}". Provide a detailed summary of facts, prices, and dates.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const webSources = groundingChunks
        .map((chunk: any) => chunk.web ? { title: chunk.web.title, url: chunk.web.uri } : null)
        .filter((item: any) => item !== null);

      return {
        text: response.text || "웹 검색 결과를 가져올 수 없습니다.",
        sources: webSources
      };
    } catch (e) {
      console.error("Web Search Error", e);
      return { text: "(웹 검색 실패)", sources: [] };
    }
  }

  // --- Main Orchestrator (Integrated Logic) ---
  async getAnswer(query: string, sources: KnowledgeSource[], systemInstruction: string): Promise<{ 
    answer: string; 
    sources: any[];
    webSources: any[];
    debugSnippets: DebugSnippet[]; 
  }> {
    // 1. Retrieval (Vector Search)
    let queryEmbedding: number[] = [];
    try {
        queryEmbedding = await this.generateEmbedding(query);
    } catch (e) {
        console.error("Embedding generation failed for query", e);
        return { answer: "질문 분석 중 오류가 발생했습니다.", sources: [], webSources: [], debugSnippets: [] };
    }

    const allChunks: { chunk: ContentChunk; source: KnowledgeSource; score: number }[] = [];

    sources.forEach(source => {
      source.chunks.forEach(chunk => {
        if (chunk.embedding && chunk.embedding.length > 0) {
          const score = cosineSimilarity(queryEmbedding, chunk.embedding);
          allChunks.push({ chunk, source, score });
        }
      });
    });

    allChunks.sort((a, b) => b.score - a.score);
    const topChunks = allChunks.slice(10); // 상위 10개 문맥
    
    // Debug Data Preparation
    const debugSnippets: DebugSnippet[] = topChunks.map(item => ({
      score: item.score,
      text: item.chunk.text,
      sourceTitle: item.source.title
    }));

    // Format Internal Context with URLs for inline citation
    const internalContext = topChunks.map(item => `
[SourceID: ${item.source.id}]
Title: ${item.source.title}
Date: ${item.source.date}
URL: ${item.source.url}
Type: ${item.source.type}
Content: ${item.chunk.text}
    `).join('\n\n');

    const uniqueSources = Array.from(new Set(topChunks.map(tc => JSON.stringify({
      title: tc.source.title,
      url: tc.source.url,
      date: tc.source.date,
      type: tc.source.type
    })))).map(s => JSON.parse(s));

    // 2. Fetch Web Info
    const webResult = await this.fetchWebInfo(query);

    // 3. Final Synthesis
    const finalPrompt = `
[Task]
Answer the user's question based on the provided "Internal Database" and "Latest Web Search Info".
Follow the [System Instruction] strictly for tone, style, and structure.

[System Instruction / Persona]
${systemInstruction}

[Formatting Rules - CRITICAL]
1. Use **Markdown** for all formatting.
2. **DO NOT use HTML tags** (like <div>, <table>, <span>). Use Markdown tables and lists instead.
3. **Inline Citations & Links:**
   - When citing Internal Database, create a clickable Markdown link: [Link Text](URL).
   - **YouTube Timestamps:** If the source is YouTube and you mention a specific time (e.g., "at 02:30"), you MUST calculate the seconds (2*60+30 = 150) and append '&t=150' to the URL.
     Example: "As seen in the video [Video Title @ 02:30](https://youtube.com/watch?v=xyz&t=150)..."
4. If comparing data (e.g. prices), use a Markdown Table.

[Internal Database (User's Verified Content)]
${internalContext}

[Latest Web Search Info (For Cross-checking)]
${webResult.text}

[User Question]
${query}
    `;

    const response = await this.ai.models.generateContent({
      model: CHAT_MODEL,
      contents: finalPrompt,
    });

    return {
      answer: response.text || "답변을 생성할 수 없습니다.",
      sources: uniqueSources,
      webSources: webResult.sources,
      debugSnippets
    };
  }
}
