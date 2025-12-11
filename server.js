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

// File Search Store 정보 (메모리 저장)
let fileSearchStoreName = null;
let lastDocumentCount = 0;

// ==================== File Search Store 관리 ====================

// Supabase settings 테이블에서 Store 이름 로드
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
    console.log('⚠️ Store 이름 로드 실패 (테이블 없음 가능성)');
  }
  return null;
}

// Supabase settings 테이블에 Store 이름 저장
async function saveStoreName(storeName) {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'file_search_store_name', value: storeName, updated_at: new Date().toISOString() });

    if (!error) {
      console.log('✅ File Search Store 저장:', storeName);
    }
  } catch (error) {
    console.error('⚠️ Store 이름 저장 실패:', error.message);
  }
}

// File Search Store 생성 (REST API 직접 호출)
async function createFileSearchStore() {
  try {
    console.log('🔵 새로운 File Search Store 생성 중...');
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: `철산랜드-RAG-${Date.now()}`
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Store 생성 실패: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    fileSearchStoreName = data.name;
    
    await saveStoreName(fileSearchStoreName);
    
    console.log('✅ File Search Store 생성 완료:', fileSearchStoreName);
    return fileSearchStoreName;
  } catch (error) {
    console.error('❌ File Search Store 생성 오류:', error);
    throw error;
  }
}

// Supabase 문서를 Google File API에 업로드
async function uploadDocumentsToFileAPI() {
  try {
    console.log('📚 Supabase 문서 로딩 중...');
    
    const { data: documents, error } = await supabase
      .from('documents')
      .select('content, metadata');

    if (error) throw error;

    console.log(`📄 총 ${documents.length}개 문서 발견`);

    if (!fileSearchStoreName) {
      await createFileSearchStore();
    }

    // 각 문서를 텍스트 파일로 변환하여 업로드
    const uploadPromises = documents.map(async (doc, idx) => {
      try {
        const title = doc.metadata?.title || `문서-${idx + 1}`;
        const content = doc.content;
        
        // Blob 생성
        const blob = new Blob([content], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, `${title}.txt`);

        // 파일 업로드 (REST API)
        const uploadResponse = await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/${fileSearchStoreName}:uploadToFileSearchStore?key=${API_KEY}`,
          {
            method: 'POST',
            body: formData
          }
        );

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          console.error(`⚠️ [${idx + 1}] 업로드 실패:`, errorData);
          return null;
        }

        const uploadData = await uploadResponse.json();
        console.log(`✅ [${idx + 1}/${documents.length}] 업로드 완료: ${title}`);
        return uploadData;

      } catch (error) {
        console.error(`❌ [${idx + 1}] 업로드 오류:`, error.message);
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const successCount = results.filter(r => r !== null).length;

    console.log(`🎉 업로드 완료: ${successCount}/${documents.length}개 성공`);
    
    lastDocumentCount = documents.length;
    
    return successCount;

  } catch (error) {
    console.error('❌ 문서 업로드 오류:', error);
    throw error;
  }
}

// 서버 시작 시 자동 초기화
async function initializeFileSearchStore() {
  try {
    console.log('🔵 File Search Store 초기화 시작...');
    
    // 1. 기존 Store 로드 시도
    await loadStoreName();

    // 2. Supabase 문서 개수 확인
    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    console.log(`📊 현재 Supabase 문서: ${count}개, 마지막 업로드: ${lastDocumentCount}개`);

    // 3. Store가 없거나 문서 개수가 변경된 경우 재생성
    if (!fileSearchStoreName || count !== lastDocumentCount) {
      console.log('🔄 문서 업로드 필요...');
      await uploadDocumentsToFileAPI();
    } else {
      console.log('✅ File Search Store 이미 초기화됨 (업로드 생략)');
    }

  } catch (error) {
    console.error('❌ 초기화 오류:', error);
  }
}

// ==================== API 엔드포인트 ====================

// 상태 체크
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: '철산랜드 RAG 서버 (File Search API - 수정 버전)',
    fileSearchStoreInitialized: !!fileSearchStoreName,
    storeName: fileSearchStoreName
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

    // File Search Store 확인
    if (!fileSearchStoreName) {
      console.log('⚠️ File Search Store 없음 - 초기화 시작');
      await initializeFileSearchStore();
    }

    // 1. Supabase에서 문서 가져오기 (백업용)
    const { data: documents, error: dbError } = await supabase
      .from('documents')
      .select('content, metadata')
      .limit(100);

    if (dbError) {
      console.error('❌ Supabase 에러:', dbError);
    }

    // 2. 컨텍스트 생성
    const contextText = documents
      ?.map((doc, idx) => `[문서 ${idx + 1}]\n${doc.content}`)
      .join('\n\n---\n\n') || '';

    // 3. Gemini API 호출 (File Search Tool 제거, 일반 모드)
    console.log('🤖 Gemini 호출 중 (일반 모드)...');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });

    const prompt = `${systemInstruction || '당신은 철산랜드의 친절한 AI 어시스턴트입니다.'}\n\n**제공된 문서:**\n${contextText}\n\n**사용자 질문:**\n${query}\n\n**답변 규칙:**\n1. 제공된 문서 내용을 기반으로 정확하게 답변하세요\n2. 정보를 언급할 때 [[1]], [[2]] 형식으로 출처번호를 표시하세요\n3. 마크다운 문법을 사용하세요\n4. 문서에 없는 내용은 "제공된 자료에 해당 내용이 없습니다"라고 명시하세요`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    console.log('✅ Gemini 응답 받음');

    // 4. 응답 반환
    res.json({
      answer,
      sources: documents?.slice(0, 10).map((doc, idx) => ({
        id: idx + 1,
        title: doc.metadata?.title || `문서 ${idx + 1}`,
        content: doc.content.substring(0, 200) + '...'
      })) || []
    });

  } catch (error) {
    console.error('❌ 서버 에러:', error);
    res.status(500).json({
      error: 'AI 답변 생성에 실패했습니다.',
      details: error.message
    });
  }
});

// File Search Store 강제 새로고침
app.post('/api/admin/refresh-file', async (req, res) => {
  try {
    console.log('🔄 File Search Store 강제 새로고침 시작...');
    
    fileSearchStoreName = null;
    await initializeFileSearchStore();

    res.json({
      success: true,
      message: 'File Search Store 새로고침 완료',
      storeName: fileSearchStoreName
    });
  } catch (error) {
    console.error('❌ 새로고침 오류:', error);
    res.status(500).json({
      error: '새로고침 실패',
      details: error.message
    });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행중입니다`);
  
  // 서버 시작 시 File Search Store 초기화 (비동기)
  initializeFileSearchStore().catch(err => {
    console.error('⚠️ 초기화 실패 (서버는 계속 실행):', err.message);
  });
});
