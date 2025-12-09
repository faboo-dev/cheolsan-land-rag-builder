import React, { useState, useRef, useEffect } from 'react';
import RAGChat from './components/RAGChat';
import './App.css';

function App() {
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 자동 스크롤
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 메시지 전송
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // 사용자 메시지 추가
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      // 서버 URL (환경에 따라 자동 선택)
      const API_URL = import.meta.env.PROD 
        ? 'https://cheolsan-land-rag-builder.onrender.com'
        : 'http://localhost:3000';

      console.log('📤 API 요청:', API_URL + '/api/chat');

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
4. 정확하고 구체적으로 답변하세요.
5. 모르는 내용은 솔직히 모른다고 말하세요.`,
          useWebSearch: useWebSearch
        }),
      });

      if (!response.ok) {
        throw new Error(`서버 오류: ${response.status}`);
      }

      const data = await response.json();

      console.log('📥 API 응답:', data);

      // AI 답변 추가
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer || '답변을 생성할 수 없습니다.'
      }]);

      // 출처 정보 추가
      if (data.sources && data.sources.length > 0) {
        const sourcesText = '\n\n---\n\n**📚 출처:**\n' + 
          data.sources.map((s: any) => `[[${s.index}]] [${s.title}](${s.url})`).join('\n');
        
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content += sourcesText;
          return newMessages;
        });
      }

      // 웹 검색 결과 추가
      if (data.webSources && data.webSources.length > 0) {
        const webSourcesText = '\n\n**🌐 웹 검색 출처:**\n' + 
          data.webSources.map((s: any) => `- [${s.title}](${s.url})`).join('\n');
        
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content += webSourcesText;
          return newMessages;
        });
      }

    } catch (error) {
      console.error('❌ 오류:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '⚠️ 죄송합니다. 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <div className="chat-container">
        <div className="chat-header">
          <h1>🏰 철산랜드 AI 챗봇</h1>
          <p className="subtitle">File Search API로 빠르고 정확한 답변을 제공합니다</p>
        </div>

        <div className="settings-bar">
          <label className="web-search-toggle">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
            />
            <span>🌐 최신 실시간 정보 크로스체크 (약간 느려질 수 있음, 속도 느리면 체크 해제)</span>
          </label>
        </div>

        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-message">
              <h2>👋 안녕하세요!</h2>
              <p>철산랜드에 대해 무엇이든 물어보세요.</p>
              <div className="example-questions">
                <p><strong>예시 질문:</strong></p>
                <ul>
                  <li>철산랜드에서 가장 인기 있는 콘텐츠는?</li>
                  <li>유튜브 영상 중 추천할 만한 것은?</li>
                  <li>블로그 글의 주요 주제는?</li>
                </ul>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div className="message-content">
                  {msg.role === 'user' ? (
                    <p>{msg.content}</p>
                  ) : (
                    <RAGChat content={msg.content} />
                  )}
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="loading-indicator">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <p>답변 생성 중...</p>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-container">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="새롭 호기심이 가득한 것에 질문이 있나요?"
            disabled={isLoading}
            className="chat-input"
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="send-button"
          >
            {isLoading ? '⏳' : '전송'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
