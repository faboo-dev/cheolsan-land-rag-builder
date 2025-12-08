
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, KnowledgeSource } from '../types';
import { GeminiService, SearchMode } from '../services/gemini';

interface Props {
  geminiService: GeminiService;
  sources: KnowledgeSource[];
  systemInstruction: string;
  isEmbed?: boolean;
}

const RAGChat: React.FC<Props> = ({ geminiService, systemInstruction, isEmbed = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '안녕하세요! 🎡 **철산랜드 AI**입니다.\n여행에 대해 궁금한 점이 있으신가요? 무엇이든 물어보세요! 😊' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false); 
  const [searchMode, setSearchMode] = useState<SearchMode>('rag');

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
      const result = await geminiService.getAnswer(
        userMessage.text!, 
        systemInstruction, 
        useWebSearch, 
        searchMode
      );
      
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
모드: ${searchMode.toUpperCase()}
웹검색: ${useWebSearch ? 'ON' : 'OFF'}
답변: ${msg.text?.substring(0, 100)}...
-------------------------
    `.trim();
    navigator.clipboard.writeText(report);
    alert("리포트 복사 완료!");
  };

  // Helper to find URL for index
  const getUrlForIndex = (indexStr: string, sources?: any[]) => {
      const idx = parseInt(indexStr);
      // Try to find by explicit index property first, then by array index
      const source = sources?.find((s: any) => s.index === idx) || sources?.[idx - 1];
      return source?.url || '#';
  };

  return (
    <div className={`flex flex-col ${isEmbed ? 'h-screen' : 'h-[650px] rounded-lg shadow-md border border-gray-200'} bg-white`}>
      {/* Header */}
      {!isEmbed && (
        <div className="p-4 border-b bg-gray-50 rounded-t-lg flex justify-between items-center">
            <div>
                <h2 className="font-bold text-gray-800">🤖 철산랜드 AI 챗봇</h2>
                <p className="text-xs text-gray-500">Mode: {searchMode === 'rag' ? '⚡Hybrid RAG' : searchMode === 'full-text' ? '🔥Full Text' : '📁File API'}</p>
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
                                // Headings
                                h1: ({node, ...props}) => <h1 className="text-xl font-bold text-primary mt-6 mb-3 border-b pb-2 flex items-center" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-bold text-secondary mt-5 mb-2 flex items-center" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-bold text-gray-700 mt-4 mb-1" {...props} />,
                                // Strong (Highlight)
                                strong: ({node, ...props}) => <strong className="font-bold text-gray-900 bg-yellow-50 px-1 rounded border border-yellow-100" {...props} />,
                                // Lists
                                ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1 text-gray-700" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-gray-700" {...props} />,
                                // Table
                                table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-lg border border-gray-200"><table className="min-w-full divide-y divide-gray-300 text-sm" {...props} /></div>,
                                thead: ({node, ...props}) => <thead className="bg-gray-100 font-semibold text-gray-700" {...props} />,
                                tbody: ({node, ...props}) => <tbody className="divide-y divide-gray-200 bg-white" {...props} />,
                                tr: ({node, ...props}) => <tr className="hover:bg-gray-50 transition-colors" {...props} />,
                                th: ({node, ...props}) => <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" {...props} />,
                                td: ({node, ...props}) => <td className="px-3 py-2 whitespace-normal border-r border-gray-200 text-gray-600" {...props} />,
                                // Paragraph
                                p: ({node, ...props}) => <p className="mb-3 last:mb-0 leading-7" {...props} />,
                                // Links & Citations
                                a: ({node, ...props}) => {
                                    const text = String(props.children);
                                    // Citation Match: [[1]], [1], etc.
                                    const citationMatch = text.match(/^\[?\[(\d+)\]\]?$/);
                                    
                                    if (citationMatch) {
                                        const index = citationMatch[1];
                                        const url = getUrlForIndex(index, msg.sources);
                                        return (
                                            <a 
                                                href={url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center align-super mx-0.5 min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-blue-500 rounded-full hover:bg-blue-600 transition-all no-underline shadow-sm transform hover:scale-110 cursor-pointer"
                                                title={`출처 ${index}번으로 이동`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                }}
                                            >
                                                {index}
                                            </a>
                                        );
                                    }
                                    // Regular Link
                                    return <a className="text-blue-600 font-medium hover:text-blue-800 hover:underline break-all cursor-pointer" target="_blank" rel="noopener noreferrer" {...props} />
                                },
                            }}
                        >
                            {msg.text || ''}
                        </ReactMarkdown>
                    </div>
                    
                    {/* Footer Citations */}
                    {(msg.sources?.length || 0) > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide flex items-center">
                                📚 참고한 출처
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {msg.sources?.map((source: any, i: number) => {
                                    // Ensure index is displayed correctly
                                    const displayIndex = source.index || i + 1;
                                    return (
                                        <a 
                                            key={i} 
                                            href={source.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className={`flex items-center p-2 rounded-md border text-xs transition-all hover:shadow-sm ${
                                                source.type === 'YOUTUBE' 
                                                ? 'bg-red-50 text-red-800 border-red-100 hover:bg-red-100' 
                                                : 'bg-green-50 text-green-800 border-green-100 hover:bg-green-100'
                                            }`}
                                        >
                                            <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full mr-2 font-bold text-white text-[10px] ${source.type === 'YOUTUBE' ? 'bg-red-400' : 'bg-green-500'}`}>
                                                {displayIndex}
                                            </span>
                                            <span className="truncate flex-1 font-medium">{source.title}</span>
                                            <span className="ml-1 text-xs opacity-60">↗</span>
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                {isDebugMode && msg.debugSnippets && (
                    <div className="bg-gray-800 rounded-lg p-4 text-xs font-mono text-gray-300 shadow-inner">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                            <span className="font-bold text-yellow-400">🔍 모드: {searchMode}</span>
                            <button onClick={() => handleCopyReport(msg)} className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white">📋 복사</button>
                        </div>
                        {msg.debugSnippets.map((snip, i) => (
                            <div key={i} className="border-b border-gray-700 pb-1 mb-1">{snip.sourceTitle}</div>
                        ))}
                    </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex items-center space-x-3">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                    <span className="text-sm text-gray-500 animate-pulse">
                        {searchMode === 'file-api' ? '📁 구글 AI가 파일을 읽고 있습니다...' : 
                         searchMode === 'full-text' ? '🔥 전체 데이터를 분석 중입니다...' : '⚡ 답변을 생성하고 있습니다...'}
                    </span>
                </div>
            </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex flex-col gap-2 mb-3">
            {/* Mode Selection */}
            <div className="flex items-center gap-4 text-sm bg-gray-50 p-2 rounded-lg border border-gray-100">
                <span className="text-xs font-bold text-gray-500 mr-1">MODE:</span>
                <label className="flex items-center cursor-pointer hover:text-primary transition-colors">
                    <input type="radio" name="mode" className="mr-1 accent-primary" checked={searchMode === 'rag'} onChange={() => setSearchMode('rag')} />
                    ⚡ 하이브리드
                </label>
                <label className="flex items-center cursor-pointer hover:text-primary transition-colors">
                    <input type="radio" name="mode" className="mr-1 accent-primary" checked={searchMode === 'full-text'} onChange={() => setSearchMode('full-text')} />
                    🔥 통암기
                </label>
                <label className="flex items-center cursor-pointer hover:text-primary transition-colors">
                    <input type="radio" name="mode" className="mr-1 accent-primary" checked={searchMode === 'file-api'} onChange={() => setSearchMode('file-api')} />
                    📁 File API
                </label>
            </div>

            <div className="flex items-center mt-1 px-1">
                <input 
                    type="checkbox" 
                    id="webSearchToggle"
                    checked={useWebSearch} 
                    onChange={(e) => setUseWebSearch(e.target.checked)}
                    className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                />
                <label htmlFor="webSearchToggle" className="ml-2 text-xs text-gray-600 cursor-pointer select-none">
                    <span className="font-bold text-blue-600">🌐 최신 실시간 정보 크로스체크</span> (가격/정보 검증, 속도 느림)
                </label>
            </div>
        </div>

        <form onSubmit={handleSend}>
            <div className="flex gap-2">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="세부 호핑투어 가격이 얼마야?"
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm transition-all"
                disabled={isLoading}
            />
            <button 
                type="submit" 
                disabled={isLoading || !input.trim()}
                className="bg-primary text-white px-6 py-3 rounded-lg font-bold hover:bg-secondary disabled:bg-gray-300 disabled:cursor-not-allowed shadow transition-colors"
            >
                전송
            </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default RAGChat;
