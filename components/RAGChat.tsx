import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, KnowledgeSource } from '../types';
import { GeminiService } from '../services/gemini';

interface Props {
  geminiService: GeminiService;
  sources: KnowledgeSource[];
}

const RAGChat: React.FC<Props> = ({ geminiService, sources }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '안녕하세요! 철산랜드 AI 도우미입니다. 무엇을 도와드릴까요? (내 데이터베이스를 기반으로 답변합니다)' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (sources.length === 0) {
      alert("데이터베이스가 비어있습니다. 먼저 데이터를 추가해주세요.");
      return;
    }

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { text, sources: relevantSources } = await geminiService.getAnswer(userMessage.text, sources);
      
      const aiMessage: ChatMessage = { 
        role: 'model', 
        text, 
        sources: relevantSources 
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-bold text-gray-800">🤖 철산랜드 AI 챗봇 테스트</h2>
        <p className="text-xs text-gray-500">RAG(검색 증강 생성)가 적용되어, 입력하신 블로그/유튜브 내용을 기반으로 답변합니다.</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div 
              className={`max-w-[80%] p-3 rounded-lg text-sm whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-primary text-white rounded-br-none' 
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}
            >
              {msg.text}
            </div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 max-w-[80%] bg-gray-50 p-2 rounded border">
                <p className="font-bold mb-1">참고한 출처:</p>
                <ul className="list-disc list-inside">
                  {msg.sources.map((src, i) => (
                    <li key={i} className="truncate">
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        [{src.date}] {src.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
            <div className="flex items-start">
                <div className="bg-gray-100 p-3 rounded-lg rounded-bl-none text-sm text-gray-500">
                    <span className="inline-block animate-pulse">지식베이스 검색 및 답변 생성 중...</span>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 이번 가을 일본 여행 어디가 좋아?"
          className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          disabled={isLoading}
          className="bg-primary text-white px-4 py-2 rounded-md hover:bg-secondary disabled:bg-gray-300"
        >
          전송
        </button>
      </form>
    </div>
  );
};

export default RAGChat;