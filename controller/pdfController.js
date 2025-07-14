const fs = require("fs");
const pdf = require("pdf-parse");
const { extractStructuredData } = require("../services/pdfExtractor");

let csvData = [];

const uploadPdfHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No PDF file uploaded" });
    }

    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdf(pdfBuffer);
    const structuredData = await extractStructuredData(pdfData.text);

    csvData = structuredData;

    fs.unlinkSync(req.file.path); // Delete uploaded file

    res.json({
      success: true,
      message: "PDF processed successfully",
      dataPreview: structuredData.slice(0, 3),
      totalRows: structuredData.length,
    });
  } catch (error) {
    console.error("Error processing PDF:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { uploadPdfHandler, getCsvData: () => csvData, setCsvData: (data) => (csvData = data) };
