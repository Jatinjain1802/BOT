const { groq, MODELS } = require("../config/groqClient");

async function extractStructuredData(pdfText) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a data extraction expert. Extract structured data from the given text and return it in a JSON format that can be easily converted to CSV. 
          
          Guidelines:
          1. Identify key data points like names, dates, amounts, addresses, etc.
          2. Create consistent column headers
          3. Return data as an array of objects
          4. If data seems tabular, preserve the table structure
          
          Example output format:
          [
            { "name": "John Doe", "email": "john@email.com" }
          ]
          
          Return ONLY dry JSON. No conversation, no markdown blocks.`,
        },
        {
          role: "user",
          content: `Extract structured data from this text and return as JSON array:\n\n${pdfText}`,
        },
      ],
      model: MODELS.EXTRACTION,
      temperature: 0.1,
    });

    const result = completion.choices[0].message.content.trim();

    // Cleaning logic: Check for JSON inside markdown blocks or just the raw array
    try {
      // Step 1: Handle Markdown blocks if present
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(result);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", result);
      throw new Error("Could not parse structured data from AI response. Please try again.");
    }
  } catch (error) {
    console.error("Error extracting structured data:", error);
    throw error;
  }
}


module.exports = { extractStructuredData };
