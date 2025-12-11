import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

// Google AI 클라이언트
const genAI = new GoogleGenerativeAI(API_KEY);

// File Search Store 이름 (메모리에 캐시)
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

// 🔥 Store 이름 Supabase에 저장
async function saveStoreName(storeName) {
  try {
    await supabase
      .from('settings')
      .upsert({ 
        key: 'file_search_store_name', 
        value: storeName,
        updated_at: new Date().toISOString()
      });
    console.log('✅ Store 이름 저장 완료');
  } catch (error) {
    console.error('⚠️ Store 이름 저장 실패:', error);
  }
}

// 🔥 Store 이름 Supabase에서 불러오기
async function loadStoreName() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'file_search_store_name')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('⚠️ Store 이름 조회 실패:', error);
      return null;
    }
    
    return data?.value || null;
  } catch (error) {
    console.error('⚠️ Store 이름 로드 실패:', error);
    return null;
  }
}

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

// 🔥 Google File Search Store 생성
async function createFileSearchStore() {
  try {
    console.log('📦 File Search Store 생성 중...');
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/fileSearchStores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        displayName: '철산랜드 여행 정보'
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Store 생성 실패: ${JSON.stringify(data)}`);
    }
    
    console.log(`✅ Store 생성 완료: ${data.name}`);
    return data.name;
  } catch (error) {
    console.error('❌ Store 생성 실패:', error);
    throw error;
  }
}

// 🔥 문서 하나를 Google File Search Store에 업로드
async function uploadDocumentToGoogle(storeName, doc, index) {
  try {
    const date = doc.metadata?.date || doc.metadata?.createdAt || '날짜 미상';
    const source = doc.metadata?.source || doc.metadata?.type || '출처 미상';
    const title = doc.metadata?.title || `문서 ${index}`;
    
    const fileContent = `제목: ${title}
출처: ${source}
날짜: ${date}

${doc.content}`;

    // FormData 생성
    const boundary = '----Boundary' + Math.random().toString(36);
    const bodyParts = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="document_${index}.txt"`,
      `Content-Type: text/plain`,
      ``,
      fileContent,
      `--${boundary}--`
    ];
    
    const body = bodyParts.join('\r\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/${storeName}:uploadToFileSearchStore`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'x-goog-api-key': API_KEY
        },
        body: body
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`업로드 실패: ${JSON.stringify(result)}`);
    }
    
    return result;
  } catch (error) {
    console.error(`⚠️ 문서 ${index} 업로드 실패:`, error.message);
    throw error;
  }
}

// 🔥 Supabase 전체 문서를 Google로 이전
async function migrateAllDocuments() {
  try {
    console.log('🚀 기존 문서 이전 시작...');
    
    // 1. Store 생성
    const storeName = await createFileSearchStore();
    fileSearchStoreName = storeName;
    await saveStoreName(storeName);
    
    // 2. Supabase에서 문서 가져오기
    const { data: documents, error: dbError } = await supabase
      .from('documents')
      .select('id, content, metadata');

    if (dbError) {
      throw new Error(`DB 조회 실패: ${dbError.message}`);
    }

    console.log(`📚 총 ${documents.length}개 문서 이전 중...`);
    
    // 3. 각 문서 업로드
    for (let i = 0; i < documents.length; i++) {
      await uploadDocumentToGoogle(storeName, documents[i], i + 1);
      
      if ((i + 1) % 50 === 0 || i === documents.length - 1) {
        console.log(`📤 진행률: ${i + 1}/${documents.length} (${Math.round((i + 1) / documents.length * 100)}%)`);
      }
      
      // Rate limiting 방지
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('🎉 모든 문서 이전 완료!');
    return storeName;
    
  } catch (error) {
    console.error('❌ 문서 이전 실패:', error);
    throw error;
  }
}

// 🔥 File Search Store 가져오기
async function getFileSearchStore() {
  if (fileSearchStoreName) {
    return fileSearchStoreName;
  }
  
  // Supabase에서 불러오기
  const savedName = await loadStoreName();
  if (savedName) {
    console.log(`✅ 저장된 Store 사용: ${savedName}`);
    fileSearchStoreName = savedName;
    return savedName;
  }
  
  // 없으면 이전 시작
  console.log('🔄 최초 실행: 문서 이전 시작...');
  return await migrateAllDocuments();
}

// 상태 체크
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: '철산랜드 RAG 서버 (File Search API - 완전 동기화 버전)',
    fileSearchStoreInitialized: !!fileSearchStoreName,
    storeName: fileSearchStoreName
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
1. File Search Tool을 사용하여 전체 문서에서 관련 정보 검색
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

// 🔧 관리자 API - Store 상태 확인
app.get('/api/admin/store-status', async (req, res) => {
  try {
    const storeName = fileSearchStoreName || await loadStoreName();
    
    if (!storeName) {
      return res.json({
        initialized: false,
        message: '아직 File Search Store가 생성되지 않았습니다.'
      });
    }
    
    // Store 정보 가져오기
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${storeName}`,
      {
        headers: {
          'x-goog-api-key': API_KEY
        }
      }
    );
    
    const storeInfo = await response.json();
    
    res.json({
      initialized: true,
      storeName,
      activeDocuments: storeInfo.activeDocumentsCount || '0',
      pendingDocuments: storeInfo.pendingDocumentsCount || '0',
      failedDocuments: storeInfo.failedDocumentsCount || '0'
    });
  } catch (error) {
    console.error('❌ Store 상태 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🔧 관리자 API - 수동으로 문서 이전 시작
app.post('/api/admin/migrate', async (req, res) => {
  try {
    console.log('🔄 수동 이전 시작...');
    
    // 기존 Store가 있으면 삭제
    const oldStoreName = fileSearchStoreName || await loadStoreName();
    if (oldStoreName) {
      console.log('🗑️ 기존 Store 삭제 중...');
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${oldStoreName}?force=true`,
        {
          method: 'DELETE',
          headers: {
            'x-goog-api-key': API_KEY
          }
        }
      );
    }
    
    fileSearchStoreName = null;
    const newStoreName = await migrateAllDocuments();
    
    res.json({ 
      success: true, 
      message: '✅ 모든 문서가 Google File Search Store로 이전되었습니다!',
      storeName: newStoreName
    });
  } catch (error) {
    console.error('❌ 이전 실패:', error);
    res.status(500).json({ error: error.message });
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

// 관리자 API - 문서 업로드 (양쪽 동시 저장)
app.post('/api/admin/upload', async (req, res) => {
  try {
    const { content, metadata } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: '내용을 입력해주세요' });
    }

    console.log('📤 문서 업로드 시작...');

    // 1. Supabase에 저장
    const { data: newDoc, error: dbError } = await supabase
      .from('documents')
      .insert({
        content,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (dbError) throw dbError;
    console.log('✅ Supabase 저장 완료');

    // 2. Google File Search Store에도 업로드
    const storeName = await getFileSearchStore();
    const totalDocs = await supabase.from('documents').select('id', { count: 'exact', head: true });
    
    await uploadDocumentToGoogle(storeName, newDoc, totalDocs.count || 1);
    console.log('✅ Google File Search Store 업로드 완료');

    res.json({ 
      success: true, 
      message: '✅ 문서가 양쪽 모두에 업로드되었습니다! 바로 사용 가능합니다.' 
    });
  } catch (error) {
    console.error('❌ 문서 업로드 실패:', error);
    res.status(500).json({ 
      error: '문서 업로드 실패',
      details: error.message 
    });
  }
});

// 관리자 API - 문서 삭제 (양쪽 동기화)
app.delete('/api/admin/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Supabase에서 삭제
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
    console.log('✅ Supabase 삭제 완료');

    // Google File Search Store 재생성 예약
    console.log('🔄 Google Store 재생성이 필요합니다. /api/admin/migrate를 실행하세요.');

    res.json({ 
      success: true, 
      message: '✅ 문서가 삭제되었습니다. 변경사항을 반영하려면 관리자 페이지에서 "문서 재동기화" 버튼을 클릭하세요.' 
    });
  } catch (error) {
    console.error('❌ 문서 삭제 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행중입니다`);
  console.log(`🎯 Gemini 2.0 Flash + File Search API (완전 동기화)`);
  
  // 서버 시작 시 Store 확인
  try {
    const savedStore = await loadStoreName();
    if (savedStore) {
      fileSearchStoreName = savedStore;
      console.log(`✅ 기존 File Search Store 사용: ${savedStore}`);
    } else {
      console.log(`⚠️ File Search Store가 없습니다. 첫 질문 시 자동으로 생성됩니다.`);
      console.log(`💡 또는 관리자 페이지에서 "문서 이전 시작" 버튼을 클릭하세요.`);
    }
  } catch (error) {
    console.error('⚠️ Store 확인 실패:', error);
  }
});
