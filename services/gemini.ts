
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
    
    // Safety check for empty text
    if (!cleanText.trim()) return [];

    try {
        const result = await this.ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: cleanText,
        });

        // Handle potential array structure in response safely with optional chaining
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

  // --- Step 1: RAG Answer (Based ONLY on internal DB) ---
  private async getRAGResponse(query: string, contextText: string): Promise<string> {
    const prompt = `
You are the AI assistant for "Cheolsan Land".
Answer the user's question using **ONLY** the provided context below.
Do not use outside knowledge yet.

Context Information:
${contextText}

Instructions:
1. Answer in Korean (Polite/Honorific).
2. Be very detailed.
3. Strictly cite sources using the format: [Title](URL).
4. If the context has YouTube timestamps, include them: [Title @ 02:30](URL).
5. If the answer is NOT in the context, explicitly say: "제 데이터베이스에는 관련 정보가 없습니다."

User Question: ${query}
    `;

    const response = await this.ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
    });
    
    return response.text || "답변을 생성할 수 없습니다.";
  }

  // --- Step 2: Web Search Answer (Latest Info) ---
  private async getWebSearchResponse(query: string): Promise<{ text: string; sources: any[] }> {
    try {
      const response = await this.ai.models.generateContent({
        model: CHAT_MODEL,
        contents: `Search the web for the latest information regarding: "${query}". Provide a summary of the most current details, especially prices and dates.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      // Extract grounding metadata (sources)
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
      return { text: "최신 정보를 검색하는 도중 오류가 발생했습니다.", sources: [] };
    }
  }

  // --- Step 3: Cross Check (Comparison) ---
  private async getComparisonResponse(query: string, ragText: string, webText: string): Promise<string> {
    const prompt = `
Act as a Fact-Checker for "Cheolsan Land".
Compare the following two pieces of information regarding the user's question: "${query}".

[Info A: Internal Database (Older but verified by owner)]
${ragText}

[Info B: Latest Web Search]
${webText}

Instructions:
1. Identify discrepancies in **Prices**, **Dates**, or **Operational Status**.
2. If Info B (Latest) is different from Info A, explicitly warn the user. (e.g., "데이터베이스에는 1000엔으로 되어있으나, 최신 검색 결과 1200엔으로 인상된 것으로 보입니다.")
3. If they match, confirm that the information is still valid.
4. Keep it concise. Korean language.

Output format:
- 💰 가격/비용 체크: ...
- 📅 최신 정보 업데이트: ...
- ✅ 결론: ...
    `;

    const response = await this.ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
    });

    return response.text || "비교 분석을 완료할 수 없습니다.";
  }

  // --- Main Orchestrator ---
  async getAnswer(query: string, sources: KnowledgeSource[]): Promise<{ 
    ragAnswer: string; 
    webAnswer: string; 
    comparisonAnswer: string; 
    sources: any[];
    webSources: any[];
    debugSnippets: DebugSnippet[]; // New return field
  }> {
    // 1. Retrieval (Vector Search)
    const queryEmbedding = await this.generateEmbedding(query);
    const allChunks: { chunk: ContentChunk; source: KnowledgeSource; score: number }[] = [];

    // Calculate similarity for all chunks
    sources.forEach(source => {
      source.chunks.forEach(chunk => {
        if (chunk.embedding && chunk.embedding.length > 0) {
          const score = cosineSimilarity(queryEmbedding, chunk.embedding);
          allChunks.push({ chunk, source, score });
        }
      });
    });

    // Sort by score (descending)
    allChunks.sort((a, b) => b.score - a.score);
    const topChunks = allChunks.slice(0, 10); // Top 10 contexts
    
    // Prepare Debug Snippets
    const debugSnippets: DebugSnippet[] = topChunks.map(item => ({
      score: item.score,
      text: item.chunk.text,
      sourceTitle: item.source.title
    }));

    // Format Context for RAG
    const contextText = topChunks.map(item => `
[Source: ${item.source.title} (${item.source.date})]
${item.chunk.text}
    `).join('\n\n');

    const uniqueSources = Array.from(new Set(topChunks.map(tc => JSON.stringify({
      title: tc.source.title,
      url: tc.source.url,
      date: tc.source.date,
      type: tc.source.type
    })))).map(s => JSON.parse(s));

    // Execute Step 1, 2 in parallel to save time, then Step 3
    const [ragAnswer, webResult] = await Promise.all([
      this.getRAGResponse(query, contextText),
      this.getWebSearchResponse(query)
    ]);

    // Execute Step 3
    const comparisonAnswer = await this.getComparisonResponse(query, ragAnswer, webResult.text);

    return {
      ragAnswer,
      webAnswer: webResult.text,
      comparisonAnswer,
      sources: uniqueSources,
      webSources: webResult.sources,
      debugSnippets // Return debug info
    };
  }
}
