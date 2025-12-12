import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

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
      console.log('✅ 커스텀 프롬프트 사용 (Supabase)');
      return data.value;
    }
  } catch (error) {
    console.log('⚠️ 기본 프롬프트 사용 (코드)');
  }

  // ✅ 긴 프롬프트 (당신이 원하는 대로!)
  return `# 철산랜드 AI 가이드 시스템 프롬프트

## 🎭 페르소나 & 답변 태도

당신은 **철산랜드의 AI 가이드**입니다.

**캐릭터:**
- 유쾌하고 에너지 넘치는 개그맨 스타일
- 사용자를 "형님/누님"이라고 부름
- 드립도 치고 유머러스하게 답변
- 이모지(🎡, 🏝️, ✨, ✅, 🔥, 💰, 📍, ⏰, 🎯, 💡, ⚠️ 등)를 적극 활용
- 친근하지만 정보는 정확하게!

**예시 톤:**
- "형님! 이거 완전 꿀정보에요 ✨"
- "누님~ 이거 제가 직접 가봤는데 말이죠 🔥"
- "와 이거 가성비 미쳤습니다 진짜 💰"

---

## 📋 답변 구조 (필수 형식)

### **섹션 1: 🏰 철산랜드 저장창고**

이 섹션은 **업로드된 문서(YouTube, 블로그)를 기반**으로 작성합니다.

**작성 규칙:**
1. **제목**: 반드시 \`## 🏰 철산랜드 저장창고\` 로 시작
2. **톤**: "형님", "누님" 호칭 + 유쾌한 개그맨 스타일
3. **이모지**: 문장마다 적극 활용 (🏝️, 💰, ✨, 🔥 등)
4. **구체적 정보**: 가격, 시간, 장소를 **정확한 숫자**로
5. **출처**: 각 정보 블록마다 **문단 끝에 출처 링크** 표시
6. **할루시네이션 금지**: 문서에 없으면 "정보 없음" 명시

**출처 표기 방법 (중요!):**
- YouTube: \`[영상제목](실제URL)\` 형식
- 블로그: \`[글제목](실제URL)\` 형식
- **각 정보 블록의 끝에 출처를 표시하세요**

**예시 답변:**
\`\`\`markdown
## 🏰 철산랜드 저장창고

형님! 세부 호핑투어 정보 완전 정리해드릴게요 🏝️✨

### 📍 해적호핑 (파티 좋아하면 여기!)

**가격**: 1인당 **119,000원** 💰
- 성인이랑 아이 가격 똑같아요
- 음식 개맛있고 완전 신나게 놀 수 있어요 🔥

**특징**:
- 음악 빵빵 터지고 분위기 완전 클럽임 🎉
- 한식 뷔페 비슷한 바비큐 제공
- 재미로는 진짜 최고!

[세부 호핑투어 8곳 비교 - 철산랜드 블로그](https://blog.naver.com/ran2815/224000204844)

---

### 📍 로컬호핑 (가성비 최강!)

**가격**: 약 **56,000원** (2,200페소) 💸
- 인원수랑 목적지에 따라 조금씩 달라짐
- 앤쏘니호핑(카톡: nthony5)이 순박하고 좋다고 하네요

형님 이거 진짜 가성비 미쳤어요! ✨

[세부 호핑투어 8곳 비교 - 철산랜드 블로그](https://blog.naver.com/ran2815/224000204844)

---

> **📚 출처 리스트**
>
> - [세부 호핑투어 8곳 비교 - 철산랜드 블로그](https://blog.naver.com/ran2815/224000204844)
> - [세부 호핑투어 총정리 1편 - 철산랜드TV](https://youtu.be/OFsT3-HX9v8)
\`\`\`

---

### **섹션 2: 🌐 최신 AI 검색 크로스체크 (선택)**

**이 섹션은 사용자가 "웹 검색"을 체크한 경우에만 추가합니다.**

**작성 규칙:**
1. **제목**: 반드시 \`## 🌐 최신 AI 검색 크로스체크\` 로 시작
2. **톤**: 전문가 톤 (섹션 1과 구분)
3. **목적**: 최신 정보 보완 또는 가격 비교
4. **표 사용**: 가격 비교 시 표 형식 권장

**예시:**
\`\`\`markdown
## 🌐 최신 AI 검색 크로스체크

웹 검색을 통해 2024년 최신 정보를 확인한 결과:

| 업체 | 가격 (2024년) | 출처 |
|-----|-------------|-----|
| 해적호핑 | 119,000원 | [공식 사이트](https://example.com) |
| 로컬호핑 | 56,000원 | [예약 사이트](https://example.com) |

**참고**: 가격은 환율 변동에 따라 달라질 수 있습니다.
\`\`\`

---

## 🚫 절대 금지 사항

1. **출처 없는 정보 금지**
   - 모든 정보는 반드시 출처 표시
   - 문서에 없으면 "저장창고에 해당 정보가 없습니다" 명시

2. **애매한 표현 금지**
   - "약간 비싸요" ❌ → "119,000원" ✅
   - "여러 가지 있어요" ❌ → "8개 업체 비교" ✅

3. **딱딱한 톤 금지** (섹션 1에서)
   - "제공합니다" ❌ → "완전 좋아요!" ✅
   - "다음과 같습니다" ❌ → "쫙 정리해드릴게요!" ✅

4. **할루시네이션 금지**
   - 문서에 없으면: "형님, 이 정보는 저장창고에 없네요 😅"
   - 절대 추측하거나 지어내지 마세요!

---

## 🎯 체크리스트

답변 전에 확인:
- [ ] "형님" 또는 "누님" 호칭 사용? (섹션 1)
- [ ] 이모지 충분히 사용? (🏝️, 💰, ✨, 🔥)
- [ ] 가격을 정확한 숫자로?
- [ ] 각 정보마다 출처 링크 표시?
- [ ] 출처 리스트 박스 추가?
- [ ] 유쾌한 톤인가? (섹션 1)
- [ ] 할루시네이션 없나?

---

이제 철산랜드 스타일로 완벽하게 답변하세요! 🎡✨`;
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
    console.log('🌐 웹검색 사용:', useWebSearch ? 'Yes' : 'No');

    // Tool 선택
    let tools;
    if (useWebSearch) {
      tools = [{ google_search_retrieval: {} }];
      console.log('🔍 Tool: Google Search');
    } else {
      if (!fileSearchStoreName) {
        return res.status(500).json({ 
          error: 'File Search Store가 초기화되지 않았습니다.' 
        });
      }
      tools = [{ 
        file_search: { 
          file_search_store_names: [fileSearchStoreName] 
        } 
      }];
      console.log('📚 Tool: File Search Store');
    }

    // 프롬프트
    const customPrompt = await getSystemPrompt();
    const finalPrompt = systemInstruction || customPrompt;

    console.log('🤖 Gemini 2.5 Flash 호출 중 (File Search 모드)...');
    console.log('📝 프롬프트 길이:', finalPrompt.length, '자');
    console.log('🔢 예상 토큰:', Math.ceil(finalPrompt.length / 4), '토큰');

    const requestBody = {
      system_instruction: {
        parts: [{ text: finalPrompt }]
      },
      contents: [{
        parts: [{ text: query }]
      }],
      tools: tools
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
    console.log('📊 전체 응답 구조:');
    console.log(JSON.stringify(data, null, 2));
    
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성할 수 없습니다.';
    
    console.log('📝 답변 길이:', answer.length, '자');
    
    // ⭐ Grounding Metadata 추출
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    
    console.log('🔍 groundingMetadata 존재 여부:', !!groundingMetadata);
    
    if (groundingMetadata) {
      console.log('📚 groundingMetadata 전체:');
      console.log(JSON.stringify(groundingMetadata, null, 2));
    }
    
    let sources = [];
    
    if (groundingMetadata?.groundingChunks) {
      console.log('📦 groundingChunks 개수:', groundingMetadata.groundingChunks.length);
      
      sources = groundingMetadata.groundingChunks.map((chunk, idx) => {
        console.log(`\n🔗 Chunk ${idx + 1}:`, JSON.stringify(chunk, null, 2));
        
        const context = chunk.retrievedContext || chunk.web || {};
        
        // ⭐ text에서 URL 추출하기
        let url = '';
        let title = context.title || `문서 ${idx + 1}`;
        let type = '';
        
        if (context.text) {
          // text에서 "URL: https://..." 패턴 찾기
          const urlMatch = context.text.match(/URL:\s*(https?:\/\/[^\s\n]+)/);
          if (urlMatch) {
            url = urlMatch[1];
          }
          
          // text에서 "타입: YOUTUBE" 등 찾기
          const typeMatch = context.text.match(/타입:\s*([^\n]+)/);
          if (typeMatch) {
            type = typeMatch[1].trim();
          }
          
          // text에서 "제목: ..." 찾기 (더 정확한 제목)
          const titleMatch = context.text.match(/제목:\s*([^\n]+)/);
          if (titleMatch) {
            title = titleMatch[1].trim();
          }
        }
        
        return {
          id: idx + 1,
          title: title,
          url: url,
          type: type,
          content: (context.text || '').substring(0, 200),
          date: new Date().toISOString().split('T')[0]
        };
      });
      
      console.log('✅ 출처 추출 완료:', sources.length, '개');
      sources.forEach((src, idx) => {
        console.log(`  ${idx + 1}. ${src.title}`);
        console.log(`     타입: ${src.type || '(없음)'}`);
        console.log(`     URL: ${src.url || '(없음)'}`);
      });
      
      // ⭐ 중복 URL 제거
      const uniqueSources = [];
      const seenUrls = new Set();
      
      for (const source of sources) {
        if (source.url && !seenUrls.has(source.url)) {
          seenUrls.add(source.url);
          uniqueSources.push(source);
        } else if (!source.url) {
          // URL이 없는 경우도 포함 (디버깅용)
          uniqueSources.push(source);
        }
      }
      
      sources = uniqueSources;
      console.log('✅ 중복 제거 후:', sources.length, '개');
      
    } else {
      console.log('⚠️ groundingChunks 없음');
    }
    
    if (sources.length === 0) {
      console.log('📝 기본 출처 생성');
      sources = [{
        id: 1,
        title: useWebSearch ? 'Web Search' : 'File Search Store',
        content: useWebSearch 
          ? '웹 검색 결과를 기반으로 답변했습니다.' 
          : `총 ${uploadedFilesCount}개의 문서에서 검색되었습니다.`,
        url: '',
        type: '',
        date: new Date().toISOString().split('T')[0]
      }];
    }

    console.log('🎉 응답 전송 준비 완료');

    res.json({
      answer,
      sources,
      usingFileSearchAPI: !useWebSearch,
      usingWebSearch: useWebSearch,
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
