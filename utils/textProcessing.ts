import { ContentChunk } from '../types';

/**
 * Splits text into chunks with overlap to maintain context.
 * This addresses the user's concern about "cutting too finely and losing context".
 */
export const smartChunking = (
  text: string, 
  parentId: string, 
  chunkSize: number = 500, 
  overlap: number = 100
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
      const lookAhead = cleanText.substring(startIndex, endIndex + 50); // Look a bit further for a sentence end
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
    
    // Safety break to prevent infinite loops if something goes wrong
    if (startIndex >= cleanText.length || (endIndex - overlap) <= startIndex) {
       // If progress isn't made, force move
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