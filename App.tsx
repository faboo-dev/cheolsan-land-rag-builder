import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Admin from './Admin';
import './App.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  webSources?: any[];
}

function App() {
  // URL 경로 확인 - /admin이면 관리자 페이지
  const isAdminPage = window.location.pathname === '/admin';
  
  // 관리자 페이지면 Admin 컴포넌트 렌더링
  if (isAdminPage) {
    return <Admin />;
  }

  // 기존 챗봇 코드
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
        : 'https://cheolsan-server.onrender.com';

      console.log('🔵 1. 요청 시작');
      console.log('🔵 2. API URL:', `${API_URL}/api/chat`);
      console.log('🔵 3. 질문:', userMessage);

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage,
          useWebSearch: useWebSearch
        }),
      });

      console.log('🔵 4. 응답 받음');
      console.log('🔵 5. 상태 코드:', response.status);

      const responseText = await response.text();
      console.log('🔵 6. 응답 텍스트 길이:', responseText.length);

      if (!response.ok) {
        console.error('🔴 HTTP 에러:', response.status);
        throw new Error(`서버 에러 ${response.status}: ${responseText}`);
      }

      if (responseText.trim() === '') {
        console.error('🔴 빈 응답');
        throw new Error('서버가 빈 응답을 반환했습니다');
      }

      let data;
      try {
        data = JSON.parse(responseText);
        console.log('🟢 JSON 파싱 성공!');
        
        // 커스텀 프롬프트 사용 여부 표시
        if (data.usingCustomPrompt) {
          console.log('✅ 관리자 커스텀 프롬프트 사용 중');
        } else {
          console.log('📋 기본 프롬프트 사용 중');
        }
        
      } catch (parseError: any) {
        console.error('🔴 JSON 파싱 실패:', parseError.message);
        throw new Error(`JSON 파싱 실패: ${parseError.message}`);
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer || '답변을 생성할 수 없습니다.',
        sources: data.sources,
        webSources: data.webSources
      }]);

      console.log('🟢 완료!');

    } catch (error: any) {
      console.error('🔴 에러 발생:', error);
      
      let errorMessage = '⚠️ **오류가 발생했습니다**\n\n';
      errorMessage += `**에러 메시지:** ${error.message}\n\n`;
      errorMessage += '잠시 후 다시 시도해주세요.';
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="max-w-4xl mx-auto h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">🏰 철산랜드 AI 챗봇</h1>
              <p className="text-sm opacity-90 mt-2">Gemini 2.0 Flash로 빠르고 정확한 답변 제공</p>
            </div>
            <a 
              href="/admin" 
              className="bg-white text-purple-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 transition text-sm"
            >
              🔧 관리자
            </a>
          </div>
        </div>

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

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-2xl font-bold text-gray-700 mb-4">👋 안녕하세요!</h2>
              <p className="text-gray-600">철산랜드에 대해 무엇이든 물어보세요.</p>
              <p className="text-sm text-gray-500 mt-2">전체 {/* 문서 개수는 첫 응답 후 표시 */} 문서를 분석하여 답변합니다.</p>
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
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      
                      {/* 출처 표시 */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t text-xs">
                          <p className="font-bold text-gray-700 mb-2">📚 참고 문서:</p>
                          <div className="space-y-1">
                            {msg.sources.slice(0, 5).map((src: any) => (
                              <div key={src.id} className="text-gray-600 bg-gray-50 p-2 rounded">
                                <span className="font-bold">[{src.id}]</span> {src.title} 
                                <span className="text-gray-400 ml-2">({src.date})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 웹 검색 결과 */}
                      {msg.webSources && msg.webSources.length > 0 && (
                        <div className="mt-3 pt-3 border-t text-xs">
                          <p className="font-bold text-gray-700 mb-2">🌐 웹 검색 결과:</p>
                          {msg.webSources.map((src: any, idx: number) => (
                            <div key={idx} className="text-gray-600 bg-blue-50 p-2 rounded">
                              {src.content}
                            </div>
                          ))}
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

        <form onSubmit={handleSubmit} className="p-4 bg-white border-t flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="철산랜드에 대해 궁금한 점을 물어보세요..."
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
