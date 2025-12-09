import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

console.log("=".repeat(50));
console.log("🚀 철산랜드 챗봇 서버 시작");
console.log("=".repeat(50));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_KEY = process.env.API_KEY;

console.log("환경변수 체크:");
console.log("- SUPABASE_URL:", SUPABASE_URL ? "✅ 있음" : "❌ 없음");
console.log("- SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "✅ 있음" : "❌ 없음");
console.log("- API_KEY:", API_KEY ? "✅ 있음" : "❌ 없음");

let supabase = null;
let ai = null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Supabase 설정이 없습니다!");
} else {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("✅ Supabase 클라이언트 생성 완료");
  } catch (err) {
    console.error("❌ Supabase 초기화 실패:", err.message);
  }
}

if (!API_KEY) {
  console.error("❌ Google API Key가 없습니다!");
} else {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.log("✅ Google AI 클라이언트 생성 완료");
  } catch (err) {
    console.error("❌ Google AI 초기화 실패:", err.message);
  }
}

app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: '철산랜드 챗봇 서버가 정상 작동 중입니다!',
    timestamp: new Date().toISOString(),
    config: {
      supabase: !!supabase,
      ai: !!ai
    }
  });
});

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    supabase: !!supabase,
    ai: !!ai,
    timestamp: new Date().toISOString()
  });
});

// 메인 챗 엔드포인트
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log("\n" + "=".repeat(50));
    console.log("📥 새로운 요청 받음");
    console.log("시간:", new Date().toISOString());
    
    // 1. 기본 검증
    if (!supabase || !ai) {
      console.error("❌ 서버 초기화 안 됨");
      return res.status(500).json({ 
        error: '서버가 제대로 초기화되지 않았습니다.',
        details: {
          supabase: !!supabase,
          ai: !!ai
        }
      });
    }

    const { query, systemInstruction } = req.body;
    
    if (!query) {
      console.error("❌ 질문 없음");
      return res.status(400).json({ error: '질문을 입력해주세요.' });
    }

    console.log("질문:", query);
    console.log("시스템 인스트럭션 길이:", systemInstruction?.length || 0);

    // 2. Supabase에서 문서 가져오기
    console.log("\n📚 Step 1: Supabase 문서 로드 중...");
    
    let documents;
    try {
      const { data, error: dbError } = await supabase
        .from('documents')
        .select('content, metadata')
        .limit(50); // 일단 50개로 제한

      if (dbError) {
        throw new Error(`Supabase 에러: ${dbError.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error("Supabase에 문서가 없습니다");
      }

      documents = data;
      console.log(`✅ ${documents.length}개 문서 로드 완료`);
      
    } catch (err) {
      console.error("❌ 문서 로드 실패:", err.message);
      return res.status(500).json({ 
        error: 'Supabase에서 문서를 불러올 수 없습니다.',
        details: err.message
      });
    }

    // 3. 컨텍스트 구성
    console.log("\n📝 Step 2: 컨텍스트 구성 중...");
    
    const context = documents.map((doc, idx) => {
      const meta = doc.metadata || {};
      return `[문서 ${idx + 1}]\n제목: ${meta.title || '제목없음'}\n내용: ${doc.content?.substring(0, 500)}...`;
    }).join('\n\n---\n\n');

    console.log(`✅ 컨텍스트 길이: ${context.length} 글자`);

    // 4. AI 답변 생성
    console.log("\n🤖 Step 3: AI 답변 생성 중...");
    
    const prompt = `${systemInstruction || '당신은 철산랜드의 AI 어시스턴트입니다.'}

다음은 철산랜드의 콘텐츠입니다:

${context}

질문: ${query}

답변:`;

    console.log(`프롬프트 길이: ${prompt.length} 글자`);

    let answer;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt
      });

      answer = response.text;
      
      if (!answer) {
        throw new Error("AI가 빈 응답을 반환했습니다");
      }

      console.log(`✅ 답변 생성 완료 (${answer.length} 글자)`);
      
    } catch (err) {
      console.error("❌ AI 답변 생성 실패:", err.message);
      return res.status(500).json({ 
        error: 'AI 답변 생성에 실패했습니다.',
        details: err.message
      });
    }

    // 5. 응답 반환
    const elapsed = Date.now() - startTime;
    console.log(`\n✅ 요청 처리 완료 (${elapsed}ms)`);
    console.log("=".repeat(50) + "\n");

    res.json({
      answer: answer,
      sources: [],
      webSources: [],
      stats: {
        documentsUsed: documents.length,
        responseTime: `${elapsed}ms`,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error("\n❌ 치명적 오류:", err);
    console.error("스택:", err.stack);
    console.log(`처리 시간: ${elapsed}ms`);
    console.log("=".repeat(50) + "\n");
    
    // 에러 응답도 반드시 JSON으로
    res.status(500).json({ 
      error: '서버 내부 오류가 발생했습니다.',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ 
    error: '요청한 경로를 찾을 수 없습니다.',
    path: req.path
  });
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error('전역 에러:', err);
  res.status(500).json({ 
    error: '서버 오류',
    details: err.message
  });
});

app.listen(port, () => {
  console.log("\n" + "=".repeat(50));
  console.log(`🌐 서버 실행 중: 포트 ${port}`);
  console.log(`📍 URL: http://localhost:${port}`);
  console.log("=".repeat(50) + "\n");
});
