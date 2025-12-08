
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Resolve directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware - Allow ALL origins to prevent connection errors
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- Config ---
console.log("Starting Cheolsan Land Server...");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_KEY = process.env.API_KEY;

let supabase = null;
let ai = null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.error("❌ MISSING: Supabase Config");
else supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (!API_KEY) console.error("❌ MISSING: Google API Key");
else ai = new GoogleGenAI({ apiKey: API_KEY });

// --- Helpers ---
async function fetchWebInfo(query) {
  if (!ai) return { text: "", sources: [] };
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Search web for: "${query}". Focus on prices, hours, reviews.`,
      config: { tools: [{ googleSearch: {} }] },
    });
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const webSources = chunks.map(c => c.web ? { title: c.web.title, url: c.web.uri } : null).filter(Boolean);
    return { text: response.text || "No web results.", sources: webSources };
  } catch (e) {
    console.error("Web Search Error", e);
    return { text: "(Web search failed)", sources: [] };
  }
}

function extractSources(documents) {
    const uniqueMap = new Map();
    documents.forEach(doc => {
        const meta = doc.metadata;
        const key = meta.url || meta.title; 
        if (key && !uniqueMap.has(key)) {
            uniqueMap.set(key, { ...meta });
        }
    });
    return Array.from(uniqueMap.values()).map((s, i) => ({ ...s, index: i + 1 }));
}

// --- Routes ---
app.get('/', (req, res) => res.json({ status: 'running', mode: 'Unified Server' }));

// 🔥 MODE 1: Full Context
app.post('/api/chat/full-context', async (req, res) => {
  try {
    if (!supabase || !ai) return res.status(500).json({ error: 'Server config error' });
    const { query, systemInstruction, useWebSearch } = req.body;

    const { data: documents } = await supabase.from('documents').select('content, metadata').limit(10000);
    if (!documents) throw new Error("No documents found");

    const sources = extractSources(documents);
    const sourceMap = new Map(sources.map(s => [s.url || s.title, s.index]));

    const contextText = documents.map(doc => {
        const idx = sourceMap.get(doc.metadata.url || doc.metadata.title) || '?';
        return `[Source ID: ${idx}]\n[Title: ${doc.metadata.title}]\n${doc.content}`;
    }).join('\n\n');

    let webContext = "";
    let webSources = [];
    if (useWebSearch) {
        const webRes = await fetchWebInfo(query);
        webContext = `\n[## 🌐 Web Search Results]\n${webRes.text}`;
        webSources = webRes.sources;
    }

    const finalPrompt = `
${systemInstruction}

[VISUAL & FORMAT RULES]
1. **Emojis**: Use emojis in ALL headers (e.g., ## 🏰 Database).
2. **Links**: Use blue links.
3. **Citations**: Use [[1]] format.

[CONTEXT]
${contextText}
${webContext}

[QUESTION]
${query}
`;

    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: finalPrompt });
    res.json({ answer: response.text, sources, webSources });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📁 MODE 2: File API
app.post('/api/chat/file-api', async (req, res) => {
  let tempFilePath = null;
  let uploadResult = null;
  try {
    if (!supabase || !ai) return res.status(500).json({ error: 'Server config error' });
    const { query, systemInstruction, useWebSearch } = req.body;

    const { data: documents } = await supabase.from('documents').select('content, metadata').limit(10000);
    const sources = extractSources(documents);
    const sourceMap = new Map(sources.map(s => [s.url || s.title, s.index]));

    const fileContent = documents.map(doc => `
SOURCE_INDEX: [[${sourceMap.get(doc.metadata.url || doc.metadata.title) || '?'}]]
SOURCE_TITLE: ${doc.metadata.title}
SOURCE_URL: ${doc.metadata.url}
CONTENT:
${doc.content}
--------------------------------------------------
`).join('\n');

    const fileName = `kb_${Date.now()}.txt`;
    tempFilePath = path.join(__dirname, fileName);
    fs.writeFileSync(tempFilePath, fileContent);

    uploadResult = await ai.files.upload({ file: tempFilePath, config: { mimeType: 'text/plain' } });
    
    // Wait for active
    let state = uploadResult.file.state;
    while (state === 'PROCESSING') {
        await new Promise(r => setTimeout(r, 1000));
        const check = await ai.files.get({ name: uploadResult.file.name });
        state = check.file.state;
    }

    let webContext = "";
    let webSources = [];
    if (useWebSearch) {
        const webRes = await fetchWebInfo(query);
        webContext = `\n[CONTEXT 2: Web Search Results]\n${webRes.text}`;
        webSources = webRes.sources;
    }

    const contents = [{
        role: 'user',
        parts: [
            { fileData: { fileUri: uploadResult.file.uri, mimeType: uploadResult.file.mimeType } },
            { text: `
${systemInstruction}

[STRICT VISUAL RULES]
1. **Emojis**: HEADERS MUST HAVE EMOJIS (e.g. ## 🏰 Title).
2. **Citations**: Use [[1]], [[2]] format matching SOURCE_INDEX.
3. **Links**: Use standard markdown [Title](URL) or automatic links.
4. **No Duplication**: Do not repeat info.

${webContext}

[QUESTION]
${query}
            ` }
        ]
    }];

    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents });
    
    // Cleanup
    await ai.files.delete({ name: uploadResult.file.name });

    res.json({ answer: response.text, sources, webSources });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  }
});

app.listen(port, () => console.log(`🚀 Server running on ${port}`));
