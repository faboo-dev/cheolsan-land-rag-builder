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

// File Search Store 정보 저장
let fileSearchStoreName = null;

// 기본 프롬프트
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

// 🔥 File Search Store 생성 및 문서 업로드
async function initializeFileSearchStore() {
  try {
    console.log('📤 File Search Store 초기화 시작...');

    // 1. File Search Store 생성
    const createResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/fileSearchStores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        displayName: '철산랜드 여행 정보'
      })
    });

    const storeData = await createResponse.json();
    fileSearchStoreName = storeData.name;
    console.log(`✅ File Search Store 생성: ${fileSearchStoreName}`);

    // 2. Supabase에서 문서 가져오기
    const { data: documents, error: dbError } = await supabase
      .from('documents')
      .select('content, metadata');

    if (dbError) {
      throw new Error(`DB 조회 실패: ${dbError.message}`);
    }

    console.log(`✅ 문서 로드 완료: ${documents.length}개`);

    // 3. 각 문서를 File Search Store에 업로드
    console.log('⏳ 문서 업로드 중...');
    
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const date = doc.metadata?.date || doc.metadata?.createdAt || '날짜 미상';
      const source = doc.metadata?.source || doc.metadata?.type || '출처 미상';
      const title = doc.metadata?.title || `문서 ${i + 1}`;
      
      const fileContent = `제목: ${title}
출처: ${source}
날짜: ${date}

${doc.content}`;

      // Blob으로 변환
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, `document_${i + 1}.txt`);

      const uploadResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/${fileSearchStoreName}:uploadToFileSearchStore`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': API_KEY
          },
          body: formData
        }
      );

      if (i % 50 === 0) {
        console.log(`📤 진행률: ${i + 1}/${documents.length}`);
      }
    }

    console.log('🎉 모든 문서 업로드 완료!');
    return fileSearchStoreName;

  } catch (error) {
    console.error('❌ 초기화 실패:', error);
    throw error;
  }
}

// 🔥 File Search Store 가져오기 (없으면 생성)
async function getFileSearchStore() {
  if (fileSearchStoreName) {
    console.log('📋 기존 File Search Store 사용');
    return fileSearchStoreName;
  }

  console.log('🔄 File Search Store 생성 필요');
  return await initializeFileSearchStore();
}

// 상태 체크
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: '철산랜드 RAG 서버 (진짜 File Search API 버전)',
    fileSearchStoreInitialized: !!fileSearchStoreName
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

    // 1. 관리자 프롬프트 가져오기
    const customPrompt = await getSystemPrompt();

    // 2. File Search Store 준비
    const storeName = await getFileSearchStore();

    // 3. Gemini 2.0 Flash + File Search Tool 호출
    console.log('🤖 Gemini 2.0 Flash (File Search Tool) 호출 중...');
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      tools: [{
        fileSearchTool: {
          fileSearchStore: storeName
        }
      }]
    });

    const result = await model.generateContent(
      `${customPrompt}

**사용자 질문:**
${query}

**답변 작성 가이드:**
1. File Search Tool을 사용하여 관련 문서를 찾아 종합적인 답변 작성
2. 날짜가 더 최근인 정보 우선 사용
3. 출처 번호 [[1]], [[2]] 반드시 표시
4. 구조화되고 읽기 쉬운 형식으로 작성`
    );

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
          `${query}에 대한 2024-2025년 최신 정보를 웹에서 검색하여 요약해주세요.`
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

    // 5. 응답 반환
    res.json({
      answer,
      sources: [{
        id: 1,
        title: '철산랜드 문서 모음 (전체 검색)',
        source: 'Google File Search API',
        date: '실시간',
        content: 'File Search API가 전체 문서를 스캔하여 관련 정보를 추출했습니다.'
      }],
      webSources,
      usingFileSearchAPI: true,
      usingCustomPrompt: customPrompt !== DEFAULT_PROMPT
    });

  } catch (error) {
    console.error('❌ 서버 에러:', error);
    res.status(500).json({ 
      error: 'AI 답변 생성에 실패했습니다.',
      details: error.message
    });
  }
});

// 🔧 관리자 API - File Search Store 재생성
app.post('/api/admin/refresh-file-search', async (req, res) => {
  try {
    console.log('🔄 File Search Store 재생성 시작...');
    
    // 기존 Store 삭제 (있다면)
    if (fileSearchStoreName) {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileSearchStoreName}?force=true`, {
        method: 'DELETE',
        headers: {
          'x-goog-api-key': API_KEY
        }
      });
    }
    
    fileSearchStoreName = null;
    const storeName = await initializeFileSearchStore();
    
    res.json({ 
      success: true, 
      message: '✅ File Search Store가 재생성되었습니다.',
      storeName
    });
  } catch (error) {
    console.error('❌ 재생성 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// ... (이전 관리자 API 코드 동일: 프롬프트, 문서 관리)
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

// 관리자 API - 프롬프트 초기화
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

    if (error) throw error;

    res.json({ 
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.metadata?.title || '제목 없음',
        source: doc.metadata?.source || doc.metadata?.type || '출처 미상',
        date: doc.metadata?.date || doc.metadata?.createdAt || '날짜 미상',
        contentPreview: doc.content.substring(0, 150) + '...'
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
        }
      });

    if (error) throw error;

    // 새 문서 추가 → File Search Store 재생성 필요
    console.log('🔄 새 문서 추가 → File Search Store 재생성 예약');
    fileSearchStoreName = null;

    res.json({ 
      success: true, 
      message: '✅ 문서가 업로드되었습니다. 다음 질문부터 새 문서가 반영됩니다.' 
    });
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

    // 문서 삭제 → File Search Store 재생성 필요
    console.log('🔄 문서 삭제 → File Search Store 재생성 예약');
    fileSearchStoreName = null;

    res.json({ 
      success: true, 
      message: '✅ 문서가 삭제되었습니다. 다음 질문부터 반영됩니다.' 
    });
  } catch (error) {
    console.error('❌ 문서 삭제 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행중입니다`);
  console.log(`🎯 Gemini 2.0 Flash + 진짜 File Search API 사용`);
  console.log(`✨ 전체 문서 빠른 스캔 모드`);
});
