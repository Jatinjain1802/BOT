const { groq, MODELS, rateLimiter } = require("../config/groqClient");

/**
 * Data Visualization & Analysis Service
 * -------------------------------------
 * Educational Overview:
 * Analyzes structured JSON datasets to generate Chart.js configurations.
 * Uses rate limiting to prevent token budget overruns and respects 30 RPM / 15K TPM limits.
 */

async function generateChartConfig(currentData) {
  if (!Array.isArray(currentData) || currentData.length === 0) {
    throw new Error("No data available for chart analysis.");
  }

  try {
    // Take a representative sample of 25 rows to stay well under token limits
    const dataSample = currentData.slice(0, 25);
    const sampleText = JSON.stringify(dataSample);
    const estimatedTokens = rateLimiter.estimateTokens(sampleText);

    // Enforce 30 RPM & 15K TPM rate limiting delay
    await rateLimiter.waitIfNeeded(estimatedTokens);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a data visualization expert. Analyze JSON data and generate a config for 1-3 charts.
          
          RULES:
          1. AGGREGATE DATA. Count frequencies or Sum numeric values.
          2. Return ONLY valid JSON object with format:
          {
            "summary": "Short analytical description of the dataset",
            "charts": [{ "type": "bar", "title": "Chart Title", "labels": ["A", "B"], "datasets": [{"label": "Metric", "data": [10, 20]}] }]
          }`,
        },
        {
          role: "user",
          content: `Data sample: ${sampleText}`,
        },
      ],
      model: MODELS.ANALYSIS,
      temperature: 0.1,
    });

    rateLimiter.recordUsage(estimatedTokens + 400);

    const result = completion.choices[0].message.content.trim();

    function cleanJson(str) {
      const match = str.match(/\{[\s\S]*\}/);
      return match ? match[0] : str;
    }

    try {
      return JSON.parse(cleanJson(result));
    } catch (e) {
      throw new Error("Could not parse chart config from AI response.");
    }
  } catch (error) {
    console.warn("[AnalysisService] AI analysis warning, generating fallback chart:", error.message);
    
    // Fallback chart generation if Groq call fails or key is missing
    const keys = Object.keys(currentData[0] || {});
    const labelKey = keys.find(k => typeof currentData[0][k] === 'string') || keys[0] || 'Item';
    const valueKey = keys.find(k => typeof currentData[0][k] === 'number') || keys[1] || keys[0];

    const sample = currentData.slice(0, 10);
    const labels = sample.map((item, idx) => String(item[labelKey] || `Row ${idx + 1}`));
    const dataVals = sample.map(item => typeof item[valueKey] === 'number' ? item[valueKey] : 1);

    return {
      summary: `Analyzed ${currentData.length} records in total. Showing distribution by ${labelKey}.`,
      charts: [
        {
          type: "bar",
          title: `Data Overview by ${labelKey}`,
          labels,
          datasets: [
            {
              label: valueKey,
              data: dataVals,
            },
          ],
        },
      ],
    };
  }
}

module.exports = { generateChartConfig };

