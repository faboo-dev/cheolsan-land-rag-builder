import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// --- Configuration Check & Initialization ---
console.log("Starting Cheolsan Land Server...");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_KEY = process.env.API_KEY;

let supabase = null;
let ai = null;

// 1. Check Supabase
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ CRITICAL: Supabase URL or Key is MISSING in environment variables.");
} else {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("✅ Supabase Client Initialized.");
  } catch (err) {
    console.error("❌ Failed to initialize Supabase:", err.message);
  }
}

// 2. Check Gemini
if (!API_KEY) {
  console.error("❌ CRITICAL: Google API_KEY is MISSING in environment variables.");
} else {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.log("✅ Gemini Client Initialized.");
  } catch (err) {
    console.error("❌ Failed to initialize Gemini:", err.message);
  }
}

// --- Helper: Web Search ---
async function fetchWebInfo(query) {
  if (!ai) return { text: "", sources: [] };
  try {
    console.log(`[Server] Performing Web Search for: ${query}`);
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Search the web for the latest information regarding: "${query}". Focus on prices, operating hours, and recent reviews.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const webSources = groundingChunks
      .map((chunk) => chunk.web ? { title: chunk.web.title, url: chunk.web.uri } : null)
      .filter((item) => item !== null);

    return {
      text: response.text || "웹 검색 결과를 가져올 수 없습니다.",
      sources: webSources
    };
  } catch (e) {
    console.error("[Server] Web Search Error", e);
    return { text: "(웹 검색 실패 - 데이터베이스 정보로만 답변합니다)", sources: [] };
  }
}

// --- Routes ---

app.get('/', (req, res) => {
  const status = {
    status: 'running',
    supabase: !!supabase ? 'connected' : 'disconnected',
    gemini: !!ai ? 'connected' : 'disconnected'
  };
  res.json(status);
});

// 🔥 Full Context Chat Endpoint
app.post('/api/chat/full-context', async (req, res) => {
  try {
    // Safety Check
    if (!supabase || !ai) {
      console.error("Request failed: Server is not properly configured.");
      return res.status(500).json({ 
        error: 'Server configuration error. Check logs for missing API Keys.',
        details: {
            supabase: !!supabase,
            gemini: !!ai
        }
      });
    }

    const { query, systemInstruction, useWebSearch } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`[Full Context] Processing query: ${query.substring(0, 50)}...`);

    // 1. Fetch ALL documents from Supabase
    // Supabase JS limit bumped to 10000 to catch everything
    const { data: documents, error } = await supabase
      .from('documents')
      .select('content, metadata')
      .limit(10000);

    if (error) throw error;

    const docCount = documents ? documents.length : 0;
    console.log(`[Full Context] Fetched ${docCount} documents.`);

    if (docCount === 0) {
        return res.json({ answer: "데이터베이스에 저장된 내용이 없습니다.", docCount: 0, sources: [], webSources: [] });
    }

    // 2. Prepare Context String & Extract Sources
    const contextText = documents.map(doc => `
[Title: ${doc.metadata.title}]
[Date: ${doc.metadata.date}]
[Content]: ${doc.content}
`).join('\n\n');

    // Extract unique sources for UI buttons
    const uniqueSourcesMap = new Map();
    documents.forEach(doc => {
        const meta = doc.metadata;
        // Use URL as key for uniqueness, fallback to title
        const key = meta.url || meta.title; 
        if (key && !uniqueSourcesMap.has(key)) {
            uniqueSourcesMap.set(key, {
                title: meta.title,
                url: meta.url,
                date: meta.date,
                type: meta.type
            });
        }
    });
    const sources = Array.from(uniqueSourcesMap.values());

    // 3. Web Search (Optional)
    let webContext = "";
    let webSources = [];
    
    if (useWebSearch) {
        const webResult = await fetchWebInfo(query);
        webContext = `
[CONTEXT 2: Web Search (For Cross-Check)]
* Use this for "## 🌐 최신 AI 검색 크로스체크".
* **OBJECTIVE:** Validate info and find latest prices.
${webResult.text}
`;
        webSources = webResult.sources;
    }

    // 4. Construct Prompt
    const finalPrompt = `
${systemInstruction}

[NEGATIVE CONSTRAINTS - STRICTLY ENFORCED]
1. DO NOT use HTML tags like <div>, <table>, <span>, <br>. Use ONLY standard Markdown.
2. **DO NOT generate a 'Reference List', 'Bibliography', or 'Sources' list at the bottom of your response.** 
   (The UI handles this separately).
3. Only provide **INLINE citations** (e.g., [Title](URL)) within the sentences.

[SYSTEM NOTICE]
You are operating in "FULL CONTEXT MODE". 
You have been provided with the ENTIRE database of Cheolsan Land below.
Your job is to read EVERYTHING and answer the user's question accurately.

[CONTEXT 1: Full Database (The Truth)]
${contextText}

${webContext}

[USER QUESTION]
${query}

[Format Guide]
1. Start with "## 🏰 철산랜드 데이터베이스".
2. If Context 2 (Web Search) exists, add "## 🌐 최신 AI 검색 크로스체크" section.
3. Convert timestamps (02:30) to links: [Title @ 02:30](URL&t=150).
`;

    // 5. Call Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: finalPrompt,
    });

    // 6. Send back response
    res.json({ 
      answer: response.text, 
      docCount: docCount,
      sources: sources,
      webSources: webSources
    });

  } catch (error) {
    console.error('[Server Request Error]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
