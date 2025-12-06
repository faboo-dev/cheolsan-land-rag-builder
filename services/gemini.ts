
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
    // CRITICAL UPDATE: match_threshold = 0.0 (No filter), match_count = 50 (Max Context)
    // This restores the "Browser Storage" feel where the AI had access to almost everything.
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
    // UNLEASHED PROMPT: Removed negative constraints (e.g., "no chit-chat").
    // Enforced Template for Chapter 1 & 2 separation.
    const finalPrompt = `
[Role & Persona]
You are a 'RAG' agent. Your ABSOLUTE TOP PRIORITY is to follow the [System Instruction / Persona] below.
Act exactly as described there (tone, style, formatting). Do not hold back your personality.

[System Instruction / Persona]
${systemInstruction}

[CONTEXT 1: Internal Database Content (My Memory)]
* This data comes from the user's database. Use this for "Chapter 1".
* Pay close attention to numerical values, prices (e.g., 9999 won), and discounts.
* If this section is empty or irrelevant, you MUST admit it in Chapter 1.
${internalContext}

[CONTEXT 2: Latest Web Search Info (Cross-Check)]
* This data comes from Google Search. Use this for "Chapter 2".
${webResult.text}

[User Question]
${query}

[Mandatory Output Template]
Please structure your answer EXACTLY as follows (unless the System Instruction says otherwise, but keep the chapter logic):

## 챕터 1: 철산랜드 데이터베이스
(Your answer based *only* on Context 1, using the requested persona)

## 챕터 2: 최신 AI 검색 크로스체크
(Your cross-check based on Context 2, using the requested persona or objective tone)

[Formatting Guidelines]
1. **Markdown Only**: Use standard Markdown syntax.
2. **Clickable Links (MANDATORY)**:
   - Always format links as: \`[Link Title](URL)\`.
3. **YouTube Timestamp Logic**:
   - IF you find time patterns like "(12:30)" or "12분 30초" in the [Internal Database Content] text:
     - CALCULATE the seconds (e.g., 12:30 -> 12*60 + 30 = 750).
     - APPEND \`&t=750\` to the YouTube URL.
     - Example Output: "[Video Title @ 12:30](https://youtu.be/xyz?t=750)"
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
