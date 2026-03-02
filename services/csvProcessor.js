const { groq, MODELS } = require("../config/groqClient");

// Helper function to process chat commands using Groq
async function processCommand(command, currentData) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a CSV manipulation expert. Modify the JSON data as per user command and return the UPDATED JSON array ONLY.
          
          RULES:
          1. Return MUST be a valid JSON array of objects.
          2. Maintain existing structure.
          3. NO conversation, NO markdown blocks.`,
        },
        {
          role: "user",
          content: `Data: ${JSON.stringify(currentData)}\n\nCommand: ${command}`,
        },
      ],
      model: MODELS.MODIFICATION,
      temperature: 0.1,
    });

    const result = completion.choices[0].message.content.trim();

    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(result);
    } catch (parseError) {
      console.error("CSV Process Parse Error:", result);
      return { error: "Could not parse AI response", response: result };
    }
  } catch (error) {
    console.error("Error processing command:", error);
    throw error;
  }
}


module.exports = {
  processCommand,
};
