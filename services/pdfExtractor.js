const { groq } = require("../config/groqClinet");

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
          5. If it's invoice/receipt data, extract items, quantities, prices
          6. If it's a report, extract key metrics and values
          7. For nested data like projects, skills, education - keep them as nested objects/arrays
          8. For resumes/CVs, structure like: {name, email, phone, skills: [], projects: [{name, description}], education: []}
          
          Example output format:
          [
            {
              "name": "John Doe", 
              "email": "john@email.com",
              "skills": ["JavaScript", "Python", "React"],
              "projects": [
                {"name": "Project1", "description": "Description1", "techStack": "React, Node.js"},
                {"name": "Project2", "description": "Description2", "techStack": "Python, Django"}
              ],
              "education": [
                {"degree": "Bachelor in CS", "institution": "ABC University", "year": "2020"},
                {"degree": "Master in IT", "institution": "XYZ University", "year": "2022"}
              ]
            }
          ]`,
        },
        {
          role: "user",
          content: `Extract structured data from this text and return as JSON array. Keep nested structures intact for complex data:\n\n${pdfText}`,
        },
      ],
      model: "llama3-70b-8192",
      temperature: 0.1,
    });

    const result = completion.choices[0].message.content;

    // Try to parse the JSON response
    try {
      return JSON.parse(result);
    } catch (parseError) {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Could not parse structured data from AI response");
    }
  } catch (error) {
    console.error("Error extracting structured data:", error);
    throw error;
  }
}

module.exports = { extractStructuredData };
