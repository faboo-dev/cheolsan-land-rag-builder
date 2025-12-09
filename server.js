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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS 설정: 모든 도메인 허용
app.use(cors({ origin: '*' }));
app.use(express.json());

console.log("🚀 철산랜드 챗봇 서버 시작...");

// 환경변수 로드
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_KEY = process.env.API_KEY;

let supabase = null;
let ai = null;

// Supabase 초기화
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Supabase 설정이 없습니다!");
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase 연결 완료");
}

// Google AI 초기화
if (!API_KEY) {
  console.error("❌ Google API Key가 없습니다!");
} else {
  ai = new GoogleGenAI({ apiKey: API_KEY });
  console.log("✅ Google AI 연결 완료");
}

// 🌐 웹 검색 함수
async function fetchWebInfo(query) {
  if (!ai) return { text: "", sources: [] };
  
  try {
    console.log("🔍 웹 검색 시작:", query);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `다음 질문에 대한 최신 정보를 웹에서 검색해주세요: "${query}"`,
      config: { 
        tools: [{ googleSearch: {} }] 
      },
    });
    
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const webSources = chunks
      .map(c => c.web ? { title: c.web.title, url: c.web.uri } : null)
      .filter(Boolean);
    
    console.log(`✅ 웹 검색 완료: ${webSources.length}개 소스`);
    
    return { 
      text: response.text || "웹 검색 결과를 찾을 수 없습니다.", 
      sources: webSources 
    };
  } catch (e) {
    console.error("❌ 웹 검색 실패:", e.message);
    return { text: "", sources: [] };
  }
}

// 📚 소스 정보 추출 함수
function extractSources(documents) {
  const uniqueMap = new Map();
  
  documents.forEach(doc => {
    const meta = doc.metadata || {};
    const key = meta.url || meta.title || "unknown";
    
    if (key && !uniqueMap.has(key)) {
      uniqueMap.set(key, { 
        title: meta.title || "제목 없음",
        url: meta.url || "#",
        date: meta.date || "",
        type: meta.type || "BLOG"
      });
    }
  });
  
  return Array.from(uniqueMap.values()).map((s, i) => ({ 
    ...s, 
    index: i + 1 
  }));
}

// 🏠 홈페이지
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    mode: 'File Search API',
    message: '철산랜드 챗봇이 정상 작동 중입니다!' 
  });
});

// 🤖 메인 챗봇 엔드포인트 (File Search API 전용)
app.post('/api/chat', async (req, res) => {
  let uploadedFiles = [];
  
  try {
    // 1️⃣ 설정 확인
    if (!supabase || !ai) {
      return res.status(500).json({ 
        error: '서버 설정 오류입니다. 관리자에게 문의하세요.' 
      });
    }

    const { query, systemInstruction, useWebSearch } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: '질문을 입력해주세요.' });
    }

    console.log("\n" + "=".repeat(50));
    console.log("📥 새로운 질문:", query);
    console.log("=".repeat(50));

    // 2️⃣ Supabase에서 문서 가져오기
    console.log("📚 Step 1: 데이터베이스에서 문서 로딩...");
    
    const { data: documents, error: dbError } = await supabase
      .from('documents')
      .select('content, metadata')
      .limit(10000);

    if (dbError || !documents || documents.length === 0) {
      throw new Error("문서를 불러올 수 없습니다: " + (dbError?.message || "데이터 없음"));
    }

    console.log(`✅ ${documents.length}개 문서 로드 완료`);

    // 3️⃣ 소스 정보 추출
    const sources = extractSources(documents);
    const sourceMap = new Map(sources.map(s => [s.url || s.title, s.index]));

    // 4️⃣ 파일 업로드 준비
    console.log("📤 Step 2: Google File API에 업로드 중...");
    
    const uploadPromises = documents.slice(0, 50).map(async (doc, idx) => {
      const meta = doc.metadata || {};
      const key = meta.url || meta.title || `doc_${idx}`;
      const sourceId = sourceMap.get(key) || idx + 1;

      // 파일 내용 구성
      const fileContent = `
출처번호: [[${sourceId}]]
제목: ${meta.title || '제목없음'}
URL: ${meta.url || '#'}
타입: ${meta.type || 'BLOG'}
날짜: ${meta.date || '날짜없음'}

내용:
${doc.content}
`;

      // 임시 파일 생성
      const fileName = `cheolsan_${sourceId}_${Date.now()}.txt`;
      const tempPath = path.join(__dirname, fileName);
      fs.writeFileSync(tempPath, fileContent, 'utf8');

      try {
        // Google에 업로드
        const uploadResult = await ai.files.upload({
          file: tempPath,
          config: {
            displayName: fileName,
            mimeType: 'text/plain'
          }
        });

        // 로컬 파일 삭제
        fs.unlinkSync(tempPath);

        return uploadResult.file;
      } catch (err) {
        // 실패해도 로컬 파일 정리
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        console.error(`❌ 파일 업로드 실패: ${fileName}`, err.message);
        return null;
      }
    });

    uploadedFiles = (await Promise.all(uploadPromises)).filter(Boolean);
    
    if (uploadedFiles.length === 0) {
      throw new Error("파일 업로드에 실패했습니다.");
    }

    console.log(`✅ ${uploadedFiles.length}개 파일 업로드 완료`);

    // 5️⃣ 파일 처리 대기
    console.log("⏳ Step 3: 파일 처리 중...");
    
    const waitForFile = async (fileName) => {
      let state = 'PROCESSING';
      let attempts = 0;
      
      while (state === 'PROCESSING' && attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        const fileInfo = await ai.files.get({ name: fileName });
        state = fileInfo.file.state;
        attempts++;
      }
      
      return state === 'ACTIVE';
    };

    const processingResults = await Promise.all(
      uploadedFiles.map(f => waitForFile(f.name))
    );

    const activeFiles = uploadedFiles.filter((_, idx) => processingResults[idx]);
    
    if (activeFiles.length === 0) {
      throw new Error("파일 처리에 실패했습니다.");
    }

    console.log(`✅ ${activeFiles.length}개 파일 처리 완료`);

    // 6️⃣ 웹 검색 (옵션)
    let webContext = "";
    let webSources = [];
    
    if (useWebSearch) {
      const webRes = await fetchWebInfo(query);
      if (webRes.text) {
        webContext = `\n\n### 🌐 최신 웹 검색 결과\n${webRes.text}`;
        webSources = webRes.sources;
      }
    }

    // 7️⃣ AI 답변 생성
    console.log("🤖 Step 4: AI 답변 생성 중...");

    const systemPrompt = systemInstruction || `
당신은 철산랜드의 친절한 AI 어시스턴트입니다.

**답변 규칙:**
1. 정보를 언급할 때 반드시 [[1]], [[2]] 형식으로 출처번호를 표시하세요.
2. 모든 제목에 관련 이모지를 추가하세요 (예: ## 🏰 제목)
3. 마크다운 문법을 사용하세요 (표, 리스트, 링크 등)
4. 정확하고 구체적으로 답변하세요.
5. 모르는 내용은 솔직히 모른다고 말하세요.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [{
        role: 'user',
        parts: [{
          text: `${systemPrompt}

${webContext}

### 질문
${query}
`
        }]
      }],
      config: {
        tools: [{
          fileSearch: {
            files: activeFiles.map(f => ({ name: f.name }))
          }
        }]
      }
    });

    console.log("✅ 답변 생성 완료");

    // 8️⃣ 파일 정리
    console.log("🗑️  Step 5: 업로드 파일 삭제 중...");
    
    await Promise.all(
      activeFiles.map(f => 
        ai.files.delete({ name: f.name }).catch(err => 
          console.error(`파일 삭제 실패: ${f.name}`)
        )
      )
    );

    console.log("✅ 정리 완료\n");

    // 9️⃣ 응답 반환
    res.json({
      answer: response.text || "답변을 생성할 수 없습니다.",
      sources: sources,
      webSources: webSources,
      stats: {
        documentsTotal: documents.length,
        filesUploaded: activeFiles.length,
        responseTime: "빠름",
        mode: 'FILE_SEARCH_API'
      }
    });

  } catch (err) {
    console.error("\n❌ 오류 발생:", err.message);
    console.error(err.stack);

    // 에러 발생 시에도 파일 정리
    if (uploadedFiles.length > 0) {
      console.log("🗑️  에러 복구: 업로드 파일 정리 중...");
      await Promise.all(
        uploadedFiles.map(f => 
          ai.files.delete({ name: f.name }).catch(() => {})
        )
      );
    }

    res.status(500).json({ 
      error: "답변 생성 중 오류가 발생했습니다.",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 서버 시작
app.listen(port, () => {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🚀 서버가 포트 ${port}에서 실행 중입니다!`);
  console.log(`🌐 URL: http://localhost:${port}`);
  console.log(`${"=".repeat(50)}\n`);
});
