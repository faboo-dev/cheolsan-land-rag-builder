
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
  async getAnswer(query: string, systemInstruction: string, useWebSearch: boolean): Promise<{ 
    answer: string; 
    sources: any[];
    webSources: any[];
    debugSnippets: DebugSnippet[]; 
  }> {
    // 1. [Dual Retrieval Strategy]
    // Strategy A: Vector Search (The Net) - Captures semantic meaning
    // Strategy B: Keyword Search (The Harpoon) - Captures exact terms even if vector score is low

    let vectorDocs: any[] = [];
    let keywordDocs: any[] = [];

    // --- Execution A: Vector Search ---
    try {
        const queryEmbedding = await this.generateEmbedding(query);
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.0, 
            match_count: 50 // Fetch top 50 semantically similar docs
        });
        if (!error && documents) vectorDocs = documents;
    } catch (e) {
        console.error("Vector search failed", e);
    }

    // --- Execution B: Keyword Search (Direct DB Query) ---
    try {
        // Extract meaningful keywords (length > 1) to fire the harpoon
        const keywords = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1);
        
        // Pick top 3 longest keywords to avoid overly broad queries (e.g. searching for "the")
        const targetKeywords = keywords.sort((a,b) => b.length - a.length).slice(0, 3);

        if (targetKeywords.length > 0) {
            // Create an OR filter for Title or Content containing the keyword
            // Syntax: column.ilike.%keyword%
            const conditions = targetKeywords.map(k => `metadata->>title.ilike.%${k}%,content.ilike.%${k}%`).join(',');
            
            const { data: kDocs, error: kError } = await supabase
                .from('documents')
                .select('id, content, metadata') // No similarity score here
                .or(conditions)
                .limit(20); // Force fetch top 20 matches containing keywords
            
            if (!kError && kDocs) keywordDocs = kDocs;
        }
    } catch (e) {
        console.error("Keyword search failed", e);
    }

    // --- Merge & Deduplicate ---
    // Combine results from both strategies. Use a Map to remove duplicates by ID.
    const combinedDocsMap = new Map();

    // Add Vector Results (They have similarity scores)
    vectorDocs.forEach(doc => {
        combinedDocsMap.set(doc.id, { ...doc, origin: 'vector', baseScore: doc.similarity });
    });

    // Add Keyword Results (They don't have similarity, so we give them a base score of 0.5)
    keywordDocs.forEach(doc => {
        if (!combinedDocsMap.has(doc.id)) {
            combinedDocsMap.set(doc.id, { ...doc, origin: 'keyword', baseScore: 0.5 });
        }
    });

    let allDocs = Array.from(combinedDocsMap.values());

    // --- Reranking Logic (Hybrid Score) ---
    // Now we apply the "Bonus Points" to strictly order them.
    const keywords = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1);

    allDocs = allDocs.map((doc: any) => {
        let bonusScore = 0;
        const title = (doc.metadata.title || '').toLowerCase();
        const content = (doc.content || '').toLowerCase();
        
        keywords.forEach(keyword => {
            const k = keyword.toLowerCase();
            // [CRITICAL] TITLE MATCH NUCLEAR BOOST (+10.0)
            // If the user asks for "Bohol" and title has "Bohol", this gets +10.0.
            // Vector scores are usually 0.7~0.8. This makes it impossible to beat.
            if (title.includes(k)) {
                bonusScore += 10.0; 
            } 
            // Content Match Boost (+1.0)
            if (content.includes(k)) {
                bonusScore += 1.0;
            }
        });

        return {
            ...doc,
            finalScore: (doc.baseScore || 0) + bonusScore
        };
    });

    // Sort by finalScore descending and take Top 50
    allDocs.sort((a: any, b: any) => b.finalScore - a.finalScore);
    const finalDocs = allDocs.slice(0, 50);
    
    // Debug Data
    const debugSnippets: DebugSnippet[] = finalDocs.map((doc: any) => ({
      score: doc.finalScore, 
      text: doc.content,
      sourceTitle: `[${doc.origin === 'keyword' ? '작살검색' : '유사도'}] ${doc.metadata.title}`
    }));

    // Format Internal Context
    const internalContext = finalDocs.map((doc: any) => `
[ID: ${doc.metadata.sourceId}]
Title: ${doc.metadata.title}
Date: ${doc.metadata.date}
URL: ${doc.metadata.url}
Content: ${doc.content}
    `).join('\n\n');

    const uniqueSources = Array.from(new Set(finalDocs.map((doc: any) => JSON.stringify({
      title: doc.metadata.title,
      url: doc.metadata.url,
      date: doc.metadata.date,
      type: doc.metadata.type
    })))).map((s: any) => JSON.parse(s));

    // 2. Fetch Web Info (Conditional)
    let webResult: { text: string; sources: any[] } = { text: "User did not request web search. Skip the Cross-Check section.", sources: [] };
    
    if (useWebSearch) {
        webResult = await this.fetchWebInfo(query);
    }

    // 3. Final Synthesis
    const finalPrompt = `
${systemInstruction}

[NEGATIVE CONSTRAINTS - STRICTLY ENFORCED]
1. DO NOT use HTML tags like <div>, <table>, <span>, <br>. Use ONLY standard Markdown.
2. **DO NOT generate a 'Reference List', 'Bibliography', or 'Sources' section at the end.** 
3. Only provide **INLINE citations** (e.g., [Title](URL)) within the sentences.
4. DO NOT add filler text like "Okay, here is the info". Start directly with the header.

[CONTEXT 1: My Database (The Truth)]
* Use this for "## 🏰 철산랜드 데이터베이스".
* If specific keywords from the user question appear here, prioritize this data.
${internalContext}

[CONTEXT 2: Web Search (For Cross-Check)]
* Use this for "## 🌐 최신 AI 검색 크로스체크".
* Status: ${useWebSearch ? "Active" : "Disabled"}
${webResult.text}

[User Question]
${query}

[Format Guide]
1. Start with "## 🏰 철산랜드 데이터베이스".
2. If Context 2 is Active (Web Search ON), add "## 🌐 최신 AI 검색 크로스체크" section at the end. If Disabled, SKIP it.
3. Convert timestamps (02:30) to links: [Title @ 02:30](URL&t=150).
4. **STOP** after finishing the content.
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
