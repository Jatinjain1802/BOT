const { Groq } = require("groq-sdk");

let groq;
try {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "dummy_key_to_prevent_crash_on_startup",
  });
} catch (error) {
  console.error("Groq initialization error:", error);
  groq = { chat: { completions: { create: async () => { throw new Error("Groq API Key missing"); } } } };
}

// Model Mapping for different tasks
const MODELS = {
  EXTRACTION: "meta-llama/llama-prompt-guard-2-22m", // Powerful for understanding documents
  ANALYSIS: "meta-llama/llama-prompt-guard-2-22m",    // Good reasoning for charts
  MODIFICATION: "meta-llama/llama-prompt-guard-2-22m", // Precise for structural JSON changes
  CHAT: "meta-llama/llama-prompt-guard-2-22m"            // Super fast and friendly for basic chat
};

module.exports = { groq, MODELS };

