import React from 'react';
import RAGChat from './components/RAGChat';
import { GeminiService } from './services/gemini';
import './App.css';

function App() {
  // Gemini 서비스 초기화
  const geminiService = new GeminiService(
    import.meta.env.VITE_GEMINI_API_KEY || ''
  );

  const systemInstruction = `당신은 철산랜드의 친절한 AI 어시스턴트입니다.

**답변 규칙:**
1. 정보를 언급할 때 반드시 [[1]], [[2]] 형식으로 출처번호를 표시하세요.
2. 모든 제목에 관련 이모지를 추가하세요 (예: ## 🏰 제목)
3. 마크다운 문법을 사용하세요 (표, 리스트, 링크 등)
4. 정확하고 구체적으로 답변하세요.
5. 모르는 내용은 솔직히 모른다고 말하세요.`;

  return (
    <div className="App">
      <RAGChat 
        geminiService={geminiService}
        sources={[]}
        systemInstruction={systemInstruction}
        isEmbed={false}
      />
    </div>
  );
}

export default App;
