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
          systemInstruction: `당신은 철산랜드의 친절한 AI 어시스턴트입니다.

**답변 규칙:**
1. 정보를 언급할 때 반드시 [[1]], [[2]] 형식으로 출처번호를 표시하세요.
2. 모든 제목에 관련 이모지를 추가하세요 (예: ## 🏰 제목)
3. 마크다운 문법을 사용하세요 (표, 리스트, 링크 등)
4. 정확하고 구체적으로 답변하세요.`,
          useWebSearch: useWebSearch
        }),
      });

      console.log('🔵 4. 응답 받음');
      console.log('🔵 5. 상태 코드:', response.status);
      console.log('🔵 6. 상태 텍스트:', response.statusText);
      console.log('🔵 7. Content-Type:', response.headers.get('content-type'));

      // 응답 텍스트 먼저 읽기
      const responseText = await response.text();
      console.log('🔵 8. 응답 텍스트 길이:', responseText.length);
      console.log('🔵 9. 응답 내용 (앞부분):', responseText.substring(0, 300));

      if (!response.ok) {
        console.error('🔴 HTTP 에러:', response.status);
        throw new Error(`서버 에러 ${response.status}: ${responseText}`);
      }

      if (responseText.trim() === '') {
        console.error('🔴 빈 응답');
        throw new Error('서버가 빈 응답을 반환했습니다');
      }

      // JSON 파싱 시도
      console.log('🔵 10. JSON 파싱 시도...');
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('🟢 11. JSON 파싱 성공!');
        console.log('🟢 12. 답변 길이:', data.answer?.length || 0);
      } catch (parseError: any) {
        console.error('🔴 JSON 파싱 실패:', parseError.message);
        console.error('🔴 원본 텍스트:', responseText);
        throw new Error(`JSON 파싱 실패: ${parseError.message}\n\n서버 응답:\n${responseText.substring(0, 500)}`);
      }

      console.log('🟢 13. 메시지 추가');

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer || '답변을 생성할 수 없습니다.',
        sources: data.sources,
        webSources: data.webSources
      }]);

      console.log('🟢 14. 완료!');

    } catch (error: any) {
      console.error('🔴🔴🔴 에러 발생 🔴🔴🔴');
      console.error('에러 타입:', error.constructor.name);
      console.error('에러 메시지:', error.message);
      console.error('전체 에러:', error);
      
      let errorMessage = '⚠️ **오류가 발생했습니다**\n\n';
      errorMessage += `**에러 타입:** ${error.constructor.name}\n\n`;
      errorMessage += `**에러 메시지:**\n${error.message}\n\n`;
      errorMessage += '**개발자 도구 Console을 확인해주세요** (F12)';
      
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
          <h1 className="text-3xl font-bold">🏰 철산랜드 AI 챗봇</h1>
          <p className="text-sm opacity-90 mt-2">File Search API로 빠르고 정확한 답변을 제공합니다</p>
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
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
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
