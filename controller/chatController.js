const { groq } = require("../config/groqClient");
const { processCommand } = require("../services/csvProcessor");
const { getCsvData, setCsvData } = require("./pdfController");
const path = require("path");
const fs = require("fs");
const { createStructuredCsv, createExcelWithBoldHeaders, formatExcelFile } = require("../services/csvWriter");

const isVercel = process.env.VERCEL === '1';
const exportsPath = isVercel ? '/tmp/exports' : './exports';
const updatedExcelPath = path.join(exportsPath, "updated_data.xlsx");
const updatedCsvPath = path.join(exportsPath, "updated_data.csv");

const handleChat = async (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ success: false, error: "No command provided" });
    }

    const csvData = getCsvData();
    const csvKeywords = ["csv", "json", "data", "row", "column", "filter", "sort", "add", "remove", "update", "format"];
    const isCsvCommand = csvKeywords.some((keyword) => command.toLowerCase().includes(keyword));

    if (isCsvCommand) {
      if (csvData.length === 0) {
        return res.status(400).json({ success: false, error: "No PDF data available. Please upload a PDF first." });
      }

      if (command.toLowerCase().startsWith("format")) {
        if (!fs.existsSync(updatedExcelPath)) {
          return res.status(400).json({ success: false, error: "No Excel file to format. Please create one first." });
        }
        await formatExcelFile(command, updatedExcelPath);
        return res.json({ success: true, message: "Excel file formatted successfully." });
      }

      const modifiedData = await processCommand(command, csvData);

      if (modifiedData.error) {
        return res.json({ success: false, error: modifiedData.error, response: modifiedData.response });
      }

      setCsvData(modifiedData);

      // Save updated data to both CSV and Excel for download

      // Ensure directory exists
      if (!fs.existsSync(exportsPath)) fs.mkdirSync(exportsPath, { recursive: true });

      try {
        createStructuredCsv(modifiedData, updatedCsvPath);
        await createExcelWithBoldHeaders(modifiedData, updatedExcelPath);
      } catch (err) {
        console.error("Error saving updated files:", err);
      }

      const confirmation = await groq.chat.completions.create({
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant. Confirm the user command in a friendly human-like message.",
          },
          {
            role: "user",
            content: `User command: "${command}". Here is the updated data (first 2 rows): ${JSON.stringify(
              modifiedData.slice(0, 2),
              null,
              2
            )}. Write a brief confirmation.`,
          },
        ],
        temperature: 0.5,
      });

      const csvReply = confirmation.choices[0].message.content;

      return res.json({ success: true, message: csvReply });
    } else {
      let context = "You are a friendly assistant.";
      if (csvData.length > 0) {
        context += ` The user uploaded PDF data. Preview: ${JSON.stringify(csvData.slice(0, 2), null, 2)}`;
      }

      const response = await groq.chat.completions.create({
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
        messages: [
          { role: "system", content: context },
          { role: "user", content: command },
        ],
        temperature: 0.7,
      });

      const normalReply = response.choices[0].message.content;

      return res.json({ success: true, message: normalReply });
    }
  } catch (error) {
    console.error("Error in chat handler:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { handleChat };
