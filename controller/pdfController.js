const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const { extractStructuredData } = require("../services/pdfExtractor");
const { extractExcelData } = require("../services/excelExtractor");

/**
 * Universal File Processing Controller (PDF & Excel / CSV)
 * --------------------------------------------------------
 * Educational Overview:
 * In Model-View-Controller (MVC) architecture, Controllers contain the business logic
 * that connects HTTP routes to underlying data extraction services and returns HTTP responses.
 * 
 * Key Responsibilities:
 * 1. Validate File Presence: Ensure file uploaded via Multer exists on disk.
 * 2. File Format Routing: Route `.pdf` to PDF extractor and `.xlsx`/`.xls`/`.csv` to Excel extractor.
 * 3. Session State Management: Maintain `csvData` array in memory for subsequent AI manipulation & exports.
 * 4. Cleanup Temporary Storage: Unlink (delete) uploaded files from disk after processing.
 */

let csvData = [];

/**
 * Express Handler for `/upload-file` and `/upload-pdf`
 */
const uploadFileHandler = async (req, res) => {
  // Support file received under either 'file' or 'pdf' field name
  const uploadedFile = req.file;

  if (!uploadedFile) {
    return res.status(400).json({ 
      success: false, 
      error: "No file was uploaded. Please upload a valid PDF, Excel (.xlsx, .xls), or CSV file." 
    });
  }

  const filePath = uploadedFile.path;
  const ext = path.extname(uploadedFile.originalname).toLowerCase();
  let structuredData = [];

  try {
    console.log(`[FileController] Received file '${uploadedFile.originalname}' (${ext}). Processing...`);

    if (ext === ".pdf") {
      // 1. PDF File Processing Pipeline
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfParsed = await pdf(pdfBuffer);
      structuredData = await extractStructuredData(pdfParsed.text);
    } else if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
      // 2. Excel / CSV File Processing Pipeline
      structuredData = await extractExcelData(filePath);
    } else {
      return res.status(400).json({
        success: false,
        error: `Unsupported file extension '${ext}'. Supported formats: .pdf, .xlsx, .xls, .csv`,
      });
    }

    // Save extracted dataset to in-memory session state
    csvData = structuredData;

    return res.json({
      success: true,
      message: `${ext.toUpperCase().replace(".", "")} file processed successfully!`,
      fileName: uploadedFile.originalname,
      fileType: ext.replace(".", "").toUpperCase(),
      dataPreview: structuredData.slice(0, 3),
      totalRows: structuredData.length,
    });
  } catch (error) {
    console.error("[FileController] Error processing file upload:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "An unexpected error occurred while processing the file." 
    });
  } finally {
    // Synchronous/Safe cleanup of temporary upload file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupErr) {
      console.warn("[FileController] Could not delete temp file:", cleanupErr.message);
    }
  }
};

module.exports = {
  uploadFileHandler,
  uploadPdfHandler: uploadFileHandler, // Backward compatibility alias for /upload-pdf
  getCsvData: () => csvData,
  setCsvData: (data) => (csvData = data),
};
