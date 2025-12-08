import { GoogleGenAI } from "@google/genai";
import { DebugSnippet } from "../types";
import { supabase } from "./supabase";

// Model constants
const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = "gemini-2.5-flash";

// Check if Backend URL is configured
// @ts-ignore
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export type SearchMode = 'rag' | 'full-text' | 'file-api';

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
        return result.embeddings?.[0]?.values || [];
    } catch (error) {
        console.error("Embedding Error:", error);
        throw error;
    }
  }

  private async fetchWebInfo(query: string): Promise<{ text: string; sources: any[] }> {
    try {
      const response = await this.ai.models.generateContent({
        model: CHAT_MODEL,
        contents: `Search the web for the latest information regarding: "${query}". Focus on prices, operating hours, and recent reviews.`,
        config: { tools: [{ googleSearch: {} }] },
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const webSources = groundingChunks
        .map((chunk: any) => chunk.web ? { title: chunk.web.title, url: chunk.web.uri } : null)
        .filter((item: any) => item !== null);

      return { text: response.text || "웹 검색 불가", sources: webSources };
    } catch (e) {
      console.error("Web Search Error", e);
      return { text: "(웹 검색 실패)", sources: [] };
    }
  }

  async getAnswer(
      query: string, 
      systemInstruction: string, 
      useWebSearch: boolean, 
      mode: SearchMode = 'rag'
    ): Promise<{ 
    answer: string; 
    sources: any[];
    webSources: any[];
    debugSnippets: DebugSnippet[]; 
  }> {
    
    // [🚀 SERVER-SIDE: File API & Full Text]
    if ((mode === 'full-text' || mode === 'file-api') && BACKEND_URL) {
      const endpoint = mode === 'file-api' ? '/api/chat/file-api' : '/api/chat/full-context';
      try {
        console.log(`🚀 Requesting Server Mode: ${mode}`);
        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, systemInstruction, useWebSearch })
        });
        
        if (!res.ok) throw new Error("Server Error");
        const data = await res.json();
        
        return {
          answer: data.answer,
          sources: data.sources || [],
          webSources: data.webSources || [],
          debugSnippets: [{ score: 100, text: `Processed ${data.docCount} docs via ${mode === 'file-api' ? 'Google File API' : 'Full Text Injection'}`, sourceTitle: `SERVER MODE: ${mode.toUpperCase()}` }]
        };
      } catch (err) {
        console.warn("Server request failed", err);
        return { answer: "서버 연결 실패. 관리자에게 문의하세요.", sources: [], webSources: [], debugSnippets: [] };
      }
    }

    // [⚡ CLIENT-SIDE: Hybrid RAG]
    let vectorDocs: any[] = [];
    let keywordDocs: any[] = [];
    
    // 1. Vector Search
    try {
        const queryEmbedding = await this.generateEmbedding(query);
        const { data } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.0, 
            match_count: 100 
        });
        if (data) vectorDocs = data;
    } catch (e) { console.error("Vector Error", e); }

    // 2. Keyword Search
    try {
        const keywords = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1);
        const targetKeywords = keywords.sort((a,b) => b.length - a.length).slice(0, 5);
        if (targetKeywords.length > 0) {
            const conditions = targetKeywords.map(k => `metadata->>title.ilike.%${k}%,content.ilike.%${k}%`).join(',');
            const { data } = await supabase.from('documents').select('id, content, metadata').or(conditions).limit(50);
            if (data) keywordDocs = data;
        }
    } catch (e) { console.error("Keyword Error", e); }

    // 3. Merge & Rerank
    const combinedDocsMap = new Map();
    vectorDocs.forEach(doc => combinedDocsMap.set(doc.id, { ...doc, baseScore: doc.similarity }));
    keywordDocs.forEach(doc => {
        if (!combinedDocsMap.has(doc.id)) combinedDocsMap.set(doc.id, { ...doc, baseScore: 0.5 });
    });

    let allDocs = Array.from(combinedDocsMap.values());
    const keywords = query.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 1);
    const now = new Date();

    allDocs = allDocs.map((doc: any) => {
        let bonusScore = 0;
        const title = (doc.metadata.title || '').toLowerCase();
        const content = (doc.content || '').toLowerCase();
        
        keywords.forEach(keyword => {
            const k = keyword.toLowerCase();
            if (title.includes(k)) bonusScore += 10.0; 
            const count = content.split(k).length - 1;
            if (count > 0) bonusScore += (count * 0.5); 
        });

        if (doc.metadata.date) {
            const diffDays = Math.ceil(Math.abs(now.getTime() - new Date(doc.metadata.date).getTime()) / (1000 * 3600 * 24));
            if (diffDays <= 180) bonusScore += 3.0;
            else if (diffDays <= 365) bonusScore += 1.0;
        }
        return { ...doc, finalScore: (doc.baseScore || 0) + bonusScore };
    });

    allDocs.sort((a: any, b: any) => b.finalScore - a.finalScore);
    const finalDocs = allDocs.slice(0, 25);

    // Prepare unique sources with index for client-side citation
    const uniqueSources = Array.from(new Set(finalDocs.map((doc: any) => JSON.stringify({
      title: doc.metadata.title,
      url: doc.metadata.url,
      date: doc.metadata.date,
      type: doc.metadata.type
    })))).map((s: any, idx) => ({ ...JSON.parse(s), index: idx + 1 }));

    // Create a map for the prompt
    const sourceMap = new Map();
    uniqueSources.forEach(s => sourceMap.set(s.url || s.title, s.index));

    const internalContext = finalDocs.map((doc: any) => {
        const idx = sourceMap.get(doc.metadata.url || doc.metadata.title) || '?';
        return `
[Source ID: ${idx}]
[Title: ${doc.metadata.title}]
[Date: ${doc.metadata.date}]
[URL: ${doc.metadata.url}]
${doc.content}
    `}).join('\n\n');

    // Fix: Explicitly type webResult to resolve TS2322
    let webResult: { text: string; sources: any[] } = { text: "Web Search Disabled", sources: [] };
    if (useWebSearch) webResult = await this.fetchWebInfo(query);

    const finalPrompt = `
${systemInstruction}

[STRICT OUTPUT RULES]
1. **Citation Style**: Use inline citations [[1]], [[2]]. Do NOT use [Title](URL).
   - Match the [Source ID: X] provided in the context.
2. **No Duplication**: Do NOT repeat the database section content in the cross-check section.
3. **Markdown Only**: NO HTML tags.
4. **No Reference List**: Do NOT list references at the bottom.

[CONTEXT 1: My Database (Primary Source)]
${internalContext}

[CONTEXT 2: Web Search]
${useWebSearch ? webResult.text : "Disabled"}

[QUESTION]
${query}
`;

    const response = await this.ai.models.generateContent({
      model: CHAT_MODEL,
      contents: finalPrompt,
    });

    return {
      answer: response.text || "No answer generated.",
      sources: uniqueSources,
      webSources: webResult.sources,
      debugSnippets: finalDocs.map((doc: any) => ({ score: doc.finalScore, text: doc.content, sourceTitle: doc.metadata.title }))
    };
  }
}
