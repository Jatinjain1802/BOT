const { groq, MODELS, rateLimiter } = require("../config/groqClient");

/**
 * Prompt Guard Security Service
 * -----------------------------
 * Uses Meta's `meta-llama/llama-prompt-guard-2-86m` model to evaluate user input
 * and extracted file text for security threats such as:
 * - Direct Prompt Injections (override system instructions)
 * - Indirect Prompt Injections (malicious payloads inside uploaded files)
 * - Jailbreak attempts
 * 
 * Educational Note (Node.js & AI Security):
 * Running prompt security checks before feeding untrusted user input into LLMs 
 * protects downstream data processing pipelines from jailbreaks and prompt hijacking.
 */

/**
 * Checks text using Prompt Guard 2 86M
 * @param {string} text - User prompt or document content chunk
 * @returns {Promise<{ isSafe: boolean, score?: string, reason?: string }>}
 */
async function checkPromptSafety(text) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { isSafe: true };
  }

  try {
    const estimatedTokens = rateLimiter.estimateTokens(text);
    
    // Enforce 30 RPM & 15K TPM limits before making the call
    await rateLimiter.waitIfNeeded(estimatedTokens);

    const response = await groq.chat.completions.create({
      model: MODELS.PROMPT_GUARD,
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.0,
      max_tokens: 10,
    });

    rateLimiter.recordUsage(estimatedTokens + 10);

    const output = response.choices[0]?.message?.content?.trim() || "";
    
    // Prompt Guard 2 usually classifies input as 'safe', 'unsafe', or gives a security label
    const isUnsafe = output.toLowerCase().includes("unsafe") || 
                     output.toLowerCase().includes("injection") || 
                     output.toLowerCase().includes("jailbreak");

    if (isUnsafe) {
      return {
        isSafe: false,
        score: output,
        reason: "Security Alert: Input was flagged by Prompt Guard 2 (86M) as potentially unsafe.",
      };
    }

    return {
      isSafe: true,
      score: output,
    };
  } catch (error) {
    console.warn("[PromptGuard] Security check warning/bypassed:", error.message);
    // Fallback: If Prompt Guard model call errors out (e.g. rate limit retry or API missing endpoint), allow graceful fallback with a warning
    return { isSafe: true, warning: error.message };
  }
}

module.exports = { checkPromptSafety };
