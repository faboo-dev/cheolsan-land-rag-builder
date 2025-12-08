
import React, { useState, useEffect, useMemo } from 'react';
import IngestionPanel from './components/IngestionPanel';
import KnowledgeList from './components/KnowledgeList';
import RAGChat from './components/RAGChat';
import { KnowledgeSource, SourceType } from './types';
import { GeminiService } from './services/gemini';
import { supabase } from './services/supabase';

// Local storage keys (Only for Instruction & Auth now)
const INSTRUCTION_KEY = 'cheolsan_rag_instruction';
const AUTH_SESSION_KEY = 'cheolsan_rag_auth';

const App: React.FC = () => {
  // Initialize 'isEmbedMode' lazily to prevent flash of login screen
  const [isEmbedMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'embed';
  });

  const [activeTab, setActiveTab] = useState<'manage' | 'chat'>('manage');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [systemInstruction, setSystemInstruction] = useState('');
  
  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  // Initialize Gemini Service
  const geminiService = useMemo(() => new GeminiService(), []);

  // Check Auth Session
  useEffect(() => {
    if (!isEmbedMode) {
      const savedAuth = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (savedAuth === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, [isEmbedMode]);

  // Load Instructions locally
  useEffect(() => {
    const savedInstruction = localStorage.getItem(INSTRUCTION_KEY);
    if (savedInstruction) {
      setSystemInstruction(savedInstruction);
    } else {
      // User's Custom Hardcoded Prompt with Visual Enhancements
      setSystemInstruction(`[답변 태도 및 페르소나]
너는 '철산랜드'의 AI 가이드야. 유쾌하고 에너지 넘치는 형님/오빠 톤으로 대답해줘.
이모지(🎡, 🏝️, ✨, ✅)를 적극적으로 사용해서 답변을 아주 예쁘고 읽기 좋게 만들어줘.

[답변 구조 및 스타일 가이드]
1. **제목에는 반드시 이모지를 포함해.** 예: "## 🏰 철산랜드 데이터베이스", "## 🌐 최신 정보 크로스체크"
2. **중요한 키워드나 가격은 반드시 볼드체(**강조**)로 표시해.**
3. **가독성**: 줄글보다는 리스트(1. 2. 3.)나 표(Table)를 적극적으로 활용해.
4. **HTML 태그는 절대 금지.** 오직 마크다운(Markdown)만 사용해.

[답변 섹션 구분]
1. **## 🏰 철산랜드 데이터베이스**
   - 내가 제공한 파일/데이터베이스 내용을 바탕으로 아주 상세하게 설명해줘.
   - 추측은 금지야. 없으면 없다고 솔직하게 말해.
   - 인용 표기는 반드시 문장 끝에 '[[1]]' 형태로 붙여줘.

2. **## 🌐 최신 AI 검색 크로스체크**
   - 웹 검색 결과가 있다면 이 섹션에 작성해.
   - 가격 비교나 최신 변동 사항을 표(Table)로 정리해주면 베스트야.
   - 내용이 위와 겹치면 "위 내용과 동일합니다"라고 짧게 넘어가.

[금지 사항]
- 할루시네이션(거짓말) 금지.
- 답변 하단에 "출처 리스트"를 따로 만들지 마. (시스템이 자동으로 버튼을 만들어줌)`);
    }
    
    // Initial Load of Sources from Supabase
    fetchSources();
  }, []);

  // Function to fetch unique sources from Supabase
  const fetchSources = async () => {
    // Since Supabase documents table stores chunks, we fetch all metadata to group them.
    const { data, error } = await supabase
        .from('documents')
        .select('metadata')
        .order('id', { ascending: false });
    
    if (error || !data) {
        console.error("Error fetching sources:", error);
        return;
    }

    // Group by sourceId to create unique list
    const uniqueMap = new Map();
    data.forEach((row: any) => {
        const meta = row.metadata;
        if (meta && meta.sourceId && !uniqueMap.has(meta.sourceId)) {
            uniqueMap.set(meta.sourceId, {
                id: meta.sourceId,
                type: meta.type || SourceType.BLOG,
                title: meta.title,
                url: meta.url,
                date: meta.date,
                originalContent: '', // Loaded on demand
                chunks: [], // Not needed for list view
                processed: true
            });
        }
    });

    setSources(Array.from(uniqueMap.values()));
  };

  const handleDeleteSource = async (id: string) => {
    if (window.confirm("정말 이 데이터를 삭제하시겠습니까? (수파베이스에서 영구 삭제)")) {
      const { error } = await supabase
        .from('documents')
        .delete()
        .filter('metadata->>sourceId', 'eq', id);

      if (error) {
        alert("삭제 중 오류가 발생했습니다.");
        console.error(error);
      } else {
        alert("삭제되었습니다.");
        fetchSources(); // Refresh list
      }
    }
  };

  const handleSaveInstruction = () => {
    localStorage.setItem(INSTRUCTION_KEY, systemInstruction);
    alert("AI 페르소나 및 답변 구조 설정이 저장되었습니다!");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // @ts-ignore
    const correctPassword = process.env.ADMIN_PASSWORD;
    
    if (passwordInput === correctPassword) {
      setIsAuthenticated(true);
      sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    } else {
      alert("비밀번호가 올바르지 않습니다.");
      setPasswordInput('');
    }
  };

  // --- 1. WIDGET MODE RENDER (No Auth Required) ---
  if (isEmbedMode) {
    return (
      <div className="h-screen w-full bg-white">
        <RAGChat 
          geminiService={geminiService} 
          sources={sources}
          systemInstruction={systemInstruction}
          isEmbed={true}
        />
      </div>
    );
  }

  // --- 2. LOGIN SCREEN (Auth Required) ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <span className="text-4xl">🎡</span>
            <h1 className="text-2xl font-bold text-gray-800 mt-2">Cheolsan Land Admin</h1>
            <p className="text-sm text-gray-500 mt-1">관리자 접속을 위해 비밀번호를 입력하세요.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full bg-primary text-white py-3 rounded font-bold hover:bg-secondary transition-colors"
            >
              접속하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 3. ADMIN DASHBOARD RENDER (Authenticated) ---
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🎡</span>
            <h1 className="text-2xl font-bold">Cheolsan Land RAG Builder</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm bg-secondary px-3 py-1 rounded flex items-center gap-2">
               <span>Cloud DB: Connected</span>
               <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            </div>
            <button 
              onClick={() => {
                setIsAuthenticated(false);
                sessionStorage.removeItem(AUTH_SESSION_KEY);
              }}
              className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded border border-gray-600"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        
        {/* API Key Warning */}
        {!process.env.API_KEY && (
             <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
               <p className="text-sm text-yellow-700">API KEY Missing</p>
           </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            className={`py-2 px-6 font-medium text-sm focus:outline-none ${
              activeTab === 'manage'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('manage')}
          >
            📂 데이터베이스 관리 & 설정
          </button>
          <button
            className={`py-2 px-6 font-medium text-sm focus:outline-none ${
              activeTab === 'chat'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('chat')}
          >
            💬 챗봇 테스트 (RAG)
          </button>
        </div>

        {activeTab === 'manage' ? (
          <div className="space-y-8">
            {/* Persona Settings Panel */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex justify-between items-start mb-4">
                <div>
                   <h2 className="text-xl font-bold text-gray-800 flex items-center">
                    🧠 AI 페르소나/지침 설정 (Prompt Engineering)
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    아래 설정된 <strong>프롬프트</strong>에 따라 AI가 답변합니다. 수정 후 저장하면 즉시 반영됩니다.
                  </p>
                </div>
                <button
                  onClick={handleSaveInstruction}
                  className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-700 font-semibold shadow"
                >
                  설정 저장하기
                </button>
              </div>
              <textarea
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                className="w-full p-4 border rounded-md shadow-sm focus:ring-2 focus:ring-primary focus:border-primary text-gray-800 leading-relaxed font-mono text-sm"
                rows={20}
                placeholder="AI 지침을 입력하세요..."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <IngestionPanel 
                  onAddSource={fetchSources} 
                  geminiService={geminiService} 
                />
              </div>
              <div>
                <KnowledgeList sources={sources} onDelete={handleDeleteSource} />
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <RAGChat 
              geminiService={geminiService} 
              sources={sources}
              systemInstruction={systemInstruction}
            />
          </div>
        )}
      </main>
      
      <footer className="bg-gray-800 text-gray-400 py-6 text-center text-sm">
        <p>© 2024 Cheolsan Land. Powered by Gemini & RAG & Supabase.</p>
        <p className="mt-1">
          데이터는 수파베이스(Supabase) 클라우드에 안전하게 저장됩니다.
        </p>
      </footer>
    </div>
  );
};

export default App;
