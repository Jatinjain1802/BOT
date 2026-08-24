const { rateLimiter } = require("../config/groqClient");

/**
 * File Chunking & Batch Processing Service
 * ----------------------------------------
 * Educational Overview:
 * When processing large files (multi-page PDFs or multi-thousand row Excel spreadsheets),
 * sending the entire document content in a single LLM request can exceed:
 * 1. Context Window limits (token limit per request).
 * 2. Token Per Minute (TPM) limits (15,000 tokens/min for Prompt Guard 2 / Groq).
 * 3. Request Per Minute (RPM) limits (30 requests/min).
 * 
 * This service provides intelligent text and array chunking algorithms that divide
 * heavy workloads into safe, manageable chunks, and processes them sequentially with
 * rate-limited delays.
 */

/**
 * Splits raw document text into readable chunks based on character/token boundaries.
 * @param {string} text - Raw document text
 * @param {number} maxCharsPerChunk - Maximum characters per chunk (~6000 chars ≈ 1500 tokens)
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, maxCharsPerChunk = 6000) {
  if (!text || typeof text !== "string") return [];
  if (text.length <= maxCharsPerChunk) return [text];

  const chunks = [];
  // Split by double line breaks (paragraphs) first to maintain semantic context
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if ((currentChunk + "\n\n" + paragraph).length <= maxCharsPerChunk) {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      // If a single paragraph itself is larger than maxCharsPerChunk, split by lines
      if (paragraph.length > maxCharsPerChunk) {
        const lines = paragraph.split(/\n/);
        currentChunk = "";
        for (const line of lines) {
          if ((currentChunk + "\n" + line).length <= maxCharsPerChunk) {
            currentChunk += (currentChunk ? "\n" : "") + line;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            // Hard boundary fallback if a single line is too huge
            currentChunk = line.length > maxCharsPerChunk ? line.slice(0, maxCharsPerChunk) : line;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Splits an array of objects/rows into smaller array chunks.
 * @param {Array} array - Dataset array
 * @param {number} chunkSize - Number of items per chunk (default 150 rows)
 * @returns {Array[]} Array of chunked arrays
 */
function chunkArray(array, chunkSize = 150) {
  if (!Array.isArray(array)) return [];
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Orchestrates batch processing of chunks with rate-limited delays to respect
 * 30 RPM and 15,000 TPM limits.
 * 
 * @param {Array} chunks - List of text chunks or data arrays
 * @param {Function} asyncProcessorFn - Async function to process an individual chunk
 * @param {Function} [onProgress] - Optional callback function to report progress
 * @returns {Promise<Array>} Combined results from all chunks
 */
async function processChunksWithRateLimit(chunks, asyncProcessorFn, onProgress = null) {
  let combinedResults = [];
  const totalChunks = chunks.length;

  for (let index = 0; index < totalChunks; index++) {
    const chunk = chunks[index];
    
    // Estimate token usage for rate limiting
    const chunkTextStr = typeof chunk === "string" ? chunk : JSON.stringify(chunk);
    const estimatedTokens = rateLimiter.estimateTokens(chunkTextStr);

    console.log(`[ChunkingService] Processing chunk ${index + 1}/${totalChunks} (~${estimatedTokens} tokens)...`);

    // Enforce 30 RPM & 15K TPM wait if needed
    await rateLimiter.waitIfNeeded(estimatedTokens);

    try {
      const result = await asyncProcessorFn(chunk, index, totalChunks);
      
      rateLimiter.recordUsage(estimatedTokens);

      if (Array.isArray(result)) {
        combinedResults = combinedResults.concat(result);
      } else if (result && typeof result === "object") {
        combinedResults.push(result);
      }

      if (typeof onProgress === "function") {
        onProgress({
          completedChunks: index + 1,
          totalChunks,
          percent: Math.round(((index + 1) / totalChunks) * 100),
        });
      }
    } catch (chunkError) {
      console.error(`[ChunkingService] Error processing chunk ${index + 1}:`, chunkError.message);
      // Continue processing remaining chunks rather than crashing entire file upload
    }
  }

  return combinedResults;
}

module.exports = {
  chunkText,
  chunkArray,
  processChunksWithRateLimit,
};
