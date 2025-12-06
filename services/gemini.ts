
import { GoogleGenAI } from "@google/genai";
import { DebugSnippet } from "../types";
import "./supabase"; // Ensure relative import for module resolution
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
        contents: `Search the web for the latest information regarding: "${query}". Focus on prices, operating hours, and recent reviews.`,
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
      return { text: "(웹 검색 실패 - 데이터베이스 정보로만 답변합니다)", sources: [] };
    }
  }

  // --- Main Orchestrator (Supabase Integrated) ---
  // Added useWebSearch parameter for optional cross-check
  async getAnswer(query: string, systemInstruction: string, useWebSearch: boolean): Promise<{ 
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
    // UNLEASHED MODE: match_threshold = 0.0, match_count = 50
    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.0, 
      match_count: 50 
    });

    if (error) {
      console.error("Supabase Search Error:", error);
      return { answer: "데이터베이스 검색 중 오류가 발생했습니다.", sources: [], webSources: [], debugSnippets: [] };
    }

    const matchedDocs = documents || [];
    
    // Debug Data
    const debugSnippets: DebugSnippet[] = matchedDocs.map((doc: any) => ({
      score: doc.similarity,
      text: doc.content,
      sourceTitle: doc.metadata.title
    }));

    // Format Internal Context
    const internalContext = matchedDocs.map((doc: any) => `
[ID: ${doc.metadata.sourceId}]
Title: ${doc.metadata.title}
Date: ${doc.metadata.date}
URL: ${doc.metadata.url}
Content: ${doc.content}
    `).join('\n\n');

    const uniqueSources = Array.from(new Set(matchedDocs.map((doc: any) => JSON.stringify({
      title: doc.metadata.title,
      url: doc.metadata.url,
      date: doc.metadata.date,
      type: doc.metadata.type
    })))).map((s: any) => JSON.parse(s));

    // 2. Fetch Web Info (Conditional)
    // Fix: Explicitly type the variable to avoid type inference error (never[])
    let webResult: { text: string; sources: any[] } = { text: "User did not request web search. Skip the Cross-Check section.", sources: [] };
    
    if (useWebSearch) {
        webResult = await this.fetchWebInfo(query);
    }

    // 3. Final Synthesis
    const finalPrompt = `
${systemInstruction}

[NEGATIVE CONSTRAINTS - STRICTLY ENFORCED]
1. DO NOT use HTML tags like <div>, <table>, <span>, <br>. 
2. Use ONLY standard Markdown syntax for tables and formatting.
3. If you use HTML, the system will break.

[CONTEXT 1: My Database (The Truth)]
* Use this for "## 🏰 철산랜드 데이터베이스".
* Provide EXTREME detail.
${internalContext}

[CONTEXT 2: Web Search (For Cross-Check)]
* Use this for "## 🌐 최신 AI 검색 크로스체크".
* Status: ${useWebSearch ? "Active" : "Disabled"}
${webResult.text}

[User Question]
${query}

[Format Guide]
1. Start with "## 🏰 철산랜드 데이터베이스".
2. If Context 2 is Active, add "## 🌐 최신 AI 검색 크로스체크" at the end. If Disabled, SKIP it.
3. Convert timestamps (02:30) to links: [Title @ 02:30](URL&t=150).
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
