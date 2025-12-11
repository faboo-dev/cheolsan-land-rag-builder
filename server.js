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

// 기본 프롬프트 (관리자 페이지에서 설정 안 했을 때 사용)
const DEFAULT_PROMPT = `당신은 철산랜드의 전문 여행 AI 어시스턴트입니다.

**핵심 원칙:**
1. 제공된 문서를 **전체적으로 분석**하여 가장 정확하고 완전한 답변을 제공하세요
2. 같은 주제에 대해 여러 문서가 있다면, **가장 최신 날짜의 정보를 우선**하세요
3. 정보의 출처를 [[1]], [[2]] 형식으로 명확히 표시하세요
4. 불확실한 정보는 "~로 추정됩니다" 등으로 표현하세요

**답변 형식:**
- 이모지를 사용하여 가독성 향상 (## 🏰 제목)
- 마크다운 문법 활용 (표, 리스트, 강조)
- 구조화된 답변 (개요 → 세부사항 → 요약)
- 관련 정보가 여러 문서에 분산되어 있다면 종합하여 제공

**정확성:**
- 문서에 명시된 내용만 답변
- 추측이나 외부 지식 사용 금지
- 정보가 없으면 "제공된 자료에서 해당 정보를 찾을 수 없습니다" 명시`;

// 🔥 관리자가 설정한 프롬프트 가져오기
async function getSystemPrompt() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'system_prompt')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('⚠️ 프롬프트 조회 실패:', error);
      return DEFAULT_PROMPT;
    }

    if (data && data.value) {
      console.log('✅ 관리자 설정 프롬프트 사용');
      return data.value;
    } else {
      console.log('📋 기본 프롬프트 사용');
      return DEFAULT_PROMPT;
    }
  } catch (error) {
    console.error('⚠️ 프롬프트 로드 에러:', error);
    return DEFAULT_PROMPT;
  }
}

// 상태 체크
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: '철산랜드 RAG 서버 (Gemini 2.0 Flash - 전체 문서 버전)'
  });
});

// 메인 채팅 API
app.post('/api/chat', async (req, res) => {
  console.log('🔵 /api/chat 요청 받음');
  
  try {
    const { query, useWebSearch } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: '질문을 입력해주세요' });
    }

    console.log('📥 질문:', query);
    console.log('🌐 웹 검색:', useWebSearch);

    // 🔥 1. 관리자가 설정한 프롬프트 가져오기
    const customPrompt = await getSystemPrompt();

    // 2. Supabase에서 전체 문서 가져오기 (날짜 순 정렬)
    console.log('📚 Supabase 전체 문서 로딩 중...');
  const { data: documents, error: dbError } = await supabase
  .from('documents')
  .select('content, metadata');
  // created_at 제거, 정렬도 제거 (metadata.date 사용)

    if (dbError) {
      console.error('❌ Supabase 에러:', dbError);
      return res.status(500).json({ 
        error: 'DB 조회 실패', 
        details: dbError.message 
      });
    }

    console.log(`✅ 문서 로드 완료: ${documents.length}개`);

    // 3. 문서 텍스트 생성 (날짜 정보 포함)
    const contextText = documents
      .map((doc, idx) => {
        const date = doc.metadata?.date || doc.metadata?.createdAt || '날짜 미상';
        const source = doc.metadata?.source || doc.metadata?.type || '출처 미상';
        const title = doc.metadata?.title || `문서 ${idx + 1}`;
        
        return `[문서 ${idx + 1}]
제목: ${title}
출처: ${source}
날짜: ${date}
내용:
${doc.content}`;
      })
      .join('\n\n---\n\n');

    console.log(`📝 컨텍스트 길이: ${contextText.length} 글자`);

    // 4. Gemini 2.0 Flash API 호출
    console.log('🤖 Gemini 2.0 Flash 호출 중...');
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 8192,
      }
    });

    // 🔥 관리자 프롬프트 + 문서 + 질문 결합
    const prompt = `${customPrompt}

**제공된 문서 (총 ${documents.length}개, 최신순):**
${contextText}

**사용자 질문:**
${query}

**답변 작성 가이드:**
1. 모든 관련 문서를 검토하여 종합적인 답변 작성
2. 날짜가 더 최근인 정보 우선 사용
3. 출처 번호 [[1]], [[2]] 반드시 표시
4. 구조화되고 읽기 쉬운 형식으로 작성`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    console.log('✅ Gemini 응답 받음');
    console.log(`📤 답변 길이: ${answer.length} 글자`);

    // 5. 웹 검색 (옵션)
    let webSources = [];
    if (useWebSearch) {
      console.log('🌐 웹 검색 시작...');
      try {
        const searchModel = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash-exp',
          tools: [{ googleSearch: {} }]
        });
        
        const searchResult = await searchModel.generateContent(
          `${query}에 대한 2024-2025년 최신 정보를 웹에서 검색하여 요약해주세요. 특히 가격, 운영시간, 변경사항 등을 확인해주세요.`
        );
        
        webSources = [{
          title: '웹 검색 결과 (최신 정보)',
          content: searchResult.response.text()
        }];
        
        console.log('✅ 웹 검색 완료');
      } catch (searchError) {
        console.error('⚠️ 웹 검색 실패:', searchError.message);
      }
    }

    // 6. 응답 반환
    res.json({
      answer,
      sources: documents.slice(0, 20).map((doc, idx) => ({
        id: idx + 1,
        title: doc.metadata?.title || `문서 ${idx + 1}`,
        source: doc.metadata?.source || doc.metadata?.type || '출처 미상',
        date: doc.metadata?.date || doc.metadata?.createdAt || '날짜 미상',
        content: doc.content.substring(0, 200) + '...'
      })),
      webSources,
      totalDocuments: documents.length,
      usingCustomPrompt: customPrompt !== DEFAULT_PROMPT // 🔥 커스텀 프롬프트 사용 여부
    });

  } catch (error) {
    console.error('❌ 서버 에러:', error);
    res.status(500).json({ 
      error: 'AI 답변 생성에 실패했습니다.',
      details: error.message
    });
  }
});

// 관리자 API - 프롬프트 조회
app.get('/api/admin/prompt', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'system_prompt')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.json({ 
      prompt: data?.value || DEFAULT_PROMPT,
      isDefault: !data || !data.value
    });
  } catch (error) {
    console.error('❌ 프롬프트 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 관리자 API - 프롬프트 저장
app.post('/api/admin/prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: '프롬프트를 입력해주세요' });
    }

    const { error } = await supabase
      .from('settings')
      .upsert({ 
        key: 'system_prompt', 
        value: prompt,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    console.log('✅ 프롬프트 저장 완료');
    res.json({ 
      success: true, 
      message: '✅ 프롬프트가 저장되었습니다. 이제 챗봇이 이 프롬프트를 사용합니다!' 
    });
  } catch (error) {
    console.error('❌ 프롬프트 저장 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 관리자 API - 프롬프트 초기화 (기본값으로)
app.delete('/api/admin/prompt', async (req, res) => {
  try {
    const { error } = await supabase
      .from('settings')
      .delete()
      .eq('key', 'system_prompt');

    if (error) throw error;

    console.log('✅ 프롬프트 초기화 완료');
    res.json({ 
      success: true, 
      message: '기본 프롬프트로 초기화되었습니다.',
      defaultPrompt: DEFAULT_PROMPT
    });
  } catch (error) {
    console.error('❌ 프롬프트 초기화 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 관리자 API - 문서 목록 조회
app.get('/api/admin/documents', async (req, res) => {
  try {
    const { data: documents, error } = await supabase
  .from('documents')
  .select('id, content, metadata');
  // created_at 제거, 정렬도 제거
    if (error) throw error;

    res.json({ 
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.metadata?.title || '제목 없음',
        source: doc.metadata?.source || doc.metadata?.type || '출처 미상',
        date: doc.metadata?.date || doc.metadata?.createdAt || '날짜 미상',
        contentPreview: doc.content.substring(0, 150) + '...',
        createdAt: doc.created_at
      })),
      total: documents.length 
    });
  } catch (error) {
    console.error('❌ 문서 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 관리자 API - 문서 업로드
app.post('/api/admin/upload', async (req, res) => {
  try {
    const { content, metadata } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: '내용을 입력해주세요' });
    }

    const { error } = await supabase
      .from('documents')
      .insert({
        content,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    res.json({ success: true, message: '문서가 업로드되었습니다.' });
  } catch (error) {
    console.error('❌ 문서 업로드 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 관리자 API - 문서 삭제
app.delete('/api/admin/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: '문서가 삭제되었습니다.' });
  } catch (error) {
    console.error('❌ 문서 삭제 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행중입니다`);
  console.log(`📊 전체 문서 분석 모드`);
  console.log(`🎯 Gemini 2.0 Flash 사용`);
  console.log(`✨ 관리자 프롬프트 연동 완료`);
});
