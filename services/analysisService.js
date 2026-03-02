const { groq, MODELS } = require("../config/groqClient");

async function generateChartConfig(currentData) {
  try {
    const dataSample = currentData.slice(0, 50);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a data visualization expert. Analyze JSON data and generate a config for 1-3 charts.
          
          RULES:
          1. AGGREGATE DATA. Count frequencies or Sum values.
          2. Return ONLY valid JSON. Structure:
          {
            "summary": "Short description",
            "charts": [{ "type": "bar", "title": "X", "labels": [], "datasets": [{"label": "Y", "data": []}] }]
          }`
        },
        {
          role: "user",
          content: `Data: ${JSON.stringify(dataSample)}`
        }
      ],
      model: MODELS.ANALYSIS,
      temperature: 0.1,
    });

    const result = completion.choices[0].message.content.trim();

    // Cleanup helper for chart JSON
    function cleanJson(str) {
      const match = str.match(/\{[\s\S]*\}/);
      return match ? match[0] : str;
    }

    try {
      return JSON.parse(cleanJson(result));
    } catch (e) {
      throw new Error("Failed to parse chart configuration.");
    }
  } catch (error) {
    console.error("Error generating chart config:", error);
    throw error;
  }
}


module.exports = { generateChartConfig };
