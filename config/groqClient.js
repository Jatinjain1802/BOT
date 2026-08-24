const { Groq } = require("groq-sdk");

/**
 * Node.js & Groq SDK Configuration
 * --------------------------------
 * This module initializes the Groq client and defines the model mappings
 * and rate-limiting rules.
 *
 * Prompt Guard 2 86M Limits (as specified):
 * - Requests: 30 / minute (requires >= 2000ms interval between calls)
 * - Tokens: 15,000 / minute (requires sliding window token tracking)
 * - Daily: 14.4K requests / day, 500K tokens / day
 */

let groq;
try {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "dummy_key_to_prevent_crash_on_startup",
  });
} catch (error) {
  console.error("Groq initialization error:", error);
  groq = {
    chat: {
      completions: {
        create: async () => {
          throw new Error("GROQ_API_KEY is missing in environment variables.");
        },
      },
    },
  };
}

// Model Mapping for different tasks in the application
const MODELS = {
  PROMPT_GUARD: "meta-llama/llama-prompt-guard-2-86m", // Meta Prompt Guard 2 (86M) for input safety checks (512 token max)
  EXTRACTION: process.env.GROQ_LLM_MODEL || "qwen/qwen3.6-27b", // Structured JSON extraction model (128K context window)
  ANALYSIS: process.env.GROQ_LLM_MODEL || "qwen/qwen3.6-27b", // Data analysis & chart generation (128K context window)
  MODIFICATION: process.env.GROQ_LLM_MODEL || "qwen/qwen3.6-27b", // Precise JSON structural modification (128K context window)
  CHAT: process.env.GROQ_LLM_MODEL || "qwen/qwen3.6-27b", // Fast chat responses (128K context window)
};

/**
 * RateLimiter Queue Class
 * -----------------------
 * JavaScript Async Queue to satisfy 30 Requests/min & 15,000 Tokens/min limits.
 * Uses a token-bucket / delayed execution queue pattern in Node.js.
 */
class RateLimiter {
  constructor(maxRpm = 30, maxTpm = 15000) {
    this.maxRpm = maxRpm;
    this.maxTpm = maxTpm;
    this.minDelayMs = Math.ceil(60000 / maxRpm); // ~2000ms delay between calls
    this.lastCallTimestamp = 0;
    this.tokenUsageHistory = []; // Tracks { timestamp, tokenCount }
  }

  /**
   * Estimates tokens from string length (~4 chars per token)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Cleans token history older than 60 seconds
   */
  cleanHistory() {
    const now = Date.now();
    this.tokenUsageHistory = this.tokenUsageHistory.filter(
      (entry) => now - entry.timestamp < 60000,
    );
  }

  /**
   * Returns current tokens used in the last 60 seconds
   */
  getCurrentTokensInWindow() {
    this.cleanHistory();
    return this.tokenUsageHistory.reduce(
      (sum, entry) => sum + entry.tokenCount,
      0,
    );
  }

  /**
   * Enforces delay before executing next API request
   */
  async waitIfNeeded(estimatedTokens = 500) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTimestamp;

    // 1. Throttle requests to respect 30 RPM (min ~2000ms between requests)
    if (timeSinceLastCall < this.minDelayMs) {
      const waitMs = this.minDelayMs - timeSinceLastCall;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    // 2. Throttle if token usage in last 60s exceeds 15K TPM
    while (this.getCurrentTokensInWindow() + estimatedTokens > this.maxTpm) {
      console.log(
        `[RateLimiter] Approaching TPM limit (15K/min). Pausing 2 seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    this.lastCallTimestamp = Date.now();
  }

  /**
   * Records completed token usage for rate calculation
   */
  recordUsage(tokenCount) {
    this.tokenUsageHistory.push({
      timestamp: Date.now(),
      tokenCount: tokenCount || 500,
    });
  }
}

const rateLimiter = new RateLimiter(30, 15000);

module.exports = { groq, MODELS, rateLimiter };
