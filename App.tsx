import React, { useState, useEffect, useMemo } from 'react';
import IngestionPanel from './components/IngestionPanel';
import KnowledgeList from './components/KnowledgeList';
import RAGChat from './components/RAGChat';
import { KnowledgeSource } from './types';
import { GeminiService } from './services/gemini';

// Use local storage to simulate a database for this prototype
const STORAGE_KEY = 'cheolsan_rag_db';
const INSTRUCTION_KEY = 'cheolsan_rag_instruction';
const AUTH_SESSION_KEY = 'cheolsan_rag_auth';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'manage' | 'chat'>('manage');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [systemInstruction, setSystemInstruction] = useState('');
  
  // Modes & Auth States
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  // Initialize Gemini Service
  const geminiService = useMemo(() => new GeminiService(), []);

  // Check for Embed Mode & Auth Session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'embed') {
      setIsEmbedMode(true);
      // Embed mode bypasses authentication for Chat view
    } else {
      // Check if user already logged in this session
      const savedAuth = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (savedAuth === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, []);

  // Load from LocalStorage on mount
  useEffect(() => {
    const savedSources = localStorage.getItem(STORAGE_KEY);
    if (savedSources) {
      try {
        setSources(JSON.parse(savedSources));
      } catch (e) {
        console.error("Failed to load database", e);
      }
    }

    const savedInstruction = localStorage.getItem(INSTRUCTION_KEY);
    if (savedInstruction) {
      setSystemInstruction(savedInstruction);
    } else {
      setSystemInstruction(`너는 철산랜드의 AI 가이드야.
1. [내 데이터베이스] 내용을 최우선으로 답변하고, [웹 검색] 정보로 보완해.
2. 서론(인사말, '확인해보니...' 등) 없이 바로 본론 내용부터 시작해.
3. 가격이나 스펙 비교는 반드시 마크다운 표(Table)로 작성해.
4. 말투는 블로그처럼 친근하게, 하지만 정보는 정확하게 전달해.`);
    }
  }, []);

  // Save to LocalStorage whenever sources change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  }, [sources]);

  const handleAddSource = (source: KnowledgeSource) => {
    setSources(prev => [source, ...prev]);
  };

  const handleDeleteSource = (id: string) => {
    if (window.confirm("정말 이 데이터를 삭제하시겠습니까?")) {
      setSources(prev => prev.filter(s => s.id !== id));
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
            <div className="text-sm bg-secondary px-3 py-1 rounded">
               Prototype v0.3
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
             <div className="flex">
               <div className="flex-shrink-0">
                 <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                   <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                 </svg>
               </div>
               <div className="ml-3">
                 <p className="text-sm text-yellow-700">
                   주의: 이 앱은 로컬 데모 환경입니다. Gemini API Key가 <code>process.env.API_KEY</code>로 주입되어야 합니다.
                 </p>
               </div>
             </div>
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
                    AI 답변의 <strong>순서, 형태(표/리스트), 말투</strong>를 여기서 자유롭게 정의하세요.
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
                rows={6}
                placeholder="예: 1. 내 데이터 내용을 먼저 요약해줘. 2. 그다음 최신 웹 검색 결과와 비교해줘. 3. 답변은 친절한 반말로 해줘."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <IngestionPanel 
                  onAddSource={handleAddSource} 
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
        <p>© 2024 Cheolsan Land. Powered by Gemini & RAG.</p>
        <p className="mt-1">
          데이터는 브라우저의 LocalStorage에 저장됩니다. (브라우저 캐시 삭제 시 데이터가 사라질 수 있습니다)
        </p>
      </footer>
    </div>
  );
};

export default App;
