const { generateQueryPlan, explainQueryResult } = require("../services/ai.service");
const { executeQueryPlan } = require("../services/query.service");
const { mapDataToChart } = require("../services/chart.service");
const { getDataset, getActiveDatasetId } = require("../services/dataset.service");

/**
 * Node.js Conversational Analytics Controller
 * -------------------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. AI Orchestration Pipeline: We separate the reasoning layer (LLM) from the database execution layer (SQL).
 *    This ensures calculations are exact (100% correct SQL averages/sums) rather than LLM-guessed values.
 * 2. Conversational State Management: In-memory dictionary `chatHistories` maps session IDs to message logs.
 *    Each message log records roles (`user`, `assistant`) to maintain context over follow-up questions.
 * 3. Error Recovery: If the AI generates an invalid plan or SQLite queries fail (e.g. type mismatch),
 *    the controller handles the error gracefully, giving clear feedback rather than server crashes.
 */

// In-memory chat history map
// Format: { [sessionId]: [{ role: 'user' | 'assistant', content: '...' }] }
const chatHistories = {};

/**
 * Main conversational endpoint handling user queries
 */
async function handleChat(req, res) {
  const sessionId = req.headers["x-session-id"] || "default_session";
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ success: false, error: "No question or command was provided." });
  }

  // Retrieve session chat history (default to empty list if new session)
  if (!chatHistories[sessionId]) {
    chatHistories[sessionId] = [];
  }
  const history = chatHistories[sessionId];

  // Retrieve active dataset for current session
  const datasetId = getActiveDatasetId(sessionId);

  console.log(`[ChatController] Input: "${command}" (Session: ${sessionId}, Active Dataset: ${datasetId})`);

  try {
    // Check if there is a dataset uploaded. If not, queries must be strictly conversational.
    if (!datasetId) {
      // Direct greeting / fallback call without dataset context
      const fallbackPromptPlan = {
        operation: "conversational",
        explanation: "Hello! I am your AI Data Assistant. To start analyzing spreadsheets, please upload a CSV or Excel file first in the dashboard drop zone."
      };
      
      // Let's call the LLM directly for general chat since no data is present
      const conversationalAnswer = await generateGeneralResponse(command, history);
      
      history.push({ role: "user", content: command });
      history.push({ role: "assistant", content: conversationalAnswer });
      
      return res.json({
        success: true,
        operation: "conversational",
        message: conversationalAnswer
      });
    }

    const dataset = getDataset(datasetId);
    if (!dataset || !fsExists(dataset.dbPath)) {
      return res.status(400).json({
        success: false,
        error: "Active dataset database file is missing or has expired. Please re-upload your file."
      });
    }

    // Step 1: LLM reasoning - Convert prompt to Structured Query Plan
    console.log(`[ChatController] Generating Structured Query Plan from LLM...`);
    const plan = await generateQueryPlan(command, dataset.profile, history);
    console.log(`[ChatController] Structured Plan Received:`, JSON.stringify(plan, null, 2));

    // Handle conversational operation
    if (plan.operation === "conversational") {
      const responseText = plan.explanation || "No answer provided.";
      
      history.push({ role: "user", content: command });
      history.push({ role: "assistant", content: responseText });

      return res.json({
        success: true,
        operation: "conversational",
        message: responseText
      });
    }

    // Step 2: Database calculation - Run plan against SQLite
    console.log(`[ChatController] Executing query plan against SQLite...`);
    let queryResult;
    try {
      queryResult = await executeQueryPlan(dataset.dbPath, plan, dataset.columns);
    } catch (dbErr) {
      console.warn(`[ChatController] Query execution failed:`, dbErr.message);
      return res.json({
        success: false,
        error: `I attempted to calculate the answer by running a database query, but ran into an issue: ${dbErr.message}. Feel free to rephrase your question.`
      });
    }

    // Step 3: Visualization mapping - Map rows to Chart.js specification
    console.log(`[ChatController] Generating chart specification...`);
    const chartConfig = mapDataToChart(queryResult, plan, dataset.profile.profiles);

    // Step 4: LLM Explanation - Summarize numbers in natural language
    console.log(`[ChatController] Generating natural-language insights...`);
    const explanationText = await explainQueryResult(command, queryResult, plan, history);

    // Update session history
    history.push({ role: "user", content: command });
    history.push({ role: "assistant", content: explanationText });

    // Enforce sliding window on chat history (retain last 10 messages max to stay within token budgets)
    if (history.length > 10) {
      chatHistories[sessionId] = history.slice(-10);
    }

    return res.json({
      success: true,
      operation: plan.operation,
      queryPlan: plan,
      message: explanationText,
      chart: chartConfig,
      dataPreview: queryResult.slice(0, 100), // Send first 100 rows for frontend table preview
      totalRows: queryResult.length
    });

  } catch (error) {
    console.error(`[ChatController] Chat handler failure:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred during chat processing."
    });
  }
}

/**
 * Clears chat history for a session
 */
async function clearSessionChat(req, res) {
  const sessionId = req.headers["x-session-id"] || "default_session";
  chatHistories[sessionId] = [];
  return res.json({ success: true, message: "Chat history cleared." });
}

/**
 * Helper to call Groq for generic conversational requests when no dataset is present.
 */
async function generateGeneralResponse(prompt, history = []) {
  const messages = [
    { role: "system", content: "You are a helpful AI data analytics assistant. Be polite, friendly, and explain that users should upload spreadsheets in the drop area to analyze them." },
    ...history.slice(-4),
    { role: "user", content: prompt }
  ];

  try {
    const response = await require("../config/groqClient").groq.chat.completions.create({
      model: MODELS.CHAT,
      messages,
      temperature: 0.7,
      max_tokens: 250
    });
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    return "Hello! Please upload a CSV or Excel file to get started with analysis.";
  }
}

// Simple sync file checking helper
function fsExists(filePath) {
  try {
    return require("fs").existsSync(filePath);
  } catch (_) {
    return false;
  }
}

module.exports = {
  handleChat,
  clearSessionChat
};
