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

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => scrollToBottom(), [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await geminiService.getAnswer(userMsg.text!, systemInstruction, useWebSearch, searchMode);
      setMessages(prev => [...prev, { role: 'model', text: res.answer, sources: res.sources, webSources: res.webSources, debugSnippets: res.debugSnippets }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: '오류가 발생했습니다.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getUrl = (idxStr: string, sources?: any[]) => {
      const idx = parseInt(idxStr);
      const src = sources?.find((s: any) => s.index === idx);
      return src?.url || null;
  };

  return (
    <div className={`flex flex-col ${isEmbed ? 'h-screen' : 'h-[650px] rounded-lg shadow-md border'} bg-white`}>
      {!isEmbed && (
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-lg">
            <div><h2 className="font-bold">🤖 철산랜드 AI</h2><p className="text-xs text-gray-500">Mode: {searchMode}</p></div>
            <button onClick={() => setIsDebugMode(!isDebugMode)} className="text-xs bg-gray-200 px-2 py-1 rounded">🔍 분석</button>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-lg p-4 shadow-sm ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-white border border-gray-100'}`}>
                {msg.role === 'model' ? (
                    <div className="text-sm leading-relaxed text-gray-800 markdown-body">
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: ({node, ...props}) => <h1 className="text-xl font-bold text-teal-700 mt-4 mb-2 border-b pb-1" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-bold text-teal-600 mt-4 mb-2 bg-teal-50 p-1 rounded" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-bold text-gray-700 mt-2" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-bold text-gray-900 bg-yellow-100 px-1 rounded" {...props} />,
                                a: ({node, href, children, ...props}) => {
                                    const text = String(children);
                                    // Check for citation like [[1]] or [1]
                                    const match = text.match(/^\[?\[(\d+)\]\]?$/);
                                    if (match) {
                                        const url = getUrl(match[1], msg.sources);
                                        // Render clickable badge
                                        return (
                                            <button 
                                                onClick={() => url ? window.open(url, '_blank') : alert('URL 정보를 찾을 수 없습니다.')}
                                                className="inline-flex items-center justify-center mx-1 px-1.5 h-5 text-[10px] font-bold text-white bg-blue-500 rounded hover:bg-blue-600 shadow-sm align-top cursor-pointer transition-transform hover:scale-105"
                                                title={url || "링크 없음"}
                                            >
                                                {match[1]}
                                            </button>
                                        );
                                    }
                                    return <a href={href} className="text-blue-600 font-medium hover:underline hover:text-blue-800 break-all" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                                },
                                table: ({node, ...props}) => <div className="overflow-x-auto my-2 border rounded"><table className="min-w-full divide-y divide-gray-200" {...props} /></div>,
                                th: ({node, ...props}) => <th className="px-3 py-2 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase" {...props} />,
                                td: ({node, ...props}) => <td className="px-3 py-2 border-t border-gray-100 text-sm" {...props} />
                            }}
                        >{msg.text || ''}</ReactMarkdown>
                        
                        {/* Footer Sources List */}
                        {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {msg.sources.map((s: any, idx: number) => (
                                    <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center p-2 bg-gray-50 border rounded hover:bg-blue-50 transition text-xs group">
                                        <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold mr-2 text-[10px] group-hover:bg-blue-600">{s.index}</span>
                                        <span className="truncate flex-1 text-gray-700 font-medium">{s.title}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                        {msg.webSources && msg.webSources.length > 0 && (
                            <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                                <p className="font-bold mb-1">🌐 웹 검색 출처:</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    {msg.webSources.map((s, idx) => (
                                        <li key={idx}>
                                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{s.title}</a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ) : ( msg.text )}
            </div>
          </div>
        ))}
        {isLoading && <div className="text-center text-xs text-gray-400 animate-pulse">답변 생성 중...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t">
        <div className="flex gap-2 mb-2 text-xs">
            <select 
                value={searchMode} 
                onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                className="border rounded p-1 bg-gray-50 font-medium"
            >
                <option value="rag">⚡ 하이브리드 (빠름)</option>
                <option value="full-text">🔥 통암기 (정확)</option>
                <option value="file-api">📁 구글 파일 API (실험)</option>
            </select>
            <label className="flex items-center cursor-pointer select-none ml-2">
                <input type="checkbox" checked={useWebSearch} onChange={e => setUseWebSearch(e.target.checked)} className="mr-1" />
                <span className="text-gray-600">🌐 최신 정보 크로스체크 (가격/변동사항)</span>
            </label>
        </div>
        <form onSubmit={handleSend} className="flex gap-2">
            <input 
                value={input} onChange={e => setInput(e.target.value)} 
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none" 
                placeholder="질문을 입력하세요..." 
                disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !input} className="bg-primary text-white px-5 py-3 rounded-lg font-bold hover:bg-teal-800 disabled:opacity-50">전송</button>
        </form>
      </div>
    </div>
  );
};

export default RAGChat;
