import dotenv from "dotenv";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

let fileSearchStoreName = null;
let uploadedFilesCount = 0;

// ===========================
// 시스템 프롬프트
// ===========================
function getSystemPrompt() {
  return '## 🎭 페르소나 & 답변 태도

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

// ===========================
// 서버 시작 시 설정 로드
// ===========================
async function loadSettings() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["file_search_store_name", "uploaded_files_count"]);

    if (error) throw error;

    data.forEach((row) => {
      if (row.key === "file_search_store_name") {
        fileSearchStoreName = row.value;
      } else if (row.key === "uploaded_files_count") {
        uploadedFilesCount = parseInt(row.value) || 0;
      }
    });

    console.log(`✅ File Search Store: ${fileSearchStoreName}`);
    console.log(`✅ Uploaded Files: ${uploadedFilesCount}개`);
  } catch (err) {
    console.error("❌ Settings 로드 실패:", err);
  }
}

loadSettings();

// ===========================
// 출처 추출 헬퍼 함수
// ===========================
function extractSources(groundingMetadata) {
  const sources = [];
  if (!groundingMetadata?.groundingChunks) return sources;

  const seenUrls = new Set();
  groundingMetadata.groundingChunks.forEach((chunk) => {
    const text = chunk.retrievedContext?.text || "";
    const urlMatch = text.match(/URL:\s*(https?:\/\/[^\s\)]+)/);
    const typeMatch = text.match(/Type:\s*(\w+)/);
    const titleMatch = text.match(/Title:\s*([^\n]+)/);

    if (urlMatch && !seenUrls.has(urlMatch[1])) {
      sources.push({
        url: urlMatch[1],
        type: typeMatch?.[1] || "Unknown",
        title: titleMatch?.[1] || "제목 없음",
      });
      seenUrls.add(urlMatch[1]);
    }
  });

  return sources;
}

// ===========================
// 💬 채팅 API (6가지 모드)
// ===========================
app.post("/api/chat", async (req, res) => {
  const { query, useWebSearch, searchMode = "file_search_api" } = req.body;

  const startTime = Date.now();
  console.log(`\n📩 요청: "${query}"`);
  console.log(`🔧 모드: ${searchMode}`);
  console.log(`🌐 웹검색: ${useWebSearch ? "ON" : "OFF"}`);

  try {
    let finalAnswer = "";
    let sources = [];
    let debugInfo = {};

    // =======================================
    // 모드1: File Search API (구글 관리 RAG)
    // =======================================
    if (searchMode === "file_search_api") {
      const tools = [];
      if (fileSearchStoreName) {
        tools.push({ fileSearch: { fileSearchStoreNames: [fileSearchStoreName] } });
      }
      if (useWebSearch) {
        tools.push({ googleSearch: {} });
      }

      const reinforcedQuery = `${query}${getReinforcement()}`;

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(),
        contents: [{ role: "user", parts: [{ text: reinforcedQuery }] }],
        config: {
          tools: tools.length > 0 ? tools : undefined,
          temperature: 1.8,
          topP: 0.98,
          maxOutputTokens: 4096,
        },
      });

      finalAnswer = result.response.text();
      sources = extractSources(result.response.candidates[0].groundingMetadata);
      debugInfo = { method: "File Search API", chunksUsed: sources.length };
    }

    // =======================================
    // 모드2: 키워드→전체문서 (매칭 문서 전부)
    // =======================================
    else if (searchMode === "keyword_all_docs") {
      // 키워드 추출
      const keywords = query.split(" ").filter(k => k.length > 1);
      
      // Supabase에서 키워드 매칭 문서 전부 가져오기
      let dbQuery = supabase.from("documents").select("content, metadata");
      
      keywords.forEach((keyword) => {
        dbQuery = dbQuery.or(`content.ilike.%${keyword}%`);
      });

      const { data: documents, error } = await dbQuery.limit(50);

      if (error) throw error;

      debugInfo = { method: "키워드→전체문서", documentsFound: documents.length };

      // 전체 문서 내용 결합
      const allContent = documents
        .map((doc, i) => {
          const meta = doc.metadata || {};
          return `
[문서 ${i + 1}]
출처: ${meta.title || "제목 없음"}
URL: ${meta.url || "N/A"}
내용:
${doc.content}
---
`;
        })
        .join("\n\n");

      // 출처 저장
      documents.forEach((doc) => {
        if (doc.metadata?.url) {
          sources.push({
            url: doc.metadata.url,
            type: doc.metadata.type || "Unknown",
            title: doc.metadata.title || "제목 없음",
          });
        }
      });

      const tools = useWebSearch ? [{ googleSearch: {} }] : [];

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `
다음 문서들을 바탕으로 답변하세요:

${allContent}

질문: ${query}
${getReinforcement()}
`,
              },
            ],
          },
        ],
        config: {
          tools: tools.length > 0 ? tools : undefined,
          temperature: 1.9,
          topP: 0.99,
          maxOutputTokens: 8192,
        },
      });

      finalAnswer = result.response.text();
    }

    // =======================================
    // 모드3: 미리보기→선택 (AI가 관련 문서 판단)
    // =======================================
    else if (searchMode === "keyword_preview_select") {
      // 1단계: 키워드로 후보 수집
      const keywords = query.split(" ").filter(k => k.length > 1);
      let dbQuery = supabase.from("documents").select("content, metadata");
      
      keywords.forEach((keyword) => {
        dbQuery = dbQuery.or(`content.ilike.%${keyword}%`);
      });

      const { data: candidates, error } = await dbQuery.limit(30);
      if (error) throw error;

      // 2단계: 미리보기 생성
      const previews = candidates
        .map((doc, i) => {
          const meta = doc.metadata || {};
          return `[문서 ${i + 1}] ${meta.title || "제목 없음"}\n미리보기: ${doc.content.substring(0, 300)}...`;
        })
        .join("\n\n");

      // 3단계: AI에게 관련 문서 선택 요청
      const selectionResult = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `
다음 문서 목록에서 "${query}"에 답변하는 데 필요한 문서 번호를 선택하세요.

${previews}

출력 형식 (JSON):
{
  "selected": [1, 5, 7],
  "reason": "선택 이유"
}
`,
              },
            ],
          },
        ],
        config: {
          response_mime_type: "application/json",
          maxOutputTokens: 500,
        },
      });

      const selection = JSON.parse(selectionResult.response.text());
      const selectedDocs = selection.selected.map((i) => candidates[i - 1]).filter(Boolean);

      debugInfo = {
        method: "미리보기→선택",
        candidatesFound: candidates.length,
        selected: selection.selected,
        reason: selection.reason,
      };

      // 4단계: 선택된 문서로 답변 생성
      const selectedContent = selectedDocs
        .map((doc) => {
          const meta = doc.metadata || {};
          sources.push({
            url: meta.url || "N/A",
            type: meta.type || "Unknown",
            title: meta.title || "제목 없음",
          });
          return `${doc.content}\n\n출처: ${meta.title} (${meta.url})`;
        })
        .join("\n\n---\n\n");

      const tools = useWebSearch ? [{ googleSearch: {} }] : [];

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(),
        contents: [
          {
            role: "user",
            parts: [{ text: `${selectedContent}\n\n질문: ${query}${getReinforcement()}` }],
          },
        ],
        config: {
          tools: tools.length > 0 ? tools : undefined,
          temperature: 1.9,
          maxOutputTokens: 8192,
        },
      });

      finalAnswer = result.response.text();
    }

    // =======================================
    // 모드4: 2단계 요약 (각 문서 요약 후 통합)
    // =======================================
    else if (searchMode === "two_stage_summary") {
      // 1단계: 키워드로 문서 수집
      const keywords = query.split(" ").filter(k => k.length > 1);
      let dbQuery = supabase.from("documents").select("content, metadata");
      
      keywords.forEach((keyword) => {
        dbQuery = dbQuery.or(`content.ilike.%${keyword}%`);
      });

      const { data: documents, error } = await dbQuery.limit(20);
      if (error) throw error;

      debugInfo = { method: "2단계 요약", documentsFound: documents.length, summaries: [] };

      // 2단계: 각 문서 요약 (병렬 처리)
      const summaryPromises = documents.map(async (doc) => {
        const meta = doc.metadata || {};
        const result = await genAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
다음 문서가 "${query}"와 관련 있는지 판단하고, 관련 있다면 핵심 정보를 5줄 이내로 요약하세요.

문서: ${doc.content.substring(0, 1500)}

출력 형식:
- 관련도: [높음/중간/낮음/없음]
- 요약: [핵심 정보 또는 "관련 없음"]
- 출처: ${meta.title} (${meta.url})
`,
                },
              ],
            },
          ],
          config: { maxOutputTokens: 300 },
        });

        return {
          summary: result.response.text(),
          metadata: meta,
        };
      });

      const summaries = await Promise.all(summaryPromises);

      // 3단계: 관련도 높은 것만 필터링
      const relevantSummaries = summaries.filter((s) =>
        s.summary.includes("높음") || s.summary.includes("중간")
      );

      relevantSummaries.forEach((s) => {
        if (s.metadata.url) {
          sources.push({
            url: s.metadata.url,
            type: s.metadata.type || "Unknown",
            title: s.metadata.title || "제목 없음",
          });
        }
      });

      debugInfo.summaries = relevantSummaries.length;

      // 4단계: 요약본으로 최종 답변
      const combinedSummaries = relevantSummaries.map((s) => s.summary).join("\n\n---\n\n");

      const tools = useWebSearch ? [{ googleSearch: {} }] : [];

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `
다음은 관련 문서들의 요약입니다:

${combinedSummaries}

질문: ${query}
${getReinforcement()}
`,
              },
            ],
          },
        ],
        config: {
          tools: tools.length > 0 ? tools : undefined,
          temperature: 1.9,
          maxOutputTokens: 8192,
        },
      });

      finalAnswer = result.response.text();
    }

    // =======================================
    // 모드5: Function Calling (AI가 검색어 결정)
    // =======================================
    else if (searchMode === "function_calling_search") {
      const searchFunction = {
        name: "search_documents",
        description: "철산랜드 문서 데이터베이스 검색",
        parameters: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "검색 키워드 배열 (예: ['세부', '호핑투어', '가격'])",
            },
          },
          required: ["keywords"],
        },
      };

      const tools = [{ functionDeclarations: [searchFunction] }];
      if (useWebSearch) {
        tools.push({ googleSearch: {} });
      }

      // 1단계: AI에게 검색어 결정 요청
      const step1Result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `사용자 질문: "${query}"\n\n위 질문에 답하기 위해 search_documents 함수를 호출하세요.`,
              },
            ],
          },
        ],
        config: { tools },
      });

      const functionCall = step1Result.response.candidates[0]?.content?.parts?.find(
        (part) => part.functionCall
      );

      if (!functionCall) {
        throw new Error("Function Call 실패");
      }

      const searchKeywords = functionCall.functionCall.args.keywords;
      debugInfo = { method: "Function Calling", keywords: searchKeywords };

      // 2단계: Supabase 검색
      let dbQuery = supabase.from("documents").select("content, metadata");

      searchKeywords.forEach((keyword) => {
        dbQuery = dbQuery.or(`content.ilike.%${keyword}%`);
      });

      const { data: documents, error } = await dbQuery.limit(15);
      if (error) throw error;

      debugInfo.documentsFound = documents.length;

      const docsContent = documents
        .map((doc) => {
          const meta = doc.metadata || {};
          if (meta.url) {
            sources.push({
              url: meta.url,
              type: meta.type || "Unknown",
              title: meta.title || "제목 없음",
            });
          }
          return `${doc.content}\n\n출처: ${meta.title} (${meta.url})`;
        })
        .join("\n\n---\n\n");

      // 3단계: 최종 답변
      const toolsStep2 = useWebSearch ? [{ googleSearch: {} }] : [];

      const step2Result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(),
        contents: [
          {
            role: "user",
            parts: [{ text: `${docsContent}\n\n질문: ${query}${getReinforcement()}` }],
          },
        ],
        config: {
          tools: toolsStep2.length > 0 ? toolsStep2 : undefined,
          temperature: 1.9,
          maxOutputTokens: 8192,
        },
      });

      finalAnswer = step2Result.response.text();
    }

    // =======================================
    // 모드6: 하이브리드 청크 (여러 키워드 조합)
    // =======================================
    else if (searchMode === "hybrid_chunk") {
      // 키워드 추출 + 동의어 확장
      const baseKeywords = query.split(" ").filter(k => k.length > 1);
      
      // 여행 관련 동의어 맵 (확장 가능)
      const synonymMap = {
        "가격": ["비용", "요금", "금액"],
        "추천": ["best", "좋은", "인기"],
        "호핑": ["투어", "여행"],
      };

      const expandedKeywords = [...baseKeywords];
      baseKeywords.forEach((keyword) => {
        if (synonymMap[keyword]) {
          expandedKeywords.push(...synonymMap[keyword]);
        }
      });

      debugInfo = { method: "하이브리드 청크", keywords: expandedKeywords };

      // 여러 키워드 조합으로 검색
      let dbQuery = supabase.from("documents").select("content, metadata");

      expandedKeywords.forEach((keyword) => {
        dbQuery = dbQuery.or(`content.ilike.%${keyword}%`);
      });

      const { data: documents, error } = await dbQuery.limit(25);
      if (error) throw error;

      debugInfo.documentsFound = documents.length;

      const docsContent = documents
        .map((doc) => {
          const meta = doc.metadata || {};
          if (meta.url) {
            sources.push({
              url: meta.url,
              type: meta.type || "Unknown",
              title: meta.title || "제목 없음",
            });
          }
          return `${doc.content.substring(0, 1500)}\n출처: ${meta.title} (${meta.url})`;
        })
        .join("\n\n---\n\n");

      const tools = useWebSearch ? [{ googleSearch: {} }] : [];

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(),
        contents: [
          {
            role: "user",
            parts: [{ text: `${docsContent}\n\n질문: ${query}${getReinforcement()}` }],
          },
        ],
        config: {
          tools: tools.length > 0 ? tools : undefined,
          temperature: 1.9,
          maxOutputTokens: 8192,
        },
      });

      finalAnswer = result.response.text();
    }

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    res.json({
      success: true,
      response: finalAnswer,
      sources: sources,
      mode: searchMode,
      debug: {
        ...debugInfo,
        responseTime: `${elapsedTime}초`,
        sourcesCount: sources.length,
      },
    });

    console.log(`✅ 응답 완료 | ${elapsedTime}초 | 출처: ${sources.length}개`);
  } catch (error) {
    console.error("❌ API Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================
// 🔧 관리자 API (기존 유지)
// ===========================
app.get("/api/admin/prompt", async (req, res) => {
  res.json({ success: true, prompt: getSystemPrompt() });
});

app.post("/api/admin/prompt", async (req, res) => {
  const { prompt } = req.body;
  const { error } = await supabase.from("settings").upsert({ key: "system_prompt", value: prompt });
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

app.get("/api/admin/documents", async (req, res) => {
  const { data, error } = await supabase.from("documents").select("*");
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, documents: data });
});

app.delete("/api/admin/documents/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

// ===========================
// 서버 실행
// ===========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Gemini 2.5 Flash + 6가지 검색 모드`);
});
