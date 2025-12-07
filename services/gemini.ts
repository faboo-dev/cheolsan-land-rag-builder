
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

  // --- Main Orchestrator ---
  async getAnswer(
      query: string, 
      systemInstruction: string, 
      useWebSearch: boolean, 
      useFullContext: boolean = false
    ): Promise<{ 
    answer: string; 
    sources: any[];
    webSources: any[];
    debugSnippets: DebugSnippet[]; 
  }> {
    
    let finalDocs: any[] = [];
    
    if (useFullContext) {
        // [🔥 Full Context Mode] Fetch ALL documents without filtering
        // CRITICAL FIX: Supabase defaults to 1000 rows. We MUST increase the limit.
        try {
            const { data, error } = await supabase
                .from('documents')
                .select('id, content, metadata')
                .limit(10000); // Increase limit to 10,000 chunks to ensure full coverage
            
            if (!error && data) {
                // We treat all docs as "relevant" in this mode
                finalDocs = data.map(doc => ({
                    ...doc,
                    finalScore: 100 // Arbitrary high score since we force inclusion
                }));
                console.log(`[Full Context] Loaded ${finalDocs.length} chunks.`);
            }
        } catch (e) {
            console.error("Full Context Fetch Error", e);
        }
    } else {
        // [⚡ Hybrid RAG Mode] (Original Logic)
        let vectorDocs: any[] = [];
        let keywordDocs: any[] = [];
        
        // 1. Vector Search
        try {
            const queryEmbedding = await this.generateEmbedding(query);
            // RPC might still have internal limits, but match_count controls return size
            const { data: documents, error } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.0, 
                match_count: 100 // Fetch widely first
            });
            if (!error && documents) vectorDocs = documents;
        } catch (e) {
            console.error("Vector search failed", e);
        }

        // 2. Keyword Search (Hybrid)
        try {
            // Extract keywords (length > 1)
            const keywords = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1);
            // Use top 5 keywords
            const targetKeywords = keywords.sort((a,b) => b.length - a.length).slice(0, 5);

            if (targetKeywords.length > 0) {
                // Construct a query that searches for ANY of the keywords in title OR content
                // Note: We also need to increase limit here just in case
                const conditions = targetKeywords.map(k => `metadata->>title.ilike.%${k}%,content.ilike.%${k}%`).join(',');
                const { data: kDocs, error: kError } = await supabase
                    .from('documents')
                    .select('id, content, metadata') 
                    .or(conditions)
                    .limit(100); // Increase specific keyword fetch limit
                if (!kError && kDocs) keywordDocs = kDocs;
            }
        } catch (e) {
            console.error("Keyword search failed", e);
        }

        // 3. Merge & Deduplicate
        const combinedDocsMap = new Map();
        vectorDocs.forEach(doc => {
            combinedDocsMap.set(doc.id, { ...doc, origin: 'vector', baseScore: doc.similarity });
        });
        keywordDocs.forEach(doc => {
            if (!combinedDocsMap.has(doc.id)) {
                // If existing, boost score. If new, add with base score.
                const existing = combinedDocsMap.get(doc.id);
                if (existing) {
                    existing.baseScore += 0.2; // Keyword match bonus on top of vector
                } else {
                    combinedDocsMap.set(doc.id, { ...doc, origin: 'keyword', baseScore: 0.5 });
                }
            }
        });

        let allDocs = Array.from(combinedDocsMap.values());

        // 4. Reranking (The most important step)
        const keywords = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1);
        const now = new Date();

        allDocs = allDocs.map((doc: any) => {
            let bonusScore = 0;
            const title = (doc.metadata.title || '').toLowerCase();
            const content = (doc.content || '').toLowerCase();
            
            keywords.forEach(keyword => {
                const k = keyword.toLowerCase();
                // [Title Match] Massive Boost -> Force to top
                if (title.includes(k)) bonusScore += 10.0; 
                
                // [Content Frequency] +0.5 per occurrence
                const count = content.split(k).length - 1;
                if (count > 0) bonusScore += (count * 0.5); 
            });

            // [Recency Boost]
            if (doc.metadata.date) {
                const docDate = new Date(doc.metadata.date);
                const diffTime = Math.abs(now.getTime() - docDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 180) bonusScore += 3.0; // Within 6 months
                else if (diffDays <= 365) bonusScore += 1.0; // Within 1 year
            }

            return { ...doc, finalScore: (doc.baseScore || 0) + bonusScore };
        });

        // Sort descending
        allDocs.sort((a: any, b: any) => b.finalScore - a.finalScore);
        
        // Smart Cutoff: Top 25
        finalDocs = allDocs.slice(0, 25);
    }
    
    // Debug Data
    const debugSnippets: DebugSnippet[] = finalDocs.map((doc: any) => ({
      score: doc.finalScore, 
      text: doc.content,
      sourceTitle: `[${doc.finalScore.toFixed(1)}] ${doc.metadata.title} (${doc.metadata.date})`
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

    // Web Search
    let webResult: { text: string; sources: any[] } = { text: "Web Search is Disabled by User.", sources: [] };
    if (useWebSearch) {
        webResult = await this.fetchWebInfo(query);
    }

    // Final Synthesis Prompt
    const finalPrompt = `
${systemInstruction}

[NEGATIVE CONSTRAINTS - STRICTLY ENFORCED]
1. DO NOT use HTML tags like <div>, <table>, <span>, <br>. Use ONLY standard Markdown.
2. **DO NOT generate a 'Reference List', 'Bibliography', or 'Sources' list at the bottom of your response.** 
   (e.g., Do NOT output "참고 자료:", "출처:", "References" section at the end. This is handled by the UI).
3. Only provide **INLINE citations** (e.g., [Title](URL)) within the sentences immediately after the fact.
4. DO NOT add filler text like "Okay, here is the info". Start directly with the header.

[CONTEXT 1: My Database (The Truth)]
* Use this for "## 🏰 철산랜드 데이터베이스".
* **This is the Primary Source.**
* **If the answer is found here, provide EXTREME DETAIL.**
* Mode: ${useFullContext ? "FULL CONTEXT (Reading ALL Data)" : "RAG (Retrieved Data)"}
${internalContext}

[CONTEXT 2: Web Search (For Cross-Check)]
* Use this for "## 🌐 최신 AI 검색 크로스체크".
* Status: ${useWebSearch ? "Active" : "Disabled"}
* **OBJECTIVE OF THIS SECTION:**
  1. **Validate** if the info in 'My Database' is still correct (e.g., "Is this restaurant still open?").
  2. **Find Prices** or details if 'My Database' is missing them or they are outdated.
${webResult.text}

[User Question]
${query}

[Format Guide]
1. Start with "## 🏰 철산랜드 데이터베이스".
2. If Context 2 is Active (Web Search ON), add "## 🌐 최신 AI 검색 크로스체크" section at the end.
3. Convert timestamps (02:30) to links: [Title @ 02:30](URL&t=150).
4. **STOP** immediately after the last sentence. NO footer lists.
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
