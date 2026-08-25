const { groq, MODELS, rateLimiter } = require("../config/groqClient");

/**
 * Node.js AI Service
 * ------------------
 * LEARN THE TECHNOLOGY:
 * 1. Structured Outputs: LLMs are naturally conversational, but they can be trained to output structured
 *    data (like JSON) by using strict system prompts, example schemas, and temperature = 0.
 * 2. Conversational Context (History): LLMs have no memory of past requests. To support follow-up questions
 *    like "Compare it with last year", we must send previous chat turns (user questions + assistant replies)
 *    along with the new request so the LLM can resolve references like "it" or "that region".
 * 3. Grounded Explanations: To prevent LLM hallucinations (making up statistics), we only send the *actual*
 *    query result table back to the LLM and prompt it to write summaries using *only* these numbers.
 */

/**
 * Clean LLM string response to extract valid JSON blocks.
 */
function extractJsonBlock(str) {
  if (!str) return null;
  // Try matching markdown json fences ```json ... ``` or standard bracket limits
  const jsonMatch = str.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return str;
}

/**
 * Converts user question + schema profile + chat history into a Structured Query Plan.
 * @param {string} question - Current natural-language question
 * @param {Object} schemaMetadata - Profile metadata containing column list and statistics
 * @param {Array<Object>} chatHistory - Previous chat turns: [{ role: 'user'|'assistant', content: '...' }]
 * @returns {Promise<Object>} Structured Query Plan JSON
 */
async function generateQueryPlan(question, schemaMetadata, chatHistory = []) {
  const schemaSummary = {
    rowCount: schemaMetadata.rowCount,
    columnCount: schemaMetadata.columnCount,
    columns: schemaMetadata.columns,
    profiles: Object.keys(schemaMetadata.profiles).reduce((acc, col) => {
      const p = schemaMetadata.profiles[col];
      acc[col] = {
        type: p.type,
        distinctCount: p.distinctCount,
        nullPercentage: p.nullPercentage,
        min: p.min,
        max: p.max,
        mean: p.mean
      };
      if (p.isCategorical && p.distribution) {
        acc[col].sampleValues = p.distribution.map(d => d.category);
      }
      return acc;
    }, {})
  };

  const systemMessage = `You are a data platform query planner.
Analyze the user's natural language question about the dataset and convert it into a JSON Structured Query Plan.
You MUST refer ONLY to the columns and data types in the provided schema.

DATABASE SCHEMA DETAILS:
${JSON.stringify(schemaSummary, null, 2)}

OUTPUT SCHEMA FORMATS:

For aggregations/summarizations (e.g. sum, count, average grouped by categories or dates), return:
{
  "operation": "group_by",
  "dimension": "category_or_date_column_name",
  "metric": "numeric_column_name_to_aggregate",
  "aggregation": "sum" | "avg" | "count" | "min" | "max",
  "filters": [
    { "column": "column_name", "operator": "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN", "value": "value" }
  ],
  "sort": "desc" | "asc",
  "limit": 10
}

For raw listing / details of rows, return:
{
  "operation": "select",
  "sortColumn": "column_name_to_sort_by",
  "sort": "desc" | "asc",
  "filters": [],
  "limit": 100
}

If the user's request is a conversational greeting, general question, or doesn't query the dataset directly, return:
{
  "operation": "conversational",
  "explanation": "Write a helpful, friendly message answering the greeting or general instruction directly here."
}

RULES:
1. Return ONLY the raw JSON plan. Do NOT wrap it in markdown block, do NOT write explanations outside the JSON.
2. Verify every column name in your plan matches the columns list. Do NOT invent columns.
3. For filter operators, stick strictly to: "=", "!=", ">", "<", ">=", "<=", "LIKE", "IN".
4. If the user refers to past questions (e.g., "compare it to...", "what about region X?", "show details of that"), resolve it using the provided Chat History.`;

  // Build message list including context history
  const messages = [
    { role: "system", content: systemMessage },
    ...chatHistory.slice(-8), // Send last 8 turns of context to save tokens and respect rate limits
    { role: "user", content: `Question: "${question}"` }
  ];

  const estimatedTokens = rateLimiter.estimateTokens(JSON.stringify(messages));
  await rateLimiter.waitIfNeeded(estimatedTokens);

  try {
    const response = await groq.chat.completions.create({
      model: MODELS.ANALYSIS,
      messages,
      temperature: 0.0, // Low temperature for highly structured schema results
      max_tokens: 400
    });

    rateLimiter.recordUsage(estimatedTokens + 100);
    const content = response.choices[0]?.message?.content?.trim();
    const cleaned = extractJsonBlock(content);

    try {
      return JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[AIService] Failed to parse query plan JSON from:", content);
      throw new Error("Could not parse Structured Query Plan generated by the AI.");
    }
  } catch (err) {
    console.error("[AIService] Error generating query plan:", err.message);
    throw err;
  }
}

/**
 * Explains query results in natural language.
 * @param {string} question - Original user question
 * @param {Array<Object>} queryResult - Data rows returned by SQLite
 * @param {Object} queryPlan - The Structured Query Plan that was executed
 * @param {Array<Object>} chatHistory - Conversational history
 * @returns {Promise<string>} Analytical summary text
 */
async function explainQueryResult(question, queryResult, queryPlan, chatHistory = []) {
  // Truncate result data sample to avoid token budget limits
  const dataSample = queryResult.slice(0, 30);
  const totalRowsResult = queryResult.length;

  const systemMessage = `You are a professional business intelligence analyst.
Review the user's question, the database query plan that was executed, and the resulting data table.
Provide a clear, natural-language explanation of findings.

CONSTRAINTS:
1. Every statistical or numerical statement you make MUST be directly sourced from the provided result data. Do NOT invent numbers.
2. Highlight key trends, maximum/minimum values, percentage increases/decreases, and anomalies.
3. Be concise and write in a friendly, conversational executive-summary style using clean markdown (bold, bullet points).
4. If the results are empty, explain that no records matched the filters.
5. Limit explanations to 2-3 paragraphs. Include actionable observations if relevant.`;

  const userMessage = `User Question: "${question}"
Query Plan Executed: ${JSON.stringify(queryPlan)}
Total Rows Found in Database: ${totalRowsResult}
Result Data (showing first 30 rows max):
${JSON.stringify(dataSample, null, 2)}`;

  const messages = [
    { role: "system", content: systemMessage },
    ...chatHistory.slice(-6),
    { role: "user", content: userMessage }
  ];

  const estimatedTokens = rateLimiter.estimateTokens(JSON.stringify(messages));
  await rateLimiter.waitIfNeeded(estimatedTokens);

  try {
    const response = await groq.chat.completions.create({
      model: MODELS.CHAT,
      messages,
      temperature: 0.4,
      max_tokens: 500
    });

    rateLimiter.recordUsage(estimatedTokens + 150);
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("[AIService] Error generating query explanation:", err.message);
    return `Calculated result: found ${totalRowsResult} matching records. Unfortunately, the AI could not generate an analytical explanation due to API rates or timeouts. You can inspect the table and chart below.`;
  }
}

module.exports = {
  generateQueryPlan,
  explainQueryResult
};
