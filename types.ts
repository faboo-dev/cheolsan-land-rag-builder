
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

// RAG 검색 정확도 진단을 위한 타입
export interface DebugSnippet {
  score: number;       // 유사도 점수 (0~1)
  text: string;        // 매칭된 텍스트 조각
  sourceTitle: string; // 출처 제목
}

export interface ChatMessage {
  role: 'user' | 'model';
  text?: string; // 통합된 답변 텍스트
  
  sources?: { title: string; url: string; date: string }[];
  webSources?: { title: string; url: string }[]; 
  
  // 진단 데이터
  debugSnippets?: DebugSnippet[]; 
}

export interface AppState {
  apiKey: string;
  sources: KnowledgeSource[];
  chatHistory: ChatMessage[];
}
