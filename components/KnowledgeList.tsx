import React from 'react';
import { KnowledgeSource, SourceType } from '../types';

interface Props {
  sources: KnowledgeSource[];
  onDelete: (id: string) => void;
}

const KnowledgeList: React.FC<Props> = ({ sources, onDelete }) => {
  if (sources.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        저장된 지식이 없습니다. 왼쪽 패널에서 데이터를 추가해주세요.
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mt-6 md:mt-0">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center justify-between">
        <span>📚 내 데이터베이스 ({sources.length})</span>
      </h2>
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {sources.map((source) => (
          <div key={source.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <span className={`inline-block px-2 py-1 text-xs font-semibold rounded mb-2 ${
                  source.type === SourceType.YOUTUBE ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {source.type === SourceType.YOUTUBE ? 'YouTube' : 'Blog'}
                </span>
                <h3 className="font-bold text-gray-800 leading-tight mb-1">{source.title}</h3>
                <p className="text-xs text-gray-500 mb-2">{source.date} • {source.chunks.length}개 조각(Chunks)</p>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                  원본 링크 열기
                </a>
              </div>
              <button 
                onClick={() => onDelete(source.id)}
                className="text-gray-400 hover:text-red-500 p-1"
                title="삭제"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeList;