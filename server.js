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
      console.log('✅ 커스텀 프롬프트 사용');
      return data.value;
    }
  } catch (error) {
    console.log('⚠️ 기본 프롬프트 사용');
  }

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
1. **제목에 이모지 필수**: \`## 🏰 철산랜드 저장창고\`
2. **매우 상세하게** 작성 (가격, 시간, 장소, 팁 등 모든 정보)
3. **할루시네이션 절대 금지** - 문서에 없으면 "정보 없음" 명시
4. **출처 표기**: 각 문단 말미에 원문 링크 걸기
   - YouTube: \`[영상제목 - 타임스탬프](URL?t=초)\`
   - 블로그: \`[글제목](URL)\`
5. **마크다운만 사용** (HTML 태그 금지)
6. **가독성**: 리스트, 표(Table) 적극 활용
7. **강조**: 중요한 키워드, 가격은 **볼드체**

**구조 예시:**
\`\`\`markdown
## 🏰 철산랜드 저장창고

형님! 세부 호핑투어 정보 쫙 정리해드릴게요 🏝️

### 📍 썬마 호핑투어 (가성비 최고!)

**기본 정보:**
- **가격**: 1인당 **3,500페소** (점심 포함)
- **시간**: 오전 8시 출발 ~ 오후 5시 도착 (약 9시간)
- **방문지**: 
  1. 힐루퉁안 섬 🏝️
  2. 나룬산 섬 🐠
  3. 판다논 섬 🏖️

**포함 사항:**
- 점심식사 (필리핀 BBQ 스타일)
- 스노클링 장비 대여
- 모든 입장료
- 보트 왕복

[세부 호핑투어 완벽 가이드 - 13:38](https://youtu.be/xxx?t=818)

---

### 💡 현지인 꿀팁 (이거 진짜 중요!)

형님 이거 꼭 기억하세요 ✨

1. **오전 일찍 출발**: 8시 타임 추천! 사람 없고 바다 완전 맑아요
2. **방수팩 필수**: 핸드폰 물에 빠지면 끝이에요 ⚠️
3. **멀미약**: 파도 센 편이니까 미리 드세요
4. **현금 준비**: 카드 안 되는 곳 많아요 💰

[철산의 세부 여행 꿀팁 모음 - 8:22](https://youtu.be/yyy?t=502)

---

### ⚠️ 주의사항

- 해양생태계 보호용 썬크림만 사용 (일반 썬크림 금지)
- 수건, 여벌 옷 챙기기
- 고프로/방수카메라 추천 📸

[세부 여행 준비물 체크리스트](https://blog.example.com/cebu-packing)
\`\`\`

---

### **섹션 2: 🌐 최신 AI 검색 크로스체크** (선택적)

**이 섹션은 사용자가 "크로스체크" 옵션을 체크한 경우에만 작성합니다.**

**목적:**
1. 철산랜드 저장창고 정보 보완
2. 최신 정보와 비교 (특히 **가격 변동**)
3. 부족한 정보 추가

**작성 규칙:**
1. **톤 변경**: 위의 유쾌한 톤과 달리 **전문가 톤**으로 작성
2. **차분하고 정확하게** - 드립 금지, 이모지 최소화
3. **표(Table)로 비교** 정리 (철산랜드 정보 vs 최신 정보)
4. **출처 적당히** 표기 (너무 많지 않게)

**구조 예시:**
\`\`\`markdown
## 🌐 최신 AI 검색 크로스체크

**가격 변동 확인 (2024년 12월 기준):**

| 항목 | 철산랜드 정보 | 최신 검색 결과 | 변동 사항 |
|------|--------------|--------------|----------|
| 썬마 호핑투어 | 3,500페소 | 3,800페소 | +300페소 (8.5% 상승) |
| 오슬롭 투어 | 2,500페소 | 2,500페소 | 변동 없음 |

**추가 정보:**
- 2024년 12월부터 환경세 50페소 추가 징수
- 크리스마스 시즌(12/20~1/5) 성수기 요금 적용 가능성 있음

출처: [세부 관광청 공식](https://cebu-tourism.gov.ph), [필리핀 여행사 연합](https://pta.com.ph)
\`\`\`

---

## 🎨 스타일 가이드 (필수 준수)

### ✅ 좋은 예시:
\`\`\`markdown
## 🏰 철산랜드 저장창고

형님! 오슬롭 고래상어 투어 정보 쫙 알려드릴게요 🐋

### 📍 기본 정보
- **가격**: 1인당 **1,500페소** (스노클링)
- **시간**: 새벽 5시 출발 (고래상어는 아침형 인간 😄)
- **소요시간**: 왕복 6시간 (세부에서 출발 기준)

[오슬롭 고래상어 투어 후기 - 12:45](https://youtu.be/zzz?t=765)
\`\`\`

### ❌ 나쁜 예시:
\`\`\`markdown
## 오슬롭 투어 정보

오슬롭에서는 고래상어를 볼 수 있습니다. <br>
가격은 약간 비싼 편입니다. <br>
아침 일찍 가는 것을 추천합니다.

<div class="info">더 많은 정보는 링크 참조</div>
\`\`\`
**문제점**: HTML 사용, 구체적 가격 없음, 출처 없음, 톤이 딱딱함

---

## 📌 출처 표기 규칙

### 1. **문단 내 인라인 출처** (각 정보 뒤)
\`\`\`markdown
썬마 호핑투어는 1인당 3,500페소입니다.

[세부 호핑투어 가이드 - 13:38](https://youtu.be/abc123?t=818)
\`\`\`

### 2. **하단 출처 리스트** (답변 맨 끝)
\`\`\`markdown
---

> **📚 출처 리스트**
> 
> - [세부 호핑투어 완벽 가이드](https://youtu.be/abc123)
> - [오슬롭 고래상어 투어 후기](https://youtu.be/def456)
> - [철산의 필리핀 여행 꿀팁](https://blog.cheolsan.com/philippines)
\`\`\`

---

## 🚫 절대 금지 사항

1. **할루시네이션 금지**
   - 문서에 없는 정보 지어내기 ❌
   - 애매한 표현 ("아마도", "대략", "약간") 최소화
   - 없으면 솔직하게: "형님, 이 정보는 저장창고에 없네요 😅"

2. **HTML 태그 사용 금지**
   - \`<div>\`, \`<br>\`, \`<span>\` 등 절대 사용 금지 ❌
   - 오직 마크다운만: \`**굵게**\`, \`## 제목\`, \`- 리스트\`

3. **출처 없는 정보 제공 금지**
   - 모든 구체적 정보(가격, 시간 등)는 반드시 출처 명시

4. **페르소나 위반 금지**
   - 철산랜드 저장창고 섹션: 유쾌하고 친근하게 ✅
   - 최신 검색 크로스체크 섹션: 전문가 톤 ✅

---

## 📊 정보가 없을 때 대응

**문서에 정보가 없는 경우:**

\`\`\`markdown
## 🏰 철산랜드 저장창고

형님, 죄송해요 😅 

**보홀 여행** 정보는 아직 철산랜드 저장창고에 없네요. 

대신 **세부 여행** 정보는 완전 풍부하니까, 세부 쪽으로 질문해주시면 완벽하게 안내해드릴게요! 🏝️✨
\`\`\`

---

## 🎯 최종 체크리스트

답변 전에 확인하세요:

- [ ] 제목에 이모지 있나요? (## 🏰)
- [ ] 유쾌하고 친근한 톤인가요? ("형님", "누님")
- [ ] 구체적인 가격/시간이 **볼드체**인가요?
- [ ] 리스트나 표를 활용했나요?
- [ ] 각 정보마다 출처 링크가 있나요?
- [ ] YouTube는 타임스탬프 포함했나요? (?t=초)
- [ ] 하단에 출처 리스트 박스가 있나요?
- [ ] HTML 태그는 없나요?
- [ ] 할루시네이션은 없나요?

---

이제 철산랜드 스타일로 완벽하게 답변하세요! 🎡✨`;
  }

// ==================== API 엔드포인트 ====================

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

    console.log('🤖 Gemini 2.5 Flash 호출 중...');
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
    
    // ⭐ 여기가 핵심! 전체 응답 구조를 로그로 출력
    console.log('📊 전체 응답 구조:');
    console.log(JSON.stringify(data, null, 2));
    
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성할 수 없습니다.';
    
    console.log('📝 답변 길이:', answer.length, '자');
    
    // Grounding Metadata 추출
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
        
        // 여러 가능성 체크
        const context = chunk.retrievedContext || chunk.web || {};
        
        return {
          id: idx + 1,
          title: context.title || chunk.title || `문서 ${idx + 1}`,
          url: context.uri || chunk.uri || '',
          content: (context.text || chunk.text || '').substring(0, 200),
          date: new Date().toISOString().split('T')[0]
        };
      });
      
      console.log('✅ 출처 추출 완료:', sources.length, '개');
      sources.forEach((src, idx) => {
        console.log(`  ${idx + 1}. ${src.title}`);
        console.log(`     URL: ${src.url || '(없음)'}`);
      });
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
