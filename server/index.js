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

// Initialize Clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// @ts-ignore
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Routes
app.get('/', (req, res) => {
  res.send('Cheolsan Land RAG Server is Running! 🎡');
});

// 🔥 Full Context Chat Endpoint
app.post('/api/chat/full-context', async (req, res) => {
  try {
    const { query, systemInstruction } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // 1. Fetch ALL documents from Supabase (Backend is much faster)
    // Supabase JS limit is 1000 by default, we bump it to 10000
    const { data: documents, error } = await supabase
      .from('documents')
      .select('content, metadata')
      .limit(10000);

    if (error) throw error;

    console.log(`[Server] Fetched ${documents.length} documents for full context.`);

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
      docCount: documents.length 
    });

  } catch (error) {
    console.error('[Server Error]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});