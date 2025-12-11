import React, { useState, useEffect } from 'react';

function Admin() {
  const [activeTab, setActiveTab] = useState<'prompt' | 'upload' | 'database'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDefaultPrompt, setIsDefaultPrompt] = useState(true);
  
  // 업로드 폼
  const [uploadData, setUploadData] = useState({
    source: 'youtube',
    title: '',
    url: '',
    date: new Date().toISOString().split('T')[0],
    content: ''
  });

  const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://cheolsan-server.onrender.com';

  // 프롬프트 불러오기
  useEffect(() => {
    if (activeTab === 'prompt') {
      fetchPrompt();
    } else if (activeTab === 'database') {
      fetchDocuments();
    }
  }, [activeTab]);

  const fetchPrompt = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/prompt`);
      const data = await res.json();
      setPrompt(data.prompt);
      setIsDefaultPrompt(data.isDefault || false);
    } catch (error) {
      console.error('프롬프트 로드 실패:', error);
      alert('프롬프트 로드 실패: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const savePrompt = async () => {
    if (!prompt.trim()) {
      alert('프롬프트를 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      alert(data.message);
      setIsDefaultPrompt(false);
    } catch (error) {
      alert('저장 실패: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const resetPrompt = async () => {
    if (!confirm('기본 프롬프트로 초기화하시겠습니까?')) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/prompt`, {
        method: 'DELETE'
      });
      const data = await res.json();
      alert(data.message);
      setPrompt(data.defaultPrompt);
      setIsDefaultPrompt(true);
    } catch (error) {
      alert('초기화 실패: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/documents`);
      const data = await res.json();
      setDocuments(data.documents);
    } catch (error) {
      console.error('문서 로드 실패:', error);
      alert('문서 로드 실패: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async () => {
    if (!uploadData.content || !uploadData.title) {
      alert('제목과 내용을 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: uploadData.content,
          metadata: {
            title: uploadData.title,
            source: uploadData.source,
            url: uploadData.url,
            date: uploadData.date,
            type: uploadData.source === 'youtube' ? 'YouTube 영상' : '네이버 블로그'
          }
        })
      });
      const data = await res.json();
      alert(data.message);
      
      // 폼 초기화
      setUploadData({
        source: 'youtube',
        title: '',
        url: '',
        date: new Date().toISOString().split('T')[0],
        content: ''
      });
      
      // 문서 목록 새로고침
      if (activeTab === 'database') {
        fetchDocuments();
      }
    } catch (error) {
      alert('업로드 실패: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/documents/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      alert(data.message);
      fetchDocuments();
    } catch (error) {
      alert('삭제 실패: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-teal-600 text-white p-6 md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">🔧 철산랜드 RAG 관리자</h1>
              <p className="text-sm md:text-base opacity-90">프롬프트 관리 • 데이터 업로드 • 데이터베이스 관리</p>
            </div>
            <a 
              href="/" 
              className="bg-white text-purple-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 transition"
            >
              ← 챗봇으로
            </a>
          </div>
        </div>

        {/* 탭 메뉴 */}
        <div className="flex border-b bg-gray-50">
          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex-1 py-4 font-bold text-sm md:text-base transition ${
              activeTab === 'prompt' 
                ? 'bg-white text-purple-600 border-b-4 border-purple-600' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            📝 프롬프트
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-4 font-bold text-sm md:text-base transition ${
              activeTab === 'upload' 
                ? 'bg-white text-purple-600 border-b-4 border-purple-600' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            📤 업로드
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex-1 py-4 font-bold text-sm md:text-base transition ${
              activeTab === 'database' 
                ? 'bg-white text-purple-600 border-b-4 border-purple-600' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            🗄️ DB ({documents.length})
          </button>
        </div>

        {/* 콘텐츠 영역 */}
        <div className="p-4 md:p-8">
          
          {/* 프롬프트 관리 탭 */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              {isDefaultPrompt && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <p className="text-sm text-yellow-800">
                    ⚠️ 현재 <strong>기본 프롬프트</strong>를 사용 중입니다. 수정 후 저장하면 커스텀 프롬프트가 적용됩니다.
                  </p>
                </div>
              )}
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-gray-700">
                    시스템 프롬프트 {!isDefaultPrompt && <span className="text-green-600">✓ 커스텀</span>}
                  </label>
                  {!isDefaultPrompt && (
                    <button
                      onClick={resetPrompt}
                      className="text-sm text-red-600 hover:text-red-800 font-bold"
                    >
                      🔄 기본값으로 초기화
                    </button>
                  )}
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={20}
                  className="w-full p-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none font-mono text-sm"
                  placeholder="AI의 역할과 답변 방식을 정의하세요..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  💡 팁: 출처 표시 형식 [[1]], [[2]]을 반드시 포함하세요. 마크다운 사용을 권장하세요.
                </p>
              </div>
              <button
                onClick={savePrompt}
                disabled={loading}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition shadow-lg"
              >
                {loading ? '저장 중...' : '💾 프롬프트 저장 (챗봇에 즉시 적용)'}
              </button>
            </div>
          )}

          {/* 파일 업로드 탭 */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded mb-4">
                <p className="text-sm text-blue-800">
                  📌 최신 날짜의 문서가 우선적으로 사용됩니다. 같은 주제의 업데이트는 날짜를 최신으로 설정하세요.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">출처 타입</label>
                  <select
                    value={uploadData.source}
                    onChange={(e) => setUploadData({...uploadData, source: e.target.value})}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="youtube">📺 YouTube 영상</option>
                    <option value="blog">📝 네이버 블로그</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">작성 날짜 (최신순 우선)</label>
                  <input
                    type="date"
                    value={uploadData.date}
                    onChange={(e) => setUploadData({...uploadData, date: e.target.value})}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">제목</label>
                <input
                  type="text"
                  value={uploadData.title}
                  onChange={(e) => setUploadData({...uploadData, title: e.target.value})}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="예: 세부 여행 완벽 가이드 2025"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">URL (선택사항)</label>
                <input
                  type="url"
                  value={uploadData.url}
                  onChange={(e) => setUploadData({...uploadData, url: e.target.value})}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  내용 ({uploadData.content.length} 글자)
                </label>
                <textarea
                  value={uploadData.content}
                  onChange={(e) => setUploadData({...uploadData, content: e.target.value})}
                  rows={12}
                  className="w-full p-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none"
                  placeholder="문서의 전체 내용을 입력하세요...&#10;&#10;팁: YouTube 자막이나 블로그 전체 텍스트를 복사해서 붙여넣으세요."
                />
              </div>

              <button
                onClick={uploadDocument}
                disabled={loading || !uploadData.content || !uploadData.title}
                className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white py-4 rounded-lg font-bold text-lg hover:from-green-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg"
              >
                {loading ? '업로드 중...' : '📤 문서 업로드'}
              </button>
            </div>
          )}

          {/* 데이터베이스 탭 */}
          {activeTab === 'database' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">전체 문서: {documents.length}개</h2>
                  <p className="text-sm text-gray-600">최신순으로 정렬됨</p>
                </div>
                <button
                  onClick={fetchDocuments}
                  disabled={loading}
                  className="bg-gray-200 px-6 py-2 rounded-lg hover:bg-gray-300 font-bold disabled:opacity-50 transition"
                >
                  🔄 새로고침
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                  <p className="text-gray-500 mt-4">로딩 중...</p>
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-lg">📭 아직 업로드된 문서가 없습니다.</p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="mt-4 text-purple-600 font-bold hover:underline"
                  >
                    → 첫 문서 업로드하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {documents.map((doc, index) => (
                    <div key={doc.id} className="border-2 border-gray-200 rounded-lg p-4 hover:shadow-lg hover:border-purple-300 transition bg-white">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs bg-gray-200 px-2 py-1 rounded font-bold">#{index + 1}</span>
                            <h3 className="font-bold text-lg text-gray-800">{doc.title}</h3>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              📌 {doc.source}
                            </span>
                            <span className="flex items-center gap-1">
                              📅 {doc.date}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200">
                            {doc.contentPreview}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="text-red-600 hover:text-white hover:bg-red-600 font-bold px-4 py-2 rounded transition border-2 border-red-600"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default Admin;
