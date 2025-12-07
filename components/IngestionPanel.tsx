
import React, { useState } from 'react';
import { SourceType } from '../types';
import { smartChunking } from '../utils/textProcessing';
import { GeminiService } from '../services/gemini';
import { supabase } from '../services/supabase';

interface Props {
  onAddSource: () => void; // Callback to refresh list
  geminiService: GeminiService;
}

const IngestionPanel: React.FC<Props> = ({ onAddSource, geminiService }) => {
  const [type, setType] = useState<SourceType>(SourceType.BLOG);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [date, setDate] = useState('');
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert("본문 내용을 입력해주세요.");
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const sourceId = `source_${Date.now()}`;
      
      // 1. Chunking
      const chunks = smartChunking(content, sourceId);
      
      // 2. Embedding & Insert to Supabase
      const rowsToInsert = [];
      
      for (let i = 0; i < chunks.length; i++) {
        try {
            const vector = await geminiService.generateEmbedding(chunks[i].text);
            
            // Prepare row for Supabase
            rowsToInsert.push({
              content: chunks[i].text,
              embedding: vector,
              metadata: {
                sourceId,
                title,
                url,
                date,
                type,
                chunkIndex: i
              }
            });

        } catch (err) {
            console.error(`Failed to embed chunk ${i}`, err);
        }
        setProgress(Math.round(((i + 1) / chunks.length) * 90));
      }

      // Batch insert to Supabase
      const { error } = await supabase.from('documents').insert(rowsToInsert);

      if (error) {
        throw error;
      }

      setProgress(100);
      onAddSource(); // Refresh list
      
      // Reset form
      setTitle('');
      setUrl('');
      setDate('');
      setContent('');
      setProgress(0);
      alert("수파베이스(클라우드)에 성공적으로 저장되었습니다!");

    } catch (error) {
      console.error(error);
      alert("처리 중 오류가 발생했습니다. Supabase 설정을 확인해주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
        <svg className="w-6 h-6 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        새로운 지식 추가 (수파베이스 DB)
      </h2>
      
      <div className="mb-4 bg-blue-50 p-4 rounded text-sm text-blue-800">
        <p className="font-semibold">💡 크롤링 가이드 (수동 입력)</p>
        <p>저장된 데이터는 수파베이스 클라우드에 영구 보관됩니다.</p>
        <ul className="list-disc ml-5 mt-1 text-blue-700">
          <li><strong>블로그:</strong> 본문 전체를 복사해서 붙여넣으세요.</li>
          <li><strong>유튜브(중요):</strong> 자막 스크립트를 복사할 때 <strong>시간 정보(예: 01:30)가 포함된 텍스트</strong>를 붙여넣으면, AI가 답변할 때 몇 분 몇 초인지 알려줄 수 있습니다.</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">콘텐츠 타입</label>
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value as SourceType)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 p-2 border"
            >
              <option value={SourceType.BLOG}>네이버 블로그</option>
              <option value={SourceType.YOUTUBE}>유튜브 영상</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">발행 날짜 (중요!)</label>
            <input 
              type="date" 
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring p-2 border"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">제목</label>
          <input 
            type="text" 
            required
            placeholder="예: 오사카 3박 4일 맛집 총정리"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring p-2 border"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">원본 URL (출처 표기용)</label>
          <input 
            type="url" 
            required
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring p-2 border"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">본문 내용 / 스크립트</label>
          <textarea 
            required
            rows={8}
            placeholder="유튜브 팁: '00:10 안녕하세요' 처럼 시간이 포함된 자막을 붙여넣으면 더 정확합니다."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring p-2 border"
          ></textarea>
        </div>

        <button 
          type="submit" 
          disabled={isProcessing}
          className={`w-full py-3 px-4 rounded-md shadow text-white font-bold transition-colors ${
            isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary hover:bg-secondary'
          }`}
        >
          {isProcessing ? `처리 및 저장 중... (${progress}%)` : '이 지식 수파베이스에 저장하기'}
        </button>
      </form>
    </div>
  );
};

export default IngestionPanel;
