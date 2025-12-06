
import React, { useState } from 'react';
import { KnowledgeSource, SourceType } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  sources: KnowledgeSource[]; // Now derived from DB metadata
  onDelete: (id: string) => void;
}

const KnowledgeList: React.FC<Props> = ({ sources, onDelete }) => {
  const [viewingSource, setViewingSource] = useState<KnowledgeSource | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [fullContent, setFullContent] = useState('');

  const handleExportSummary = () => {
      const summary = sources.map(s => 
        `[${s.type}] ${s.title} (${s.date}) - URL: ${s.url}`
      ).join('\n');
      
      navigator.clipboard.writeText(summary);
      alert(`총 ${sources.length}개의 데이터 목록이 복사되었습니다.`);
  };

  const handleViewContent = async (source: KnowledgeSource) => {
    setIsContentLoading(true);
    setViewingSource(source);
    setFullContent('불러오는 중...');

    // Fetch all chunks for this source to reconstruct content
    const { data, error } = await supabase
        .from('documents')
        .select('content')
        .contains('metadata', { sourceId: source.id })
        .order('id', { ascending: true });

    if (error || !data) {
        setFullContent('내용을 불러오는데 실패했습니다.');
    } else {
        setFullContent(data.map(d => d.content).join('\n\n'));
    }
    setIsContentLoading(false);
  };

  if (sources.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        저장된 지식이 없습니다. 왼쪽 패널에서 데이터를 추가해주세요. (수파베이스)
      </div>
    );
  }

  return (
    <>
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mt-6 md:mt-0">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">📚 내 데이터베이스 ({sources.length})</h2>
            <button 
              onClick={handleExportSummary}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded border"
            >
              📤 DB 요약 복사
            </button>
        </div>
        
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {sources.map((source) => (
            <div key={source.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-4">
                  <span className={`inline-block px-2 py-1 text-xs font-semibold rounded mb-2 ${
                    source.type === SourceType.YOUTUBE ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {source.type === SourceType.YOUTUBE ? 'YouTube' : 'Blog'}
                  </span>
                  <h3 className="font-bold text-gray-800 leading-tight mb-1 truncate">{source.title}</h3>
                  <p className="text-xs text-gray-500 mb-2">{source.date}</p>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                    원본 링크 열기
                  </a>
                </div>
                <div className="flex flex-col space-y-2">
                  <button 
                    onClick={() => handleViewContent(source)}
                    className="text-blue-400 hover:text-blue-600 p-1 border border-blue-100 rounded bg-blue-50"
                    title="내용 확인 (DB 로드)"
                  >
                    👁️ 보기
                  </button>
                  <button 
                    onClick={() => onDelete(source.id)}
                    className="text-gray-400 hover:text-red-500 p-1 border border-transparent hover:border-red-100 rounded"
                    title="삭제"
                  >
                    🗑️ 삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content Viewer Modal */}
      {viewingSource && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
              <div>
                <h3 className="font-bold text-lg text-gray-800">{viewingSource.title}</h3>
                <p className="text-xs text-gray-500">{viewingSource.date} | {viewingSource.type}</p>
              </div>
              <button 
                onClick={() => setViewingSource(null)}
                className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-gray-50 font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-700">
               {isContentLoading ? '데이터베이스에서 내용을 불러오는 중입니다...' : fullContent}
            </div>
            <div className="p-4 border-t bg-gray-50 rounded-b-lg text-right">
              <button 
                onClick={() => setViewingSource(null)}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 text-sm font-bold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default KnowledgeList;
