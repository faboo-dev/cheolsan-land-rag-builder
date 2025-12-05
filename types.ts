
export enum SourceType {
  YOUTUBE = 'YOUTUBE',
  BLOG = 'BLOG',
}

export interface ContentChunk {
  id: string;
  text: string;
  parentId: string;
  startTime?: string; // For YouTube (e.g., "02:30")
  embedding?: number[];
}

export interface KnowledgeSource {
  id: string;
  type: SourceType;
  title: string;
  url: string;
  date: string; // ISO Date string
  originalContent: string;
  chunks: ContentChunk[];
  processed: boolean;
}

// New: RAG 검색 정확도 진단을 위한 타입
export interface DebugSnippet {
  score: number;       // 유사도 점수 (0~1)
  text: string;        // 매칭된 텍스트 조각
  sourceTitle: string; // 출처 제목
}

export interface ChatMessage {
  role: 'user' | 'model';
  text?: string; // Fallback or simple text
  
  // New structured response fields
  ragAnswer?: string;       // 1. 내 데이터베이스 답변
  webAnswer?: string;       // 2. 최신 웹 검색 답변
  comparisonAnswer?: string; // 3. 크로스 체크 답변
  
  sources?: { title: string; url: string; date: string }[];
  webSources?: { title: string; url: string }[]; // Links from Google Search
  
  // New: 진단 데이터
  debugSnippets?: DebugSnippet[]; 
}

export interface AppState {
  apiKey: string;
  sources: KnowledgeSource[];
  chatHistory: ChatMessage[];
}
