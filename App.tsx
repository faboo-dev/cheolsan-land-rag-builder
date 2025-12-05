import React, { useState, useEffect, useMemo } from 'react';
import IngestionPanel from './components/IngestionPanel';
import KnowledgeList from './components/KnowledgeList';
import RAGChat from './components/RAGChat';
import { KnowledgeSource } from './types';
import { GeminiService } from './services/gemini';

// Use local storage to simulate a database for this prototype
const STORAGE_KEY = 'cheolsan_rag_db';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'manage' | 'chat'>('manage');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  
  // Initialize Gemini Service
  const geminiService = useMemo(() => new GeminiService(), []);

  // Load from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSources(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load database", e);
      }
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🎡</span>
            <h1 className="text-2xl font-bold">Cheolsan Land RAG Builder</h1>
          </div>
          <div className="text-sm bg-secondary px-3 py-1 rounded">
             Prototype v0.1
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
            📂 데이터베이스 관리 (Ingestion)
          </button>
          <button
            className={`py-2 px-6 font-medium text-sm focus:outline-none ${
              activeTab === 'chat'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('chat')}
          >
            💬 챗봇 테스트 (RAG Test)
          </button>
        </div>

        {activeTab === 'manage' ? (
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
        ) : (
          <div className="max-w-4xl mx-auto">
            <RAGChat 
              geminiService={geminiService} 
              sources={sources}
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