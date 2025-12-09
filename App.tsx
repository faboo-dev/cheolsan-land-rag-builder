import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  webSources?: any[];
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const API_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000'
        : 'https://cheolsan-land-rag-builder.onrender.com';

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage,
          systemInstruction: `당신은 철산랜드의 친절한 AI 어시스턴트입니다.

**답변 규칙:**
1. 정보를 언급할 때 반드시 [[1]], [[2]] 형식으로 출처번호를 표시하세요.
2. 모든 제목에 관련 이모지를 추가하세요 (예: ## 🏰 제목)
3. 마크다운 문법을 사용하세요 (표, 리스트, 링크 등)
4. 정확하고 구체적으로 답변하세요.`,
          useWebSearch: useWebSearch
        }),
      });

      if (!response.ok) {
        throw new Error(`서버 오류: ${response.status}`);
      }

      const data = await response.json();

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer || '답변을 생성할 수 없습니다.',
        sources: data.sources,
        webSources: data.webSources
      }]);

    } catch (error) {
      console.error('❌ 오류:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '⚠️ 죄송합니다. 답변 생성 중 오류가 발생했습니다.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="max-w-4xl mx-auto h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <h1 className="text-3xl font-bold">🏰 철산랜드 AI 챗봇</h1>
          <p className="text-sm opacity-90 mt-2">File Search API로 빠르고 정확한 답변을 제공합니다</p>
        </div>

        {/* 웹 검색 토글 */}
        <div className="bg-gray-50 p-3 border-b">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              🌐 최신 실시간 정보 크로스체크 (약간 느려질 수 있음)
            </span>
          </label>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-2xl font-bold text-gray-700 mb-4">👋 안녕하세요!</h2>
              <p className="text-gray-600">철산랜드에 대해 무엇이든 물어보세요.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl p-4 ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white' 
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                      
                      {/* 출처 표시 */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t text-xs">
                          <p className="font-bold mb-2">📚 출처:</p>
                          <div className="space-y-1">
                            {msg.sources.map((s: any) => (
                              <a 
                                key={s.index} 
                                href={s.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="block text-blue-600 hover:underline"
                              >
                                [[{s.index}]] {s.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 웹 검색 출처 */}
                      {msg.webSources && msg.webSources.length > 0 && (
                        <div className="mt-2 pt-2 border-t text-xs">
                          <p className="font-bold mb-2">🌐 웹 검색 출처:</p>
                          <div className="space-y-1">
                            {msg.webSources.map((s: any, i: number) => (
                              <a 
                                key={i} 
                                href={s.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="block text-blue-600 hover:underline"
                              >
                                {s.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border rounded-2xl p-4">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <form onSubmit={handleSubmit} className="p-4 bg-white border-t flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="새로운 호기심이 가득한 것에 질문이 있나요?"
            disabled={isLoading}
            className="flex-1 p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-3 rounded-full font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? '⏳' : '전송'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
