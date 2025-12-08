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

// Resolve directory for file operations
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// --- Helper: Prepare Sources ---
function extractSources(documents) {
    const uniqueSourcesMap = new Map();
    documents.forEach(doc => {
        const meta = doc.metadata;
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
    // Convert to array and assign an index (1-based)
    return Array.from(uniqueSourcesMap.values()).map((source, index) => ({
        ...source,
        index: index + 1
    }));
}

// --- Routes ---

app.get('/', (req, res) => {
  res.json({ 
      status: 'running', 
      modes: ['full-context', 'file-api'] 
  });
});

// 🔥 MODE 1: Full Context (Text Injection)
app.post('/api/chat/full-context', async (req, res) => {
  try {
    if (!supabase || !ai) return res.status(500).json({ error: 'Server config error' });

    const { query, systemInstruction, useWebSearch } = req.body;
    console.log(`[Full Context] Query: ${query.substring(0, 30)}...`);

    const { data: documents, error } = await supabase
      .from('documents')
      .select('content, metadata')
      .limit(10000);

    if (error) throw error;

    const docCount = documents ? documents.length : 0;
    
    // Prepare Sources with Indices
    const sources = extractSources(documents);
    const sourceMap = new Map(sources.map(s => [s.url || s.title, s.index]));

    // Create Context String
    const contextText = documents.map(doc => {
        const idx = sourceMap.get(doc.metadata.url || doc.metadata.title) || '?';
        return `
[Source ID: ${idx}]
[Title: ${doc.metadata.title}]
[Date: ${doc.metadata.date}]
[Content]: ${doc.content}
`;
    }).join('\n\n');

    // Web Search
    let webContext = "";
    let webSources = [];
    if (useWebSearch) {
        const webResult = await fetchWebInfo(query);
        webContext = `[CONTEXT 2: Web Search Results (For Cross-Check)]\n${webResult.text}`;
        webSources = webResult.sources;
    }

    const finalPrompt = `
${systemInstruction}

[STRICT OUTPUT RULES]
1. **Citation Style**: Use inline citations like [[1]], [[2]]. Do NOT use [Title](URL).
   - Match the [Source ID: X] provided in the context.
   - Example: "This place is great [[1]]."
2. **No Duplication**: Do NOT repeat the content from "Iron Land Database" in the "Cross Check" section.
3. **Markdown Only**: NO HTML tags allowed. Use Markdown tables if needed.
4. **No Reference List**: Do NOT list references at the bottom. The frontend handles that.

[CONTEXT 1: My Database (Primary Source)]
${contextText}

${useWebSearch ? webContext : ""}

[QUESTION]
${query}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: finalPrompt,
    });

    res.json({ 
      answer: response.text, 
      docCount: docCount,
      sources: sources,
      webSources: webSources
    });

  } catch (error) {
    console.error('[Full Context Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// 📁 MODE 2: File API (Upload -> Generate -> Delete)
app.post('/api/chat/file-api', async (req, res) => {
  let tempFilePath = null;
  let uploadResult = null;

  try {
    if (!supabase || !ai) return res.status(500).json({ error: 'Server config error' });

    const { query, systemInstruction, useWebSearch } = req.body;
    console.log(`[File API] Query: ${query.substring(0, 30)}...`);

    // 1. Fetch Data
    const { data: documents, error } = await supabase
      .from('documents')
      .select('content, metadata')
      .limit(10000);

    if (error) throw error;
    const docCount = documents.length;

    // Prepare Sources for frontend
    const sources = extractSources(documents);
    // Create a map to inject indices into the file content for easier citation
    const sourceMap = new Map(sources.map(s => [s.url || s.title, s.index]));

    // 2. Create File Content
    // We inject "SOURCE_INDEX: X" so Gemini knows which number to cite.
    const fileContent = documents.map(doc => `
SOURCE_INDEX: [[${sourceMap.get(doc.metadata.url || doc.metadata.title) || '?'}]]
SOURCE_TITLE: ${doc.metadata.title}
SOURCE_DATE: ${doc.metadata.date}
SOURCE_URL: ${doc.metadata.url}
CONTENT:
${doc.content}
--------------------------------------------------
`).join('\n');

    // 3. Save Temp File
    const fileName = `cheolsan_kb_${Date.now()}.txt`;
    tempFilePath = path.join(__dirname, fileName);
    fs.writeFileSync(tempFilePath, fileContent);
    console.log(`[File API] Created temp file: ${fileName}`);

    // 4. Upload to Google
    console.log("[File API] Uploading to Google...");
    uploadResult = await ai.files.upload({
        file: tempFilePath,
        config: { mimeType: 'text/plain', displayName: 'Cheolsan DB' }
    });
    
    // Wait for processing
    let fileState = uploadResult.file.state;
    while (fileState === 'PROCESSING') {
        await new Promise(r => setTimeout(r, 1000));
        const check = await ai.files.get({ name: uploadResult.file.name });
        fileState = check.file.state;
    }
    if (fileState === 'FAILED') throw new Error("File upload failed processing");
    console.log(`[File API] Upload Ready: ${uploadResult.file.uri}`);

    // 5. Pre-fetch Web Search (Injection Method)
    // Mixing File API + Tools sometimes causes the model to ignore one context.
    // Injecting the search result as TEXT into the prompt is more reliable for Cross-Checking.
    let webContextText = "";
    let webSources = [];

    if (useWebSearch) {
        const webResult = await fetchWebInfo(query);
        webContextText = `
[CONTEXT 2: Web Search Results (For Cross-Check)]
${webResult.text}
        `;
        webSources = webResult.sources;
    }

    // 6. Generate with File + Web Context
    const contents = [
        {
            role: 'user',
            parts: [
                { fileData: { fileUri: uploadResult.file.uri, mimeType: uploadResult.file.mimeType } },
                { text: `
${systemInstruction}

[STRICT OUTPUT RULES]
1. **Citation Style**: Use the "SOURCE_INDEX" provided in the file. Format: [[1]], [[2]]. 
   - Do NOT use [Title](URL).
   - Example: "According to the guide [[1]], the price is..."
2. **No Duplication**: Do NOT repeat the database content in the Cross-Check section. If there is no new info from web search, just say "No additional info found."
3. **Markdown Only**: NO HTML tags.
4. **No Reference List**: Do NOT list references at the bottom.

${webContextText}

[QUESTION]
${query}
                ` }
            ]
        }
    ];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
    });

    // 7. Cleanup Remote File (Async)
    (async () => {
        try {
            await ai.files.delete({ name: uploadResult.file.name });
            console.log("[File API] Remote file deleted.");
        } catch (e) { console.error("Cleanup error", e); }
    })();

    res.json({
        answer: response.text,
        docCount: docCount,
        sources: sources, // Send formatted sources with indices
        webSources: webSources
    });

  } catch (error) {
    console.error('[File API Error]', error);
    res.status(500).json({ error: error.message });
  } finally {
    // Cleanup Local File
    if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log("[File API] Local file deleted.");
    }
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
