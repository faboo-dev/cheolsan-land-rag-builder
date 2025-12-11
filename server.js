import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, GoogleAIFileManager } from '@google/generative-ai';

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
const fileManager = new GoogleAIFileManager(API_KEY);

// File 정보 저장 (메모리)
let uploadedFiles = [];
let lastDocumentCount = 0;

// ==================== 유틸리티 함수 ====================

// 지연 함수 (Rate Limit 방지)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Supabase settings에서 파일 목록 로드
async function loadUploadedFiles() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'uploaded_files')
      .single();

    if (!error && data) {
      uploadedFiles = JSON.parse(data.value);
      console.log(`✅ 업로드된 파일 로드: ${uploadedFiles.length}개`);
      return uploadedFiles;
    }
  } catch (error) {
    console.log('⚠️ 파일 목록 로드 실패');
  }
  return [];
}

// Supabase settings에 파일 목록 저장
async function saveUploadedFiles() {
  try {
    await supabase
      .from('settings')
      .upsert({
        key: 'uploaded_files',
        value: JSON.stringify(uploadedFiles),
        updated_at: new Date().toISOString()
      });
    console.log(`✅ 파일 목록 저장: ${uploadedFiles.length}개`);
  } catch (error) {
    console.error('⚠️ 파일 목록 저장 실패:', error.message);
  }
}

// ==================== 문서 업로드 ====================

// Supabase 문서를 Google File API에 업로드
async function uploadDocumentsToFileAPI() {
  try {
    console.log('📚 Supabase 문서 로딩 중...');
    
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, content, metadata, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`📄 총 ${documents.length}개 문서 발견`);

    let successCount = 0;
    let failCount = 0;

    // 순차 업로드 (Rate Limit 방지)
    for (let idx = 0; idx < documents.length; idx++) {
      const doc = documents[idx];
      
      try {
        const title = doc.metadata?.title || `문서-${idx + 1}`;
        const date = doc.created_at ? new Date(doc.created_at).toISOString().split('T')[0] : '날짜없음';
        
        // 파일명에 날짜 포함
        const fileName = `[${date}] ${title}`.substring(0, 100);
        
        console.log(`⏳ [${idx + 1}/${documents.length}] 업로드 중: ${fileName}...`);

        // Blob 생성
        const content = `제목: ${title}\n날짜: ${date}\n출처: ${doc.metadata?.source || '알 수 없음'}\n\n${doc.content}`;
        const blob = new Blob([content], { type: 'text/plain' });
        
        // File API 업로드 (Google AI File Manager 사용)
        const uploadResult = await fileManager.uploadFile(
          new File([blob], `${fileName}.txt`, { type: 'text/plain' }),
          {
            mimeType: 'text/plain',
            displayName: fileName
          }
        );

        uploadedFiles.push({
          name: uploadResult.file.name,
          uri: uploadResult.file.uri,
          displayName: fileName,
          docId: doc.id
        });

        successCount++;
        console.log(`✅ [${idx + 1}/${documents.length}] 업로드 완료: ${fileName}`);

        // Rate Limit 방지 (매 10개마다 3초 대기)
        if ((idx + 1) % 10 === 0) {
          console.log(`⏸️ Rate Limit 방지 대기 중... (${idx + 1}/${documents.length})`);
          await delay(3000);
        } else {
          await delay(500); // 기본 0.5초 대기
        }

      } catch (error) {
        failCount++;
        console.error(`❌ [${idx + 1}/${documents.length}] 업로드 실패:`, error.message);
        
        // Rate Limit 오류 시 더 긴 대기
        if (error.message.includes('429') || error.message.includes('quota')) {
          console.log('⚠️ Rate Limit 감지 - 30초 대기...');
          await delay(30000);
        }
      }
    }

    console.log(`🎉 업로드 완료: ${successCount}개 성공, ${failCount}개 실패`);
    
    lastDocumentCount = documents.length;
    
    // 업로드된 파일 목록 저장
    await saveUploadedFiles();
    
    return successCount;

  } catch (error) {
    console.error('❌ 문서 업로드 오류:', error);
    throw error;
  }
}

// 서버 시작 시 자동 초기화
async function initializeFiles() {
  try {
    console.log('🔵 파일 초기화 시작...');
    
    // 1. 기존 파일 목록 로드
    await loadUploadedFiles();

    // 2. Supabase 문서 개수 확인
    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    console.log(`📊 현재 Supabase 문서: ${count}개, 마지막 업로드: ${lastDocumentCount}개`);

    // 3. 파일이 없거나 문서 개수가 변경된 경우 재업로드
    if (uploadedFiles.length === 0 || count !== lastDocumentCount) {
      console.log('🔄 문서 업로드 필요...');
      uploadedFiles = []; // 초기화
      await uploadDocumentsToFileAPI();
    } else {
      console.log('✅ 파일 이미 업로드됨 (재업로드 생략)');
    }

  } catch (error) {
    console.error('❌ 초기화 오류:', error);
  }
}

// ==================== Supabase에서 프롬프트 가져오기 ====================

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
    console.log('⚠️ 커스텀 프롬프트 없음 - 기본 프롬프트 사용');
  }

  // 기본 강력한 프롬프트
  return `당신은 철산랜드의 전문 여행 컨설턴트 AI입니다.

**역할:**
- 세부/보홀 여행 전문가로서 정확하고 실용적인 정보를 제공합니다
- 제공된 563개의 여행 문서를 기반으로 답변합니다

**답변 규칙:**
1. 📌 **출처 표시 필수**: 정보를 언급할 때 반드시 [[1]], [[2]] 형식으로 출처 번호를 표시하세요
2. 📅 **최신 정보 우선**: 여러 문서에 같은 내용이 있다면 가장 최근 날짜의 정보를 사용하세요
3. 🎯 **구체적 답변**: 가격, 위치, 시간 등 구체적 정보를 포함하세요
4. ⚠️ **정보 없음 명시**: 문서에 없는 내용은 "제공된 자료에 해당 내용이 없습니다"라고 명시하세요
5. 📝 **마크다운 사용**: 읽기 쉽게 제목, 목록, 강조를 활용하세요
6. 🔗 **관련 정보 연결**: 질문과 관련된 다른 유용한 정보도 함께 제공하세요

**예시:**
사용자: "세부 호핑투어 추천해줘"
답변:
# 🏝️ 세부 호핑투어 추천

세부에는 다양한 호핑투어가 있습니다 [[1]]:

## 인기 호핑투어
1. **놀자 호핑투어** - 가성비 좋은 선택 [[2]]
2. **클럽세부 호핑투어** - 럭셔리 경험 [[3]]
3. **해적 호핑투어** - 독특한 컨셉 [[4]]

(... 구체적 정보 계속 ...)`;
}

// ==================== API 엔드포인트 ====================

// 상태 체크
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: '철산랜드 RAG 서버 (File API 완전 버전)',
    uploadedFilesCount: uploadedFiles.length,
    lastDocumentCount: lastDocumentCount
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

    // 파일 업로드 확인
    if (uploadedFiles.length === 0) {
      console.log('⚠️ 파일 없음 - 초기화 시작');
      await initializeFiles();
    }

    // 프롬프트 가져오기
    const customPrompt = await getSystemPrompt();
    const finalPrompt = systemInstruction || customPrompt;

    console.log('🤖 Gemini 호출 중 (File API 모드)...');

    // Gemini 모델 생성 (파일 참조)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro' // File API는 1.5-pro만 지원
    });

    // 파일 URI 배열 생성
    const fileParts = uploadedFiles.slice(0, 100).map(file => ({
      fileData: {
        fileUri: file.uri,
        mimeType: 'text/plain'
      }
    }));

    // Gemini에 전송
    const result = await model.generateContent([
      { text: `${finalPrompt}\n\n**사용자 질문:**\n${query}` },
      ...fileParts
    ]);

    const answer = result.response.text();

    console.log('✅ Gemini 응답 받음');

    // 출처 생성
    const sources = uploadedFiles.slice(0, 10).map((file, idx) => ({
      id: idx + 1,
      title: file.displayName,
      content: `파일: ${file.name}`
    }));

    res.json({
      answer,
      sources,
      usingCustomPrompt: systemInstruction ? false : true
    });

  } catch (error) {
    console.error('❌ 서버 에러:', error);
    res.status(500).json({
      error: 'AI 답변 생성에 실패했습니다.',
      details: error.message
    });
  }
});

// 파일 강제 재업로드
app.post('/api/admin/refresh-files', async (req, res) => {
  try {
    console.log('🔄 파일 강제 재업로드 시작...');
    
    uploadedFiles = [];
    await uploadDocumentsToFileAPI();

    res.json({
      success: true,
      message: '파일 재업로드 완료',
      filesCount: uploadedFiles.length
    });
  } catch (error) {
    console.error('❌ 재업로드 오류:', error);
    res.status(500).json({
      error: '재업로드 실패',
      details: error.message
    });
  }
});

// ==================== 관리자 API ====================

// 프롬프트 가져오기
app.get('/api/admin/prompt', async (req, res) => {
  try {
    const prompt = await getSystemPrompt();
    res.json({ prompt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 프롬프트 저장
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

    res.json({ success: true, message: '프롬프트 저장 완료' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 문서 목록 조회
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

// 문서 추가
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

    // 새 문서 즉시 업로드
    const fileName = `[${date}] ${title}`;
    const blob = new Blob([content], { type: 'text/plain' });
    
    const uploadResult = await fileManager.uploadFile(
      new File([blob], `${fileName}.txt`, { type: 'text/plain' }),
      { mimeType: 'text/plain', displayName: fileName }
    );

    uploadedFiles.push({
      name: uploadResult.file.name,
      uri: uploadResult.file.uri,
      displayName: fileName,
      docId: data[0].id
    });

    await saveUploadedFiles();

    res.json({ success: true, document: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 문서 삭제
app.delete('/api/admin/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // 파일 목록에서 제거
    uploadedFiles = uploadedFiles.filter(file => file.docId !== parseInt(id));
    await saveUploadedFiles();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행중입니다`);
  
  // 서버 시작 시 파일 초기화 (비동기)
  initializeFiles().catch(err => {
    console.error('⚠️ 초기화 실패 (서버는 계속 실행):', err.message);
  });
});
