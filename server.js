import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());

// 환경변수
const API_KEY = process.env.API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Supabase 클라이언트
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Google AI 클라이언트
const genAI = new GoogleGenerativeAI(API_KEY);

// 상태 체크
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: '철산랜드 RAG 서버 (Gemini 2.0 Flash)'
  });
});

// 메인 채팅 API
app.post('/api/chat', async (req, res) => {
  console.log('🔵 /api/chat 요청 받음');
  
  try {
    const { query, systemInstruction, useWebSearch } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: '질문을 입력해주세요' });
    }

    console.log('📥 질문:', query);
    console.log('🌐 웹 검색:', useWebSearch);

    // 1. Supabase에서 문서 가져오기
    console.log('📚 Supabase 문서 로딩 중...');
    const { data: documents, error: dbError } = await supabase
      .from('documents')
      .select('content, metadata')
      .limit(100);

    if (dbError) {
      console.error('❌ Supabase 에러:', dbError);
      return res.status(500).json({ 
        error: 'DB 조회 실패', 
        details: dbError.message 
      });
    }

    console.log(`✅ 문서 로드 완료: ${documents.length}개`);

    // 2. 문서 텍스트 생성
    const contextText = documents
      .map((doc, idx) => `[문서 ${idx + 1}]\n${doc.content}`)
      .join('\n\n---\n\n');

    console.log(`📝 컨텍스트 길이: ${contextText.length} 글자`);

    // 3. Gemini 2.0 Flash API 호출
    console.log('🤖 Gemini 2.0 Flash 호출 중...');
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp'  // ← 최신 Gemini 2.0 Flash
    });

    const prompt = `${systemInstruction || '당신은 철산랜드의 친절한 AI 어시스턴트입니다.'}

**제공된 문서:**
${contextText}

**사용자 질문:**
${query}

**답변 규칙:**
1. 제공된 문서 내용을 기반으로 정확하게 답변하세요
2. 정보를 언급할 때 [[1]], [[2]] 형식으로 출처번호를 표시하세요
3. 마크다운 문법을 사용하세요
4. 문서에 없는 내용은 "제공된 자료에 해당 내용이 없습니다"라고 명시하세요`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    console.log('✅ Gemini 응답 받음');
    console.log(`📤 답변 길이: ${answer.length} 글자`);

    // 4. 웹 검색 (옵션)
    let webSources = [];
    if (useWebSearch) {
      console.log('🌐 웹 검색 시작...');
      try {
        const searchModel = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash-exp',
          tools: [{ googleSearch: {} }]
        });
        
        const searchResult = await searchModel.generateContent(
          `${query}에 대한 최신 정보를 웹에서 검색하여 요약해주세요.`
        );
        
        webSources = [{
          title: '웹 검색 결과',
          content: searchResult.response.text()
        }];
        
        console.log('✅ 웹 검색 완료');
      } catch (searchError) {
        console.error('⚠️ 웹 검색 실패:', searchError.message);
      }
    }

    // 5. 응답 반환
    res.json({
      answer,
      sources: documents.slice(0, 10).map((doc, idx) => ({
        id: idx + 1,
        title: doc.metadata?.title || `문서 ${idx + 1}`,
        content: doc.content.substring(0, 200) + '...'
      })),
      webSources
    });

  } catch (error) {
    console.error('❌ 서버 에러:', error);
    res.status(500).json({ 
      error: 'AI 답변 생성에 실패했습니다.',
      details: JSON.stringify(error, null, 2)
    });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행중입니다`);
});
