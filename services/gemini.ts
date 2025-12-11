import { GoogleGenerativeAI } from "@google/generative-ai";
import { DebugSnippet } from "../types";
import { supabase } from "./supabase";

const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = "gemini-2.0-flash-exp";

// Fix: Remove trailing slash safely
// @ts-ignore
const RAW_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/$/, "");

export type SearchMode = 'rag' | 'full-text' | 'file-api';

export class GeminiService {
  private ai: GoogleGenerativeAI;

  constructor() {
    // @ts-ignore
    const apiKey = import.meta.env.VITE_API_KEY || process.env.API_KEY || '';
    this.ai = new GoogleGenerativeAI(apiKey);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
        const model = this.ai.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent(text.replace(/\n/g, " "));
        return result.embedding?.values || [];
    } catch (error) {
        console.error("Embedding Error:", error);
        return [];
    }
  }

  private async fetchWebInfo(query: string) {
    try {
      const model = this.ai.getGenerativeModel({
        model: CHAT_MODEL,
        tools: [{ googleSearchRetrieval: {} }]  // ✅ 수정: googleSearch → googleSearchRetrieval
      });
      
      const result = await model.generateContent(`Search web for: "${query}"`);
      const response = result.response;
      
      // ✅ 수정: groundingChunks → groundingChuncks (typo가 실제 API 스펙)
      const chunks = (response as any).candidates?.[0]?.groundingMetadata?.groundingChuncks || [];
      const sources = chunks.map((c: any) => 
        c.web ? { 
          title: c.web.title || "Web Result", 
          url: c.web.uri || "#" 
        } : null
      ).filter(Boolean);
      
      return { 
        text: response.text() || "", 
        sources 
      };
    } catch (e) {
      console.error("Web search error:", e);
      return { text: "", sources: [] };
    }
  }

  async getAnswer(
      query: string, 
      systemInstruction: string, 
      useWebSearch: boolean, 
      mode: SearchMode = 'rag'
    ): Promise<{ answer: string; sources: any[]; webSources: any[]; debugSnippets: DebugSnippet[]; }> {
    
    // SERVER MODES
    if ((mode === 'full-text' || mode === 'file-api') && BACKEND_URL) {
      const endpoint = '/api/chat';  // ✅ 통일된 엔드포인트
      try {
        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, systemInstruction, useWebSearch })
        });
        if (!res.ok) throw new Error("Server Failed");
        const data = await res.json();
        return {
          answer: data.answer,
          sources: data.sources || [],
          webSources: data.webSources || [],
          debugSnippets: []
        };
      } catch (err) {
        console.error("Server connection error:", err);
        return { 
          answer: `❌ 서버 연결 실패 (${BACKEND_URL}). 관리자에게 문의하세요.`, 
          sources: [], 
          webSources: [], 
          debugSnippets: [] 
        };
      }
    }

    // CLIENT RAG MODE (Fallback/Standard)
    let vectorDocs: any[] = [];
    let keywordDocs: any[] = [];
    
    // 1. Vector
    try {
        const emb = await this.generateEmbedding(query);
        const { data } = await supabase.rpc('match_documents', { 
          query_embedding: emb, 
          match_threshold: 0.0, 
          match_count: 100 
        });
        if (data) vectorDocs = data;
    } catch(e) {
      console.error("Vector search error:", e);
    }

    // 2. Keyword
    try {
        const kws = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1).slice(0, 5);
        if (kws.length > 0) {
            const cond = kws.map(k => `metadata->>title.ilike.%${k}%,content.ilike.%${k}%`).join(',');
            const { data } = await supabase.from('documents').select('id,content,metadata').or(cond).limit(50);
            if(data) keywordDocs = data;
        }
    } catch(e) {
      console.error("Keyword search error:", e);
    }

    // Merge
    const combined = new Map();
    [...vectorDocs, ...keywordDocs].forEach(d => combined.set(d.id, { ...d, baseScore: d.similarity || 0.5 }));
    let docs = Array.from(combined.values());
    
    // Rank
    const qLower = query.toLowerCase();
    docs = docs.map((d: any) => {
        let score = d.baseScore;
        const title = d.metadata?.title || "";
        if (title.toLowerCase().includes(qLower)) score += 10;
        return { ...d, score };
    }).sort((a,b) => b.score - a.score).slice(0, 25);

    // Prepare Sources with defaults
    const sources = Array.from(new Set(docs.map((d: any) => JSON.stringify({ 
        title: d.metadata?.title || "Untitled",
        url: d.metadata?.url || "#",
        date: d.metadata?.date || "",
        type: d.metadata?.type || "BLOG"
    })))).map((s: any, i) => ({ ...JSON.parse(s), index: i + 1 }));

    const sourceMap = new Map(sources.map((s: any) => [s.url||s.title, s.index]));
    
    const context = docs.map((d: any) => {
        const meta = d.metadata || {};
        const key = meta.url || meta.title || "unknown";
        const idx = sourceMap.get(key) || "?";
        return `[Source ID: ${idx}]\n${d.content}`;
    }).join('\n\n');

    // Web search
    let webResult: { text: string; sources: any[] } = { text: "", sources: [] };
    if (useWebSearch) {
      webResult = await this.fetchWebInfo(query);
    }

    const prompt = `${systemInstruction}

[RULES]
1. Use Emojis in headers (## 🏰).
2. Citation: [[1]].
3. Blue links.

[CONTEXT]
${context}
${webResult.text}

[QUESTION]
${query}`;

    try {
      const model = this.ai.getGenerativeModel({ model: CHAT_MODEL });
      const result = await model.generateContent(prompt);
      const response = result.response;
      
      return {
        answer: response.text(),
        sources,
        webSources: webResult.sources,
        debugSnippets: docs.map((d: any) => ({ 
          score: d.score, 
          text: d.content.substring(0, 200), 
          sourceTitle: d.metadata?.title || "Unknown" 
        }))
      };
    } catch (error) {
      console.error("Generation error:", error);
      return {
        answer: "❌ 답변 생성 중 오류가 발생했습니다.",
        sources,
        webSources: webResult.sources,
        debugSnippets: []
      };
    }
  }
}
