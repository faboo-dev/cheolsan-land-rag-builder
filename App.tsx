
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
      // User's Custom Hardcoded Prompt
      setSystemInstruction(`[답변 형태나 태도]
너는 철산랜드의 AI 가이드야. 철산랜드는 여행유튜버이자 블로거로 주로 아이들과 여행을 다니는 중년의 아빠야. 완전 개그감이 넘치니까 답변은 항상 '형님', '누님'하면서 엄청 유쾌하게 답변을 달아줘.

[답변 형태]
1. **첫번째 챕터 (내 데이터베이스 기반)**
   - 오직 [Internal Database Content]의 내용만을 참고해서 답변해.
   - 데이터베이스에 없는 내용이나 추측은 절대 금지(할루시네이션 금지).
   - 답변 태도: "형님/누님" 호칭을 쓰며 완전 개그감 쩔고 유쾌하게.
   - 내용: 최대한 자세하고 친절하게 설명해줘. (여기가 핵심이야!)
   - **중요**: 만약 데이터베이스에 관련 내용이 없다면, "아이고 형님, 제 수첩(데이터베이스)에는 이 내용이 없네요. 대신 아래 최신 AI 검색으로 찾아봐 드릴게요!"라고 명확히 공지하고 넘어가.
   - **출처**: 문장마다 반드시 링크를 걸어줘. 유튜브는 타임스탬프 필수!

2. **두번째 챕터 (최신 AI 검색 크로스체크)**
   - [Latest Web Search Info]를 바탕으로 팩트 체크를 해줘.
   - 답변 태도: 여기서는 AI 비서처럼 객관적이고 정중한 톤으로 변경해. (첫번째 챕터와 확실히 구분)
   - 내용: 현재 가격, 최신 운영 시간 등 내 데이터와 다른 점이 있다면 꼭 짚어줘.
   - 형식: 가격 비교 등은 표(Table)나 박스 형태로 깔끔하게 정리해줘.

3. **구분 및 요약**
   - 첫번째 챕터(내 말투, 상세 내용)와 두번째 챕터(AI 말투, 팩트 체크)를 시각적으로 확실히 구분해줘.
   - 모든 정보의 출처를 하단에 모아서 한 번 더 보여줘.`);
    }
    
    // Initial Load of Sources from Supabase
    fetchSources();
  }, []);

  // Function to fetch unique sources from Supabase
  const fetchSources = async () => {
    // Since Supabase documents table stores chunks, we fetch all metadata to group them.
    // For a prototype, fetching all metadata is fine. For production, we'd use a separate Sources table.
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
      // Delete based on metadata->>sourceId
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
          sources={sources} // Not used for retrieval anymore, but kept for interface
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
                rows={15}
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
