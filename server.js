import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

// 환경변수
const API_KEY = process.env.API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Supabase 클라이언트
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// File Search Store 정보
let fileSearchStoreName = null;
let uploadedFilesCount = 0;

// ==================== 유틸리티 함수 ====================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadStoreName() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'file_search_store_name')
      .single();

    if (!error && data) {
      fileSearchStoreName = data.value;
      console.log('✅ File Search Store 로드:', fileSearchStoreName);
      return fileSearchStoreName;
    }
  } catch (error) {
    console.log('⚠️ Store 이름 로드 실패');
  }
  return null;
}

async function saveStoreName(storeName) {
  try {
    await supabase
      .from('settings')
      .upsert({
        key: 'file_search_store_name',
        value: storeName,
        updated_at: new Date().toISOString()
      });
    console.log('✅ Store 이름 저장:', storeName);
  } catch (error) {
    console.error('⚠️ Store 이름 저장 실패:', error.message);
  }
}

async function loadUploadedCount() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'uploaded_files_count')
      .single();

    if (!error && data) {
      uploadedFilesCount = parseInt(data.value) || 0;
      console.log('✅ 업로드 카운트 로드:', uploadedFilesCount);
    }
  } catch (error) {
    console.log('⚠️ 업로드 카운트 로드 실패');
  }
}

async function saveUploadedCount(count) {
  try {
    await supabase
      .from('settings')
      .upsert({
        key: 'uploaded_files_count',
        value: String(count),
        updated_at: new Date().toISOString()
      });
    console.log('✅ 업로드 카운트 저장:', count);
  } catch (error) {
    console.error('⚠️ 업로드 카운트 저장 실패:', error.message);
  }
}

// ==================== 초기화 ====================

async function initializeFileSearchStore() {
  try {
    console.log('🔵 File Search Store 정보 로드 중...');
    
    await loadStoreName();
    await loadUploadedCount();

    if (!fileSearchStoreName) {
      console.log('⚠️ Store가 없습니다. 로컬 스크립트로 업로드해주세요.');
    } else {
      console.log('✅ File Search Store 사용 준비 완료');
      console.log(`📊 Store: ${fileSearchStoreName}`);
      console.log(`📄 문서 수: ${uploadedFilesCount}개`);
    }

  } catch (error) {
    console.error('❌ 초기화 오류:', error);
  }
}

// ==================== 프롬프트 ====================

async function getSystemPrompt() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'system_prompt')
      .single();

    if (!error && data) {
      console.log('✅ 커스텀 프롬프트 사용');
      return data.value;
    }
  } catch (error) {
    console.log('⚠️ 기본 프롬프트 사용');
  }

  return `당신은 철산랜드의 전문 여행 컨설턴트 AI입니다.

**역할:**
- 전 세계 여행지에 대한 정확하고 실용적인 정보를 제공합니다
- Google File Search API를 통해 여행 문서 데이터베이스를 검색하여 답변합니다
- 유튜브 영상과 블로그 글을 기반으로 상세한 여행 정보를 제공합니다

**답변 규칙:**
1. 📌 **출처 표시 필수**: 정보를 언급할 때 반드시 출처를 명확히 표시하세요
2. 📅 **최신 정보 우선**: 날짜가 표시된 문서 중 가장 최근 정보를 우선하세요
3. 🎯 **구체적 답변**: 가격, 위치, 시간, 연락처 등 구체적 정보를 포함하세요
4. 🔗 **원본 링크 제공**: YouTube 영상의 경우 URL과 타임스탬프 함께 제공
5. ⚠️ **정보 없음 명시**: 문서에 없는 내용은 "제공된 자료에 해당 내용이 없습니다"라고 명시하세요
6. 📝 **마크다운 사용**: 제목, 목록, 강조를 활용하여 읽기 쉽게 작성하세요
7. 💡 **실용적 팁**: 여행자가 실제로 도움받을 수 있는 팁을 추가하세요
8. 🌍 **지역 정보**: 답변 시 어느 지역/국가에 대한 정보인지 명확히 표시하세요`;
}

// ==================== API 엔드포인트 ====================

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: '철산랜드 RAG 서버 (File Search API)',
    fileSearchStoreInitialized: !!fileSearchStoreName,
    storeName: fileSearchStoreName,
    uploadedFilesCount: uploadedFilesCount
  });
});

app.post('/api/chat', async (req, res) => {
  console.log('🔵 /api/chat 요청 받음');

  try {
    const { query, systemInstruction } = req.body;

    if (!query) {
      return res.status(400).json({ error: '질문을 입력해주세요' });
    }

    console.log('📥 질문:', query);

    if (!fileSearchStoreName) {
      return res.status(500).json({ 
        error: 'File Search Store가 초기화되지 않았습니다. 관리자에게 문의하세요.' 
      });
    }

    // 프롬프트
    const customPrompt = await getSystemPrompt();
    const finalPrompt = systemInstruction || customPrompt;

    console.log('🤖 Gemini 2.5 Flash 호출 중 (File Search 모드)...');

    // 공식 문서 기반 REST API 호출
    const requestBody = {
      contents: [{
        parts: [{
          text: `${finalPrompt}\n\n**사용자 질문:**\n${query}`
        }]
      }],
      tools: [{
        file_search: {
          file_search_store_names: [fileSearchStoreName]
        }
      }]
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Gemini API 에러:', errorData);
      throw new Error(JSON.stringify(errorData));
    }

    const data = await response.json();
    
    console.log('✅ Gemini 응답 받음');
    
    // 응답 파싱
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성할 수 없습니다.';
    
    // Grounding 메타데이터에서 출처 추출
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    let sources = [];
    
    if (groundingMetadata?.groundingChunks) {
      sources = groundingMetadata.groundingChunks.map((chunk, idx) => ({
        id: idx + 1,
        title: chunk.web?.title || `문서 ${idx + 1}`,
        content: chunk.web?.uri || '',
        date: new Date().toISOString().split('T')[0]
      }));
    }
    
    // 출처가 없으면 기본 정보
    if (sources.length === 0) {
      sources = [{
        id: 1,
        title: 'File Search Store',
        content: `총 ${uploadedFilesCount}개의 문서에서 검색되었습니다.`,
        date: new Date().toISOString().split('T')[0]
      }];
    }

    res.json({
      answer,
      sources,
      usingFileSearchAPI: true,
      totalDocuments: uploadedFilesCount
    });

  } catch (error) {
    console.error('❌ 서버 에러:', error);
    res.status(500).json({
      error: 'AI 답변 생성에 실패했습니다.',
      details: error.message
    });
  }
});

// 관리자 API - 프롬프트
app.get('/api/admin/prompt', async (req, res) => {
  try {
    const prompt = await getSystemPrompt();
    res.json({ prompt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    await supabase
      .from('settings')
      .upsert({
        key: 'system_prompt',
        value: prompt,
        updated_at: new Date().toISOString()
      });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 관리자 API - 문서
app.get('/api/admin/documents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, content, metadata, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ documents: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/documents', async (req, res) => {
  try {
    const { title, url, date, content, source } = req.body;
    const { data, error } = await supabase
      .from('documents')
      .insert({
        content,
        metadata: { title, url, source },
        created_at: date || new Date().toISOString()
      })
      .select();
    if (error) throw error;
    res.json({ success: true, document: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행중입니다`);
  console.log(`🔍 Gemini 2.5 Flash + File Search API`);
  
  initializeFileSearchStore().catch(err => {
    console.error('⚠️ 초기화 실패:', err.message);
  });
});
