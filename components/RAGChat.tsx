
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, KnowledgeSource } from '../types';
import { GeminiService } from '../services/gemini';

interface Props {
  geminiService: GeminiService;
  sources: KnowledgeSource[];
}

const RAGChat: React.FC<Props> = ({ geminiService, sources }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', ragAnswer: '안녕하세요! 철산랜드 AI입니다. \n\n1. 제 데이터베이스(블로그/유튜브)\n2. 실시간 구글 검색\n3. 팩트 크로스체크\n\n이 3단계로 완벽하게 분석해드립니다. 궁금한 점을 물어보세요!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false); // Toggle for Analysis Mode

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isDebugMode]); // Also scroll when debug mode changes

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
      // Call the updated service method
      const result = await geminiService.getAnswer(userMessage.text!, sources);
      
      const aiMessage: ChatMessage = { 
        role: 'model', 
        ragAnswer: result.ragAnswer,
        webAnswer: result.webAnswer,
        comparisonAnswer: result.comparisonAnswer,
        sources: result.sources,
        webSources: result.webSources,
        debugSnippets: result.debugSnippets // Receive debug info
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', ragAnswer: '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReport = (msg: ChatMessage) => {
    const report = `
[철산랜드 RAG 튜닝 리포트]
-------------------------
사용자 질문: "${messages[messages.indexOf(msg) - 1]?.text}"

[1. 검색된 데이터 조각 (Score 높은 순)]
${msg.debugSnippets?.map((snip, i) => `
${i + 1}. [${(snip.score * 100).toFixed(1)}%] ${snip.sourceTitle}
   "${snip.text.substring(0, 100).replace(/\n/g, ' ')}..."
`).join('')}

[2. AI 답변 요약]
- RAG: ${msg.ragAnswer?.substring(0, 50)}...
- Web: ${msg.webAnswer?.substring(0, 50)}...
-------------------------
    `.trim();
    
    navigator.clipboard.writeText(report);
    alert("튜닝용 리포트가 복사되었습니다! 개발자에게 붙여넣어주세요.");
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b bg-gray-50 rounded-t-lg flex justify-between items-center">
        <div>
            <h2 className="font-bold text-gray-800">🤖 철산랜드 AI 챗봇 테스트</h2>
            <p className="text-xs text-gray-500">3-Step Analysis (내 데이터 + 구글 검색 + 크로스체크)</p>
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
            
            {/* User Message Bubble */}
            {msg.role === 'user' && (
              <div className="bg-primary text-white p-3 rounded-lg rounded-br-none max-w-[80%] text-sm shadow">
                {msg.text}
              </div>
            )}

            {/* AI Response Blocks */}
            {msg.role === 'model' && (
              <div className="w-full max-w-3xl space-y-4">
                
                {/* 1. Internal DB Answer */}
                {msg.ragAnswer && (
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-l-4 border-l-primary">
                    <h3 className="text-sm font-bold text-primary mb-2 flex items-center">
                      🏰 철산랜드 데이터베이스 답변
                    </h3>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {msg.ragAnswer}
                    </div>
                    {/* Citations */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t text-xs bg-gray-50 p-2 rounded">
                        <p className="font-semibold text-gray-600 mb-1">참고한 철산랜드 콘텐츠:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {msg.sources.map((src, i) => (
                            <li key={i}>
                              <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                [{src.date}] {src.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Web Search Result */}
                {msg.webAnswer && (
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-l-4 border-l-blue-500">
                    <h3 className="text-sm font-bold text-blue-600 mb-2 flex items-center">
                      🌐 실시간 최신 웹 검색 결과 (Google)
                    </h3>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {msg.webAnswer}
                    </div>
                    {/* Web Sources */}
                    {msg.webSources && msg.webSources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {msg.webSources.map((src, i) => (
                          <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" 
                             className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 truncate max-w-[200px] hover:bg-blue-100">
                            🔗 {src.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Cross Check Result */}
                {msg.comparisonAnswer && (
                  <div className="bg-amber-50 p-4 rounded-lg shadow-sm border border-amber-200">
                    <h3 className="text-sm font-bold text-amber-700 mb-2 flex items-center">
                      ⚖️ 팩트 크로스 체크 (최신 정보 검증)
                    </h3>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-medium">
                      {msg.comparisonAnswer}
                    </div>
                  </div>
                )}

                {/* DEBUG PANEL (Visible only when toggle is ON) */}
                {isDebugMode && msg.debugSnippets && (
                    <div className="bg-gray-800 text-green-400 p-4 rounded-lg font-mono text-xs shadow-inner">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-600 pb-2">
                            <h4 className="font-bold text-white">🔍 RAG 검색 정확도 분석 (X-Ray)</h4>
                            <button 
                                onClick={() => handleCopyReport(msg)}
                                className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs border border-gray-500"
                            >
                                📋 튜닝 리포트 복사
                            </button>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto">
                            {msg.debugSnippets.map((snip, i) => (
                                <div key={i} className="border-b border-gray-700 pb-2">
                                    <div className="flex justify-between">
                                        <span className="text-yellow-300 font-bold">Rank #{i+1}</span>
                                        <span className={`${snip.score > 0.5 ? 'text-green-300' : 'text-red-300'}`}>
                                            유사도: {(snip.score * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <p className="text-gray-400 mb-1">[{snip.sourceTitle}]</p>
                                    <p className="text-gray-300 opacity-80 italic">"{snip.text}"</p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-2 text-gray-500 text-[10px]">
                            * 유사도 70% 이상: 매우 정확함 / 50% 이하: 관련성 낮음 (데이터 보강 필요)
                        </p>
                    </div>
                )}

              </div>
            )}
          </div>
        ))}
        {isLoading && (
            <div className="flex items-center space-x-2 p-4 bg-white rounded-lg shadow-sm w-fit">
               <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
               <span className="text-sm text-gray-500">철산랜드 DB 분석 및 구글 검색 진행 중... (약 5~10초 소요)</span>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t bg-white flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="궁금한 여행 정보를 물어보세요"
          className="flex-1 border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          disabled={isLoading}
          className="bg-primary text-white px-6 py-3 rounded-md hover:bg-secondary disabled:bg-gray-300 font-bold shadow-sm transition-colors"
        >
          {isLoading ? '분석 중...' : '질문하기'}
        </button>
      </form>
    </div>
  );
};

export default RAGChat;
