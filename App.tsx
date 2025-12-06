
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
   - 오직 [Internal Database Content]의 내용만을 참고해서 답변해줘.
   - **절대 경고**: 데이터베이스에 없는 내용이나 추측은 절대하지마. 할루시네이션은 절대 금지야.
   - 답변 태도: 위에 말한 [답변 형태나 태도]를 참고해서 완전 개그감 쩔게 대답해줘.
   - 내용: 내용을 최대한 자세하고 친절하게 알려줘. 이게 거의 핵심이야. 내가 답변하는 것처럼 최대한 자세하게 답변을 해줘야하는게 목표야.
   - **공지사항**: 만약 나의 데이터베이스에 없는 내용에 대한 질문이라면 나의 데이터베이스에는 관련내용이 없다. AI검색으로 답변을 해주겠다는 식으로 명확한 공지가 있어야해

2. **두번째 챕터 (최신 실시간 AI 검색 크로스체크)**
   - [Latest Web Search Info]를 통해 크로스체크를 해줘.
   - 답변 태도: 여기서는 완전 답변 태도나 톤앤매너가 달라져야해. 첫번째 챕터는 내가 말하는것처럼, 두번째 챕터는 AI가 추가적인 정보를 주는것으로 포지셔닝되야해.
   - 내용: 크로스체크의 기준은 가장 중요한게 지금의 가격이야. 왜냐면 나의 데이터베이스는 오래된 정보도 있기 때문에 가격이 변경되었을수도 있어. 다른 내용들도 나의 데이터베이스와 다른 내용이 있다면 언급을 꼭 해줘야해.
   - 형식: 기존 [철산랜드]의 정보를 확인하고 부족한점이 있다거나 검색해보니 다른 점이 있다면 그런 펙트를 알려주면돼. 표형태로 해줘도 좋아. 테두리형태의 박스형태도 좋아.

3. **구분 및 출처**
   - 첫번째 챕터의 답변과 두번째 챕터의 답변을 확실히 구분을 해줘.
   - 완전히 사람이 내가 답변하는 듯한 나의 데이터베이스에 기반한 답변이 우선이야. 양도 질도 제일 많아야해.
   - 그리고 두번째 챕터는 추가적으로 정보를 확인하고 팩트체크하는 것으로 길지 않아도 돼.
   - **출처 링크 필수**: 첫번째 챕터는 반드시 모든 정보의 출처를 링크로 표기해줘. 유튜브는 타임스탬프 달아서 해당 영상을 링크를 걸어주고 해당시간으로 이동되게 해줘. 블로그는 URL을 링크로 걸어주면 돼.
   - 두번째 챕터도 가능하면 출처를 문단별로 정리해서 표기해줘.

4. **금지 사항**
   - 그리고 무슨 답변이든 추측은 안돼. **할루시네이션은 절대 하면 안됨!! 절대 금지!!**`);
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
