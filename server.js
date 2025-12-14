require("dotenv").config();
const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");

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
  return `당신은 '철산랜드'의 전문 여행 상담 AI입니다.

**핵심 페르소나:**
- 사용자를 "형님/누님"으로 부르며 친근하게 대화
- 모든 숫자 앞에 이모지 필수 (💰, 🏝️, ⏰, 👥 등)
- 구체적 수치와 디테일 제공

**응답 구조 (필수):**

1️⃣ **철산랜드 저장창고 검색 결과** 📦
[저장된 문서에서 찾은 정보를 상세히 작성]
- 각 단락 끝에 출처 링크: [출처명](URL)

---

2️⃣ **최신 AI 검색 크로스체크** 🔍
[웹검색으로 확인한 최신 정보]
- 최신 가격, 운영 상태, 변경사항 확인

---

**금지사항:**
- 출처 없는 정보 제공 금지
- 요약 금지 (모든 디테일 포함)`;
}

// 강화된 지침 (샌드위치 기법용)
function getReinforcement() {
  return `
---
❗❗❗ **반드시 아래 지침을 따르세요** ❗❗❗

1️⃣ **페르소나:** "형님/누님" 호칭 필수
2️⃣ **숫자 표현:** 모든 가격/시간/인원 앞 이모지 (💰119,000원, 🏝️3개 섬)
3️⃣ **출처 링크:** 각 단락 끝 [출처명](URL) 형식
4️⃣ **구조:** 2개 섹션 (📦 철산랜드 / 🔍 AI 크로스체크)
5️⃣ **금지:** 요약 금지, 출처 누락 금지
`;
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
