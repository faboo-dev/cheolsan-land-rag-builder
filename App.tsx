import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ id: number; title: string; content: string }>;
  webSources?: Array<{ title: string; content: string }>;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 올바른 API URL
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://cheolsan-server.onrender.com';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const systemInstruction = `당신은 철산랜드의 친절한 AI 어시스턴트입니다.
제공된 문서 내용을 기반으로 정확하게 답변하세요.
정보를 언급할 때 [[1]], [[2]] 형식으로 출처번호를 표시하세요.
마크다운 문법을 사용하세요.
문서에 없는 내용은 "제공된 자료에 해당 내용이 없습니다"라고 명시하세요.`;

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      console.log('🔵 API 요청:', `${API_URL}/api/chat`);
      
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: input,
          systemInstruction,
          useWebSearch
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ API 응답:', data);

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
        webSources: data.webSources || []
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('❌ API 오류:', error);
      
      const errorMessage: Message = {
        role: 'assistant',
        content: `⚠️ **오류 발생**\n\n${error.message}\n\n잠시 후 다시 시도해주세요.`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🏝️ 철산랜드 챗봇</h1>
        <div className="header-controls">
          <label className="web-search-toggle">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
            />
            <span>웹 검색 사용</span>
          </label>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages-container">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <div className="message-content">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="sources">
                  <h4>📚 참고 문서:</h4>
                  {msg.sources.map(source => (
                    <div key={source.id} className="source-item">
                      <strong>[{source.id}] {source.title}</strong>
                      <p>{source.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {msg.webSources && msg.webSources.length > 0 && (
                <div className="web-sources">
                  <h4>🌐 웹 검색 결과:</h4>
                  {msg.webSources.map((source, i) => (
                    <div key={i} className="source-item">
                      <strong>{source.title}</strong>
                      <p>{source.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="message assistant">
              <div className="loading">⏳ 답변 생성 중...</div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
            placeholder="질문을 입력하세요..."
            disabled={isLoading}
          />
          <button onClick={handleSend} disabled={isLoading || !input.trim()}>
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
