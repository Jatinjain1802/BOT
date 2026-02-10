const { groq } = require("../config/groqClient");

// Helper function to process chat commands using Groq
async function processCommand(command, currentData) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a CSV data manipulation assistant. Based on user commands, you need to modify CSV data and return the updated data in JSON format.

          Current CSV data structure (showing first item): ${JSON.stringify(
            currentData.slice(0, 1),
            null,
            2
          )}
          
          IMPORTANT: When working with nested objects/arrays, preserve the nested structure. For example:
          - If data has "skills": ["JavaScript", "React"], keep it as an array
          - If data has "projects": [{"name": "X", "description": "Y"}], keep nested objects
          - When flattening happens, it's handled automatically during CSV export
          
          Common commands you can handle:
          1. Add new row/column
          2. Delete row/column  
          3. Update specific values
          4. Filter data
          5. Sort data
          6. Calculate totals/averages
          7. Group data
          8. Add skills to existing skills array
          9. Add projects to existing projects array
          10. Modify nested object properties
          
          Examples:
          - "Add skill 'Python' to all records" -> Add to skills array
          - "Add project with name 'NewProject' and description 'Test'" -> Add to projects array
          - "Update email for Aditya" -> Modify specific field
          - "Remove projects with name containing 'Test'" -> Filter nested objects
          
          Always return the modified data as a JSON array maintaining the original structure.`,
        },
        {
          role: "user",
          content: `Current CSV data: ${JSON.stringify(currentData)}
          
          User command: ${command}
          
          Please modify the data according to this command and return the updated JSON array. Maintain nested structures.`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });

    const result = completion.choices[0].message.content;

    try {
      return JSON.parse(result);
    } catch (parseError) {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
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
