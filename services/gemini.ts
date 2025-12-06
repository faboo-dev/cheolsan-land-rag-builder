
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
Answer the user's question by synthesizing the "Internal Database" and "Latest Web Search Info".
Follow the [System Instruction] strictly.

[System Instruction / Persona]
${systemInstruction}

[NEGATIVE CONSTRAINTS - STRICTLY ENFORCED]
1. NO FILLER TEXT: Do NOT start with "Okay", "Here is", "Based on", "Sure", or "I found". Start DIRECTLY with the content (e.g., Header, Table, or Answer Text).
2. NO SEPARATORS: Do NOT use horizontal rules like "---" or "***" at the beginning or end.
3. NO HTML: Do NOT use <div>, <span>, <br>, or <table> tags.
4. NO JSON DUMPS: Do not output raw JSON data.

[CRITICAL FORMATTING RULES]
1. **Markdown Only**: Use standard Markdown syntax.
2. **Clickable Links (MANDATORY)**:
   - When you mention a source, you MUST create a standard Markdown link: \`[Link Title](URL)\`.
   - NEVER provide a title without the URL.
   - Example: "Check this post: [My Blog Post](https://blog.naver.com/...)"
3. **YouTube Timestamp Logic**:
   - If the context mentions a specific time (e.g., "at 02:30"), you MUST calculate the seconds (2*60+30 = 150) and append \`&t=150\` to the YouTube URL.
   - Example: "In the video [Review @ 02:30](https://youtu.be/xyz?t=150)..."
4. **Tables**: Use Markdown tables for comparisons. (e.g. \`| Col1 | Col2 |\`)

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
