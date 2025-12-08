import { GoogleGenAI } from "@google/genai";
import { DebugSnippet } from "../types";
import { supabase } from "./supabase";

const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = "gemini-2.5-flash";

// Fix: Remove trailing slash safely
// @ts-ignore
const RAW_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/$/, "");

export type SearchMode = 'rag' | 'full-text' | 'file-api';

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // @ts-ignore
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
        const result = await this.ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: text.replace(/\n/g, " "),
        });
        return result.embeddings?.[0]?.values || [];
    } catch (error) {
        console.error("Embedding Error:", error);
        return [];
    }
  }

  private async fetchWebInfo(query: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: CHAT_MODEL,
        contents: `Search web for: "${query}"`,
        config: { tools: [{ googleSearch: {} }] },
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks.map((c: any) => c.web ? { title: c.web.title || "Web Result", url: c.web.uri || "#" } : null).filter(Boolean);
      return { text: response.text || "", sources };
    } catch (e) {
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
      const endpoint = mode === 'file-api' ? '/api/chat/file-api' : '/api/chat/full-context';
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
        return { answer: "❌ 서버 연결 실패. 관리자에게 문의하세요.", sources: [], webSources: [], debugSnippets: [] };
      }
    }

    // CLIENT RAG MODE (Fallback/Standard)
    let vectorDocs: any[] = [];
    let keywordDocs: any[] = [];
    
    // 1. Vector
    try {
        const emb = await this.generateEmbedding(query);
        const { data } = await supabase.rpc('match_documents', { query_embedding: emb, match_threshold: 0.0, match_count: 100 });
        if (data) vectorDocs = data;
    } catch(e) {}

    // 2. Keyword
    try {
        const kws = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1).slice(0, 5);
        if (kws.length > 0) {
            const cond = kws.map(k => `metadata->>title.ilike.%${k}%,content.ilike.%${k}%`).join(',');
            const { data } = await supabase.from('documents').select('id,content,metadata').or(cond).limit(50);
            if(data) keywordDocs = data;
        }
    } catch(e) {}

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

    // Fix TS Error: Explicit type
    let webResult: { text: string; sources: any[] } = { text: "", sources: [] };
    if (useWebSearch) webResult = await this.fetchWebInfo(query);

    const prompt = `
${systemInstruction}
[RULES]
1. Use Emojis in headers (## 🏰).
2. Citation: [[1]].
3. Blue links.

[CONTEXT]
${context}
${webResult.text}

[QUESTION]
${query}
`;
    const response = await this.ai.models.generateContent({ model: CHAT_MODEL, contents: prompt });
    return {
        answer: response.text,
        sources,
        webSources: webResult.sources,
        debugSnippets: docs.map((d: any) => ({ score: d.score, text: d.content, sourceTitle: d.metadata?.title || "Unknown" }))
    };
  }
}
