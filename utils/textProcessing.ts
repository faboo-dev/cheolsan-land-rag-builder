import { ContentChunk } from '../types';

/**
 * Splits text into chunks with overlap to maintain context.
 * Updated: Increased default chunkSize to 2000 to capture full context and timestamps.
 */
export const smartChunking = (
  text: string, 
  parentId: string, 
  chunkSize: number = 2000, // 500 -> 2000 (4x larger context)
  overlap: number = 200     // 100 -> 200 (More overlap for safety)
): ContentChunk[] => {
  const chunks: ContentChunk[] = [];
  
  // Normalize text slightly
  const cleanText = text.replace(/\r\n/g, '\n').trim();
  
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + chunkSize;
    
    // If we are not at the end of the text, try to find a natural break (period, newline)
    // instead of cutting a word in half.
    if (endIndex < cleanText.length) {
      const lookAhead = cleanText.substring(startIndex, endIndex + 100); // Look further
      const lastPeriod = lookAhead.lastIndexOf('.');
      const lastNewLine = lookAhead.lastIndexOf('\n');
      
      let splitPoint = Math.max(lastPeriod, lastNewLine);
      
      if (splitPoint !== -1 && (startIndex + splitPoint) > startIndex) {
        endIndex = startIndex + splitPoint + 1;
      }
    }

    const chunkText = cleanText.substring(startIndex, endIndex).trim();
    
    if (chunkText.length > 0) {
      chunks.push({
        id: `${parentId}_${Date.now()}_${chunks.length}`,
        parentId,
        text: chunkText,
      });
    }

    // Move the start index forward, subtracting the overlap
    startIndex = endIndex - overlap;
    
    // Safety break
    if (startIndex >= cleanText.length || (endIndex - overlap) <= startIndex) {
       if(endIndex === cleanText.length) break;
       startIndex = endIndex; 
    }
  }

  return chunks;
};

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};