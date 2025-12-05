
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, KnowledgeSource } from '../types';
import { GeminiService } from '../services/gemini';

interface Props {
  geminiService: GeminiService;
  sources: KnowledgeSource[];
  systemInstruction: string;
}

const RAGChat: React.FC<Props> = ({ geminiService, sources, systemInstruction }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '안녕하세요! 철산랜드 AI입니다. \n설정하신 페르소나와 지침에 따라 자유롭게 답변해드립니다.\n궁금한 점을 물어보세요!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isDebugMode]);

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
      const result = await geminiService.getAnswer(userMessage.text!, sources, systemInstruction);
      
      const aiMessage: ChatMessage = { 
        role: 'model', 
        text: result.answer,
        sources: result.sources,
        webSources: result.webSources,
        debugSnippets: result.debugSnippets
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReport = (msg: ChatMessage) => {
    const report = `
[철산랜드 RAG 튜닝 리포트]
-------------------------
질문: "${messages[messages.indexOf(msg) - 1]?.text}"

[페르소나]
${systemInstruction}

[참고 데이터 Top 3]
${msg.debugSnippets?.slice(0, 3).map((snip, i) => `${i+1}. [${(snip.score*100).toFixed(0)}%] ${snip.sourceTitle}`).join('\n')}

[답변]
${msg.text?.substring(0, 100)}...
-------------------------
    `.trim();
    navigator.clipboard.writeText(report);
    alert("리포트 복사 완료!");
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b bg-gray-50 rounded-t-lg flex justify-between items-center">
        <div>
            <h2 className="font-bold text-gray-800">🤖 철산랜드 AI 챗봇</h2>
            <p className="text-xs text-gray-500">사용자 정의 페르소나 적용됨</p>
        </div>
        <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-gray-600">🔍 분석 모드</span>
            <button 
                onClick={() => setIsDebugMode(!isDebugMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${isDebugMode ? 'bg-primary' : 'bg-gray-200'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${isDebugMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            
            {msg.role === 'user' && (
              <div className="bg-primary text-white p-3 rounded-lg rounded-br-none max-w-[80%] text-sm shadow">
                {msg.text}
              </div>
            )}

            {msg.role === 'model' && (
              <div className="w-full max-w-3xl space-y-4">
                {/* Unified Answer Bubble */}
                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </div>

                    {/* Sources Footer */}
                    {(msg.sources?.length || 0) + (msg.webSources?.length || 0) > 0 && (
                        <div className="mt-4 pt-3 border-t flex flex-col gap-2">
                             {/* Internal Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="text-xs bg-green-50 p-2 rounded border border-green-100">
                                    <span className="font-bold text-green-800 block mb-1">📚 참고한 내 데이터:</span>
                                    <ul className="space-y-1">
                                    {msg.sources.map((src, i) => (
                                        <li key={i}>
                                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline truncate block">
                                            • {src.title} ({src.date})
                                        </a>
                                        </li>
                                    ))}
                                    </ul>
                                </div>
                            )}
                            {/* Web Sources */}
                            {msg.webSources && msg.webSources.length > 0 && (
                                <div className="text-xs bg-blue-50 p-2 rounded border border-blue-100">
                                    <span className="font-bold text-blue-800 block mb-1">🌐 참고한 웹 검색:</span>
                                    <div className="flex flex-wrap gap-2">
                                    {msg.webSources.map((src, i) => (
                                        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                            [{src.title}]
                                        </a>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* DEBUG PANEL */}
                {isDebugMode && msg.debugSnippets && (
                    <div className="bg-gray-800 text-green-400 p-4 rounded-lg font-mono text-xs shadow-inner">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-600 pb-2">
                            <h4 className="font-bold text-white">🔍 검색 데이터 분석 (X-Ray)</h4>
                            <button onClick={() => handleCopyReport(msg)} className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded border border-gray-500">
                                📋 리포트 복사
                            </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {msg.debugSnippets.map((snip, i) => (
                                <div key={i} className="border-b border-gray-700 pb-1">
                                    <div className="flex justify-between">
                                        <span className="text-yellow-300">Rank #{i+1}</span>
                                        <span className={snip.score > 0.5 ? 'text-green-300' : 'text-red-300'}>
                                            {(snip.score * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    <p className="text-gray-400 truncate">{snip.sourceTitle}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
            <div className="flex items-center space-x-2 p-4 bg-white rounded-lg shadow-sm w-fit">
               <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
               <span className="text-sm text-gray-500">지침에 따라 분석 및 답변 생성 중...</span>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t bg-white flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="질문을 입력하세요..."
          className="flex-1 border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          disabled={isLoading}
          className="bg-primary text-white px-6 py-3 rounded-md hover:bg-secondary disabled:bg-gray-300 font-bold shadow-sm transition-colors"
        >
          전송
        </button>
      </form>
    </div>
  );
};

export default RAGChat;
