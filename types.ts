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

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: { title: string; url: string; date: string }[];
}

export interface AppState {
  apiKey: string;
  sources: KnowledgeSource[];
  chatHistory: ChatMessage[];
}