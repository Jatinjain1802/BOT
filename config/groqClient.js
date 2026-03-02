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
  EXTRACTION: "llama-3.3-70b-versatile", // Powerful for understanding documents
  ANALYSIS: "llama-3.3-70b-versatile",    // Good reasoning for charts
  MODIFICATION: "llama-3.3-70b-versatile", // Precise for structural JSON changes
  CHAT: "llama-3.1-8b-instant"            // Super fast and friendly for basic chat
};

module.exports = { groq, MODELS };

