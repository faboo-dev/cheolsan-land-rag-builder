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

// File Search Store 정보
let fileSearchStoreName = null;
let uploadedFilesCount = 0;

// ==================== File Search Store 관리 (REST API) ====================

// 지연 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Store 이름 로드
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

// Store 이름 저장
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

// File Search Store 생성
async function createFileSearchStore() {
  try {
    console.log('🔵 File Search Store 생성 중...');
    
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
    
    console.log('✅ File Search Store 생성:', fileSearchStoreName);
    return fileSearchStoreName;
  } catch (error) {
    console.error('❌ Store 생성 오류:', error);
    throw error;
  }
}

// 문서를 File Search Store에 업로드
async function uploadDocumentsToFileSearchStore() {
  try {
    console.log('📚 Supabase 문서 로딩 중...');
    
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, content, metadata, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`📄 총 ${documents.length}개 문서 발견`);

    if (!fileSearchStoreName) {
      await createFileSearchStore();
    }

    let successCount = 0;
    let failCount = 0;

    // 순차 업로드 (Rate Limit 방지)
    for (let idx = 0; idx < documents.length; idx++) {
      const doc = documents[idx];
      
      try {
        const title = doc.metadata?.title || `문서-${idx + 1}`;
        const date = doc.created_at ? new Date(doc.created_at).toISOString().split('T')[0] : '날짜없음';
        const source = doc.metadata?.source || '출처없음';
        
        const fileName = `[${date}] ${title}`.substring(0, 100);
        
        console.log(`⏳ [${idx + 1}/${documents.length}] 업로드 중: ${fileName}...`);

        // 텍스트 파일 내용 생성
        const fileContent = `제목: ${title}
날짜: ${date}
출처: ${source}

${doc.content}`;

        // Blob 생성
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, `${fileName}.txt`);
        formData.append('metadata', JSON.stringify({
          displayName: fileName,
          mimeType: 'text/plain'
        }));

        // REST API로 업로드
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
          failCount++;
          
          // Rate Limit 오류 처리
          if (errorData.error?.status === 'RESOURCE_EXHAUSTED' || uploadResponse.status === 429) {
            console.log('⚠️ Rate Limit 감지 - 60초 대기...');
            await delay(60000);
          }
          continue;
        }

        successCount++;
        console.log(`✅ [${idx + 1}/${documents.length}] 업로드 완료: ${fileName}`);

        // Rate Limit 방지
        if ((idx + 1) % 10 === 0) {
          console.log(`⏸️ 진행률: ${idx + 1}/${documents.length} - 3초 대기...`);
          await delay(3000);
        } else {
          await delay(500);
        }

      } catch (error) {
        failCount++;
        console.error(`❌ [${idx + 1}] 오류:`, error.message);
        
        if (error.message.includes('429') || error.message.includes('quota')) {
          console.log('⚠️ Rate Limit - 30초 대기...');
          await delay(30000);
        }
      }
    }

    uploadedFilesCount = successCount;
    console.log(`🎉 업로드 완료: ${successCount}개 성공, ${failCount}개 실패`);
    
    // 업로드 카운트 저장
    await supabase
      .from('settings')
      .upsert({
        key: 'uploaded_files_count',
        value: String(successCount),
        updated_at: new Date().toISOString()
      });

    return successCount;

  } catch (error) {
    console.error('❌ 업로드 오류:', error);
    throw error;
  }
}

// 초기화
async function initializeFileSearchStore() {
  try {
    console.log('🔵 File Search Store 초기화...');
    
    await loadStoreName();

    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    console.log(`📊 Supabase 문서: ${count}개`);

    // Store가 없거나 문서 개수 변경 시 재업로드
    if (!fileSearchStoreName || uploadedFilesCount !== count) {
      console.log('🔄 문서 업로드 필요...');
      await uploadDocumentsToFileSearchStore();
    } else {
      console.log('✅ File Search Store 이미 초기화됨');
    }

  } catch (error) {
    console.error('❌ 초기화 오류:', error);
  }
}

// ==================== Supabase 프롬프트 ====================

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
- 세부/보홀 여행 전문가로서 정확하고 실용적인 정보를 제공합니다
- Google File Search API를 통해 563개의 여행 문서를 검색하여 답변합니다

**답변 규칙:**
1. 📌 **출처 표시 필수**: 정보를 언급할 때 반드시 [[1]], [[2]] 형식으로 출처 번호를 표시하세요
2. 📅 **최신 정보 우선**: 날짜가 표시된 문서 중 가장 최근 정보를 우선하세요
3. 🎯 **구체적 답변**: 가격, 위치, 시간, 연락처 등 구체적 정보를 포함하세요
4. ⚠️ **정보 없음 명시**: 문서에 없는 내용은 "제공된 자료에 해당 내용이 없습니다"라고 명시하세요
5. 📝 **마크다운 사용**: 제목, 목록, 강조를 활용하여 읽기 쉽게 작성하세요
6. 🔗 **관련 정보 추가**: 질문과 관련된 다른 유용한 정보도 함께 제공하세요
7. 💡 **실용적 팁**: 여행자가 실제로 도움받을 수 있는 팁을 추가하세요`;
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
    const { query, systemInstruction, useWebSearch } = req.body;

    if (!query) {
      return res.status(400).json({ error: '질문을 입력해주세요' });
    }

    console.log('📥 질문:', query);

    if (!fileSearchStoreName) {
      console.log('⚠️ File Search Store 없음 - 초기화 시작');
      await initializeFileSearchStore();
    }

    // 프롬프트
    const customPrompt = await getSystemPrompt();
    const finalPrompt = systemInstruction || customPrompt;

    console.log('🤖 Gemini 호출 중 (File Search API 모드)...');

    // Gemini 2.0 Flash with File Search Tool
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      tools: [{
        fileSearchTool: {
          fileSearchStore: fileSearchStoreName
        }
      }]
    });

    const result = await model.generateContent([
      { text: `${finalPrompt}\n\n**사용자 질문:**\n${query}` }
    ]);

    const answer = result.response.text();

    console.log('✅ Gemini 응답 받음');

    // 출처 정보 (File Search에서 자동 생성)
    const sources = [
      {
        id: 1,
        title: 'File Search Store',
        content: `총 ${uploadedFilesCount}개의 문서에서 검색되었습니다.`
      }
    ];

    res.json({
      answer,
      sources,
      usingFileSearchAPI: true
    });

  } catch (error) {
    console.error('❌ 서버 에러:', error);
    res.status(500).json({
      error: 'AI 답변 생성에 실패했습니다.',
      details: error.message
    });
  }
});

// 관리자 API - 파일 재업로드
app.post('/api/admin/refresh-files', async (req, res) => {
  try {
    console.log('🔄 파일 강제 재업로드...');
    fileSearchStoreName = null;
    await initializeFileSearchStore();
    res.json({ success: true, filesCount: uploadedFilesCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
  console.log(`🔍 File Search API 사용`);
  
  // 비동기 초기화
  initializeFileSearchStore().catch(err => {
    console.error('⚠️ 초기화 실패 (서버는 계속 실행):', err.message);
  });
});
