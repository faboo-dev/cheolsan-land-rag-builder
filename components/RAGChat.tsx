
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, KnowledgeSource } from '../types';
import { GeminiService } from '../services/gemini';

interface Props {
  geminiService: GeminiService;
  sources: KnowledgeSource[];
  systemInstruction: string;
  isEmbed?: boolean;
}

const RAGChat: React.FC<Props> = ({ geminiService, systemInstruction, isEmbed = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '안녕하세요! 철산랜드 AI입니다. \n궁금한 여행 정보를 물어보세요!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false); // Default: Off for speed

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
    
    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Pass useWebSearch state to service
      const result = await geminiService.getAnswer(userMessage.text!, systemInstruction, useWebSearch);
      
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
웹검색 사용: ${useWebSearch ? 'ON' : 'OFF'}

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
    <div className={`flex flex-col ${isEmbed ? 'h-screen' : 'h-[600px] rounded-lg shadow-md border border-gray-200'} bg-white`}>
      {/* Chat Header */}
      {!isEmbed && (
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
      )}
      
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
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="text-sm text-gray-800 leading-relaxed markdown-body">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({node, ...props}) => (
                            <div className="overflow-x-auto my-4 rounded-lg border border-gray-200">
                              <table className="min-w-full divide-y divide-gray-200" {...props} />
                            </div>
                          ),
                          thead: ({node, ...props}) => <thead className="bg-gray-50" {...props} />,
                          tbody: ({node, ...props}) => <tbody className="bg-white divide-y divide-gray-200" {...props} />,
                          tr: ({node, ...props}) => <tr className="even:bg-gray-50 hover:bg-gray-100 transition-colors" {...props} />,
                          th: ({node, ...props}) => <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b" {...props} />,
                          td: ({node, ...props}) => <td className="px-4 py-3 text-sm text-gray-600 whitespace-pre-wrap" {...props} />,
                          a: ({node, ...props}) => (
                            <a 
                              className="text-blue-600 hover:text-blue-800 hover:underline font-semibold transition-colors bg-blue-50 px-1 rounded" 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              {...props} 
                            />
                          ),
                          ul: ({node, ...props}) => <ul className="list-disc ml-5 my-2 space-y-1 text-gray-700" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal ml-5 my-2 space-y-1 text-gray-700" {...props} />,
                          h1: ({node, ...props}) => <h1 className="text-2xl font-bold my-4 pb-2 border-b text-gray-900" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-bold my-3 pb-2 border-b text-gray-800" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-bold my-2 text-primary" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary pl-4 py-2 bg-gray-50 italic my-4 text-gray-600 rounded-r" {...props} />,
                          code: ({node, ...props}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-red-500 font-mono text-xs" {...props} />,
                        }}
                      >
                        {msg.text || ''}
                      </ReactMarkdown>
                    </div>

                    {((msg.sources?.length || 0) + (msg.webSources?.length || 0) > 0) && (
                        <div className="mt-8 pt-4 border-t border-gray-100 flex flex-col gap-3 bg-gray-50 -mx-6 -mb-6 p-6">
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="text-xs text-gray-500">
                                    <span className="font-bold text-gray-700 block mb-2 flex items-center">
                                        📚 이 답변에 참고된 내 데이터:
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                    {msg.sources.map((src, i) => (
                                        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" className="bg-white border border-gray-200 hover:border-primary hover:text-primary px-3 py-1.5 rounded-full transition-all text-gray-600 shadow-sm">
                                            {src.title}
                                        </a>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {(!isEmbed && isDebugMode && msg.debugSnippets) && (
                    <div className="bg-gray-800 text-green-400 p-4 rounded-lg font-mono text-xs shadow-inner mt-2">
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
               <span className="text-sm text-gray-500">답변 생성 중...</span>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t p-2">
        {/* Speed Option Checkbox */}
        <div className="px-4 py-1 flex items-center">
            <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-600 hover:text-primary">
                <input 
                    type="checkbox" 
                    checked={useWebSearch}
                    onChange={(e) => setUseWebSearch(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary"
                />
                <span className="font-semibold">🌐 최신 실시간 정보 크로스체크 (속도 느림)</span>
            </label>
        </div>

        <form onSubmit={handleSend} className="p-2 flex gap-2">
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
    </div>
  );
};

export default RAGChat;
