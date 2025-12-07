import { GoogleGenAI } from "@google/genai";
import { DebugSnippet } from "../types";
import { supabase } from "./supabase";

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
        throw error;
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

  // --- Main Orchestrator (Supabase Integrated) ---
  async getAnswer(query: string, systemInstruction: string): Promise<{ 
    answer: string; 
    sources: any[];
    webSources: any[];
    debugSnippets: DebugSnippet[]; 
  }> {
    // 1. Retrieval (Vector Search via Supabase)
    let queryEmbedding: number[] = [];
    try {
        queryEmbedding = await this.generateEmbedding(query);
    } catch (e) {
        console.error("Embedding generation failed for query", e);
        return { answer: "질문 분석 중 오류가 발생했습니다.", sources: [], webSources: [], debugSnippets: [] };
    }

    // Call Supabase RPC function 'match_documents'
    // Updated: Increased match_count to 30 to provide rich context
    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Lower threshold to capture more potential matches
      match_count: 30       // Increased from 10 to 30
    });

    if (error) {
      console.error("Supabase Search Error:", error);
      return { answer: "데이터베이스 검색 중 오류가 발생했습니다.", sources: [], webSources: [], debugSnippets: [] };
    }

    const matchedDocs = documents || [];
    
    // Debug Data Preparation
    const debugSnippets: DebugSnippet[] = matchedDocs.map((doc: any) => ({
      score: doc.similarity,
      text: doc.content,
      sourceTitle: doc.metadata.title
    }));

    // Format Internal Context with URLs for inline citation
    const internalContext = matchedDocs.map((doc: any) => `
[SourceID: ${doc.metadata.sourceId}]
Title: ${doc.metadata.title}
Date: ${doc.metadata.date}
URL: ${doc.metadata.url}
Type: ${doc.metadata.type}
Content: ${doc.content}
    `).join('\n\n');

    const uniqueSources = Array.from(new Set(matchedDocs.map((doc: any) => JSON.stringify({
      title: doc.metadata.title,
      url: doc.metadata.url,
      date: doc.metadata.date,
      type: doc.metadata.type
    })))).map((s: any) => JSON.parse(s));

    // 2. Fetch Web Info
    const webResult = await this.fetchWebInfo(query);

    // 3. Final Synthesis
    const finalPrompt = `
[Task]
Answer the user's question by synthesizing the "Internal Database" and "Latest Web Search Info".
The user wants a DETAILED, RICH answer, not a summary.

[System Instruction / Persona]
${systemInstruction}

[NEGATIVE CONSTRAINTS - STRICTLY ENFORCED]
1. NO FILLER TEXT: Do NOT start with "Okay", "Here is", "Based on". Start DIRECTLY with the content.
2. NO HTML TAGS: Use Markdown only.
3. NO JSON DUMPS.

[CRITICAL FORMATTING RULES]
1. **Markdown Only**: Use standard Markdown syntax.
2. **Clickable Links (MANDATORY)**:
   - When citing a source, use: \`[Link Title](URL)\`.
3. **YouTube Timestamp Logic (CRITICAL)**:
   - YOU MUST scan the "Internal Database" text for time patterns like "(12:30)" or "12분 30초".
   - If found, CALCULATE the seconds (12*60 + 30 = 750).
   - Append \`&t=750\` to the YouTube URL.
   - Example: "As seen here: [Video Title @ 12:30](https://youtu.be/xyz?t=750)"
   - IF NO TIMESTAMP IS FOUND in the text, just link the video without timestamp.
4. **Date Priority**:
   - If "Internal Database" and "Web Search" conflict, trust the ONE WITH THE MORE RECENT DATE.
   - Explicitly mention the date of the information.

[Internal Database Content]
${internalContext}

[Latest Web Search Info]
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