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
    { role: 'model', text: '안녕하세요! 철산랜드 AI입니다. \n궁금한 여행 정보를 물어보세요!' }
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
                                table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-gray-300 border border-gray-200 text-sm" {...props} /></div>,
                                thead: ({node, ...props}) => <thead className="bg-gray-100 font-semibold text-gray-700" {...props} />,
                                tbody: ({node, ...props}) => <tbody className="divide-y divide-gray-200 bg-white" {...props} />,
                                tr: ({node, ...props}) => <tr className="hover:bg-gray-50 transition-colors" {...props} />,
                                th: ({node, ...props}) => <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0" {...props} />,
                                td: ({node, ...props}) => <td className="px-3 py-2 whitespace-normal border-r border-gray-200 last:border-r-0" {...props} />,
                                a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 hover:underline font-medium break-all" target="_blank" rel="noopener noreferrer" {...props} />,
                            }}
                        >
                            {msg.text || ''}
                        </ReactMarkdown>
                    </div>
                    {(msg.sources?.length || 0) > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">참고한 내 데이터 출처</h4>
                            <div className="flex flex-wrap gap-2">
                                {msg.sources?.map((source, i) => (
                                    <a 
                                        key={i} 
                                        href={source.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className={`inline-flex items-center px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                            source.type === 'YOUTUBE' 
                                            ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100' 
                                            : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-100'
                                        }`}
                                    >
                                        {source.type === 'YOUTUBE' ? '📺' : '📝'} 
                                        <span className="ml-1 truncate max-w-[150px]">{source.title}</span>
                                    </a>
                                ))}
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
                    <span className="text-sm text-gray-500">
                        {searchMode === 'file-api' ? '📁 파일 업로드 및 분석 중 (구글 File API)...' : 
                         searchMode === 'full-text' ? '🔥 전체 데이터 읽는 중...' : '⚡ 데이터 분석 중...'}
                    </span>
                </div>
            </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex flex-col gap-2 mb-3">
            {/* Mode Selection */}
            <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center cursor-pointer">
                    <input type="radio" name="mode" className="mr-1" checked={searchMode === 'rag'} onChange={() => setSearchMode('rag')} />
                    ⚡ 하이브리드 (기본)
                </label>
                <label className="flex items-center cursor-pointer">
                    <input type="radio" name="mode" className="mr-1" checked={searchMode === 'full-text'} onChange={() => setSearchMode('full-text')} />
                    🔥 텍스트 통암기
                </label>
                <label className="flex items-center cursor-pointer">
                    <input type="radio" name="mode" className="mr-1" checked={searchMode === 'file-api'} onChange={() => setSearchMode('file-api')} />
                    📁 구글 파일 API (실험)
                </label>
            </div>

            <div className="flex items-center mt-2">
                <input 
                    type="checkbox" 
                    id="webSearchToggle"
                    checked={useWebSearch} 
                    onChange={(e) => setUseWebSearch(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="webSearchToggle" className="ml-2 text-xs text-gray-700 cursor-pointer select-none">
                    최신 AI웹검색을 통해 <strong>1. 내용 검증</strong>이나 <strong>2. 현재 가격 정보 확인</strong>을 원하시면 체크해주세요. <span className="text-blue-600">(속도 느려짐)</span>
                </label>
            </div>
        </div>

        <form onSubmit={handleSend}>
            <div className="flex gap-2">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="궁금한 내용을 입력하세요"
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
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
