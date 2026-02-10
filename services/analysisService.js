const { groq } = require("../config/groqClient");

async function generateChartConfig(currentData) {
  try {
    // Limit data to first 50 rows for analysis to avoid token limits
    const dataSample = currentData.slice(0, 50);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a data visualization expert. Analyze the provided JSON data and generate a configuration for 1 to 3 charts that best visualize the key insights.
          
          CRITICAL: Do not just plot raw rows. You MUST AGGREGATE the data.
          - For categorical data: Count frequencies or Sum values by category.
          - For time-series: Group by Day/Month/Year.
          - Limit categorical charts to the Top 10 items (group others as "Others").
          
          The output must be a valid JSON object with the following structure:
          {
            "summary": "A brief 1-2 sentence description of what these charts show.",
            "charts": [
              {
                "type": "bar" | "line" | "pie" | "doughnut",
                "title": "Chart Title (e.g. 'Expenses by Category')",
                "labels": ["Category A", "Category B", ...],
                "datasets": [
                  {
                    "label": "Dataset Label",
                    "data": [1500, 2300, ...],
                    "backgroundColor": ["#4f46e5", "#ef4444", ...] (Provide a list of distinct colors)
                  }
                ]
              }
            ]
          }

          Rules:
          1. AGGREGATE DATA. Example: Don't show 50 transactions. Show "Total Spending by Category".
          2. For "bar" charts, use categorical for labels and numerical for data.
          3. For "line" charts, use dates/time for labels.
          4. Return ONLY valid, raw JSON. Do NOT include markdown code blocks.
          5. STRICTLY NO COMMENTS in the JSON.`
        },
        {
          role: "user",
          content: `Data to visualize: ${JSON.stringify(dataSample)}`
        }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });

    const result = completion.choices[0].message.content;

    // Helper to clean JSON string
    function cleanJson(str) {
      // Remove markdown code blocks if present
      let cleaned = str.replace(/```json\n?|\n?```/g, '');
      // Remove single line comments that might have slipped in (match // until end of line)
      cleaned = cleaned.replace(/^\s*\/\/.*$/gm, '');
      return cleaned.trim();
    }

    const cleanedResult = cleanJson(result);

    try {
      return JSON.parse(cleanedResult);
    } catch (e) {
      // Fallback: try to find the JSON object if there's extra text
      try {
        const match = cleanedResult.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } catch (innerErr) {
        console.error("Failed to parse JSON even after cleanup:", cleanedResult);
      }
      throw new Error("Failed to parse visualization config from AI response");
    }

  } catch (error) {
    console.error("Error generating chart config:", error);
    throw error;
  }
}

module.exports = { generateChartConfig };
