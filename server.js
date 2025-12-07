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

    const { query, systemInstruction } = req.body;

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
        return res.json({ answer: "데이터베이스에 저장된 내용이 없습니다.", docCount: 0 });
    }

    // 2. Prepare Context String
    const contextText = documents.map(doc => `
[Title: ${doc.metadata.title}]
[Date: ${doc.metadata.date}]
[Content]: ${doc.content}
`).join('\n\n');

    // 3. Construct Prompt
    const finalPrompt = `
${systemInstruction}

[SYSTEM NOTICE]
You are operating in "FULL CONTEXT MODE". 
You have been provided with the ENTIRE database of Cheolsan Land below.
Your job is to read EVERYTHING and answer the user's question accurately.
Do NOT use HTML tags. Use Markdown.

[FULL DATABASE CONTEXT]
${contextText}

[USER QUESTION]
${query}
`;

    // 4. Call Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: finalPrompt,
    });

    // 5. Send back response
    res.json({ 
      answer: response.text, 
      docCount: docCount
    });

  } catch (error) {
    console.error('[Server Request Error]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
