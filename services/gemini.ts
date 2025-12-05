
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
        throw error;
    }
  }

  // --- Web Search Helper ---
  // 단순히 최신 정보를 긁어오는 역할만 수행
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
    // 1. Retrieval (Vector Search) - 내 데이터 찾기
    const queryEmbedding = await this.generateEmbedding(query);
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

    // Format Internal Context
    const internalContext = topChunks.map(item => `
[Source: ${item.source.title} (${item.source.date})]
${item.chunk.text}
    `).join('\n\n');

    const uniqueSources = Array.from(new Set(topChunks.map(tc => JSON.stringify({
      title: tc.source.title,
      url: tc.source.url,
      date: tc.source.date,
      type: tc.source.type
    })))).map(s => JSON.parse(s));

    // 2. Fetch Web Info (병렬로 실행하지 않고 순차적으로 데이터 확보)
    // 사용자가 '최신 정보'를 원할 수 있으므로 항상 검색 정보를 가져옵니다.
    const webResult = await this.fetchWebInfo(query);

    // 3. Final Synthesis (통합 답변 생성)
    // 사용자의 systemInstruction이 답변의 구조와 형태를 완전히 결정하도록 프롬프트를 구성합니다.
    const finalPrompt = `
[Task]
Answer the user's question based on the provided "Internal Database" and "Latest Web Search Info".
Follow the [System Instruction] strictly for tone, style, and structure.

[System Instruction / Persona]
${systemInstruction}

[Internal Database (User's Verified Content)]
${internalContext}

[Latest Web Search Info (For Cross-checking)]
${webResult.text}

[User Question]
${query}

[Rules]
1. If the System Instruction asks for a specific format (e.g., table, list, comparison), follow it.
2. If there is a conflict between Internal DB and Web Search (e.g., prices), explicitly mention it unless instructed otherwise.
3. Cite internal sources as [Title](URL) if possible.
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
