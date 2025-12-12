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

// ==================== 유틸리티 함수 ====================

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

// 업로드 카운트 로드
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

// 업로드 카운트 저장
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

// ==================== Store 삭제 ====================

async function deleteFileSearchStore() {
  try {
    if (!fileSearchStoreName) {
      console.log('⚠️ 삭제할 Store가 없음');
      return;
    }

    console.log('🗑️ File Search Store 삭제 중:', fileSearchStoreName);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileSearchStoreName}?key=${API_KEY}`,
      {
        method: 'DELETE'
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Store 삭제 실패:', errorData);
    } else {
      console.log('✅ File Search Store 삭제 완료');
      fileSearchStoreName = null;
      uploadedFilesCount = 0;
      
      // Supabase에서도 삭제
      await supabase.from('settings').delete().eq('key', 'file_search_store_name');
      await supabase.from('settings').delete().eq('key', 'uploaded_files_count');
    }

  } catch (error) {
    console.error('❌ Store 삭제 오류:', error);
  }
}

// ==================== Store 생성 ====================

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

// ==================== 초기화 (업로드 제거됨) ====================

async function initializeFileSearchStore() {
  try {
    console.log('🔵 File Search Store 정보 로드 중...');
    
    await loadStoreName();
    await loadUploadedCount();

    if (!fileSearchStoreName) {
      console.log('⚠️ Store가 없습니다. 로컬 스크립트로 업로드해주세요.');
      console.log('📝 또는 /api/admin/refresh-files API를 호출하세요.');
    } else {
      console.log('✅ File Search Store 사용 준비 완료');
      console.log(`📊 Store: ${fileSearchStoreName}`);
      console.log(`📄 문서 수: ${uploadedFilesCount}개`);
    }

  } catch (error) {
    console.error('❌ 초기화 오류:', error);
  }
}

// ==================== 문서 업로드 (관리자 API용) ====================

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

    // 순차 업로드
    for (let idx = 0; idx < documents.length; idx++) {
      const doc = documents[idx];
      
      try {
        // Supabase metadata에서 모든 정보 추출
        const title = doc.metadata?.title || `문서-${idx + 1}`;
        const date = doc.metadata?.date || (doc.created_at ? new Date(doc.created_at).toISOString().split('T')[0] : '날짜없음');
        const type = doc.metadata?.type || 'BLOG';
        const url = doc.metadata?.url || '';
        const sourceId = doc.metadata?.sourceId || '';
        const chunkIndex = doc.metadata?.chunkIndex || 0;
        
        const fileName = `[${date}] ${title}`.substring(0, 100);
        
        console.log(`⏳ [${idx + 1}/${documents.length}] 업로드 중: ${fileName}...`);

        // 모든 메타데이터 포함
        const fileContent = `제목: ${title}
날짜: ${date}
타입: ${type}
URL: ${url}
SourceID: ${sourceId}
ChunkIndex: ${chunkIndex}

${doc.content}`;

        // Blob 생성
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, `${fileName}.txt`);

        // 재시도 로직
        let uploadSuccess = false;
        let retryCount = 0;
        
        while (!uploadSuccess && retryCount < 3) {
          try {
            const uploadResponse = await fetch(
              `https://generativelanguage.googleapis.com/upload/v1beta/${fileSearchStoreName}:uploadToFileSearchStore?key=${API_KEY}`,
              {
                method: 'POST',
                body: formData
              }
            );

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              
              if (errorData.error?.status === 'RESOURCE_EXHAUSTED' || uploadResponse.status === 429) {
                console.log(`⚠️ Rate Limit - ${retryCount + 1}번째 재시도 전 60초 대기...`);
                await delay(60000);
                retryCount++;
                continue;
              }
              
              console.error(`❌ [${idx + 1}] 업로드 실패:`, errorData);
              throw new Error(JSON.stringify(errorData));
            }

            uploadSuccess = true;
            successCount++;
            console.log(`✅ [${idx + 1}/${documents.length}] 업로드 완료: ${fileName}`);

          } catch (fetchError) {
            console.error(`⚠️ [${idx + 1}] Fetch 오류 (재시도 ${retryCount + 1}/3):`, fetchError.message);
            retryCount++;
            if (retryCount < 3) {
              await delay(30000);
            }
          }
        }

        if (!uploadSuccess) {
          failCount++;
          console.error(`❌ [${idx + 1}] 최종 실패: ${fileName}`);
        }

        // Rate Limit 방지
        if ((idx + 1) % 3 === 0) {
          console.log(`⏸️ 진행률: ${idx + 1}/${documents.length} - 15초 대기...`);
          await delay(15000);
        } else {
          await delay(2000);
        }

        // 50개마다 중간 저장
        if ((idx + 1) % 50 === 0) {
          console.log(`💾 중간 저장: ${successCount}개 업로드 완료`);
          await saveUploadedCount(successCount);
        }

      } catch (error) {
        failCount++;
        console.error(`❌ [${idx + 1}] 오류:`, error.message);
        await delay(5000);
      }
    }

    uploadedFilesCount = successCount;
    console.log(`🎉 업로드 완료: ${successCount}개 성공, ${failCount}개 실패`);
    
    await saveUploadedCount(successCount);

    return successCount;

  } catch (error) {
    console.error('❌ 업로드 오류:', error);
    throw error;
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
1. 📌 **출처 표시 필수**: 정보를 언급할 때 반드시 [[1]], [[2]] 형식으로 출처 번호를 표시하세요
2. 📅 **최신 정보 우선**: 날짜가 표시된 문서 중 가장 최근 정보를 우선하세요
3. 🎯 **구체적 답변**: 가격, 위치, 시간, 연락처 등 구체적 정보를 포함하세요
4. 🔗 **원본 링크 제공**: 
   - YouTube 영상의 경우: URL과 타임스탬프 함께 제공
   - 블로그 글의 경우: URL 제공
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
    const { query, systemInstruction, useWebSearch } = req.body;

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

    console.log('🤖 Gemini 1.5 Flash 호출 중 (File Search API 모드)...');

    // File Search API 지원 모델 사용
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
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

    // 출처 정보
    const sources = [
      {
        id: 1,
        title: 'File Search Store',
        content: `총 ${uploadedFilesCount}개의 문서에서 검색되었습니다.`,
        date: new Date().toISOString().split('T')[0]
      }
    ];

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

// 관리자 API - Store 초기화 (삭제)
app.post('/api/admin/reset-store', async (req, res) => {
  try {
    console.log('🔄 Store 초기화 시작...');
    await deleteFileSearchStore();
    res.json({ success: true, message: 'Store 삭제 완료. 로컬 스크립트로 재업로드하세요.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 관리자 API - 파일 재업로드 (주의: Render 무료 플랜에서는 타임아웃 가능)
app.post('/api/admin/refresh-files', async (req, res) => {
  try {
    console.log('🔄 파일 강제 재업로드...');
    fileSearchStoreName = null;
    uploadedFilesCount = 0;
    
    // Store 생성
    await createFileSearchStore();
    
    // 업로드 시작 (백그라운드)
    uploadDocumentsToFileSearchStore().catch(err => {
      console.error('⚠️ 백그라운드 업로드 실패:', err.message);
    });
    
    res.json({ 
      success: true, 
      message: '업로드가 백그라운드에서 시작되었습니다. 완료까지 시간이 걸릴 수 있습니다.',
      storeName: fileSearchStoreName
    });
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
  console.log(`🔍 File Search API 사용 (gemini-1.5-flash)`);
  
  // Store 정보만 로드 (자동 업로드 제거됨)
  initializeFileSearchStore().catch(err => {
    console.error('⚠️ 초기화 실패 (서버는 계속 실행):', err.message);
  });
});
