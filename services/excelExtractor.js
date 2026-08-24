const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const { chunkArray, processChunksWithRateLimit } = require("./chunkingService");
const { checkPromptSafety } = require("./promptGuardService");

/**
 * Excel & CSV Extractor Service
 * -----------------------------
 * Educational Overview:
 * Excel files (.xlsx, .xls) and CSV files (.csv) store structured tabular data.
 * We use `exceljs` to parse workbooks, extract worksheets, and convert rows into an array of JS objects.
 * 
 * Key Steps:
 * 1. Read Workbook: Load the uploaded file buffer or path into an ExcelJS Workbook instance.
 * 2. Extract Headers & Rows: Line 1 of the active worksheet becomes object keys; subsequent rows become objects.
 * 3. Chunking & Security Evaluation: If the spreadsheet contains hundreds or thousands of rows,
 *    we chunk the row dataset using `chunkingService` and run Prompt Guard safety checks while respecting rate limits.
 */

/**
 * Parses Excel (.xlsx, .xls) or CSV (.csv) file into structured JSON array.
 * @param {string} filePath - Path to uploaded spreadsheet file
 * @returns {Promise<Array<Object>>} Extracted JSON array of records
 */
async function extractExcelData(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const workbook = new ExcelJS.Workbook();

    if (ext === ".csv") {
      // Read CSV file using ExcelJS CSV reader
      await workbook.csv.readFile(filePath);
    } else {
      // Read XLSX/XLS file
      await workbook.xlsx.readFile(filePath);
    }

    // Get the first active worksheet in the workbook
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0) {
      throw new Error("The uploaded spreadsheet is empty or contains no valid worksheets.");
    }

    const rows = [];
    let headers = [];

    // Iterate through all rows using ExcelJS row handler
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // Row 1 contains column header titles
      if (rowNumber === 1) {
        headers = row.values.slice(1).map((val) => (val !== null && val !== undefined ? String(val).trim() : ""));
        return;
      }

      // Subsequent rows contain record values
      const rowData = {};
      const values = row.values.slice(1);
      
      let hasValue = false;
      headers.forEach((header, index) => {
        if (!header) header = `Column_${index + 1}`;
        let cellVal = values[index];
        
        // Handle RichText or Excel Formula objects if returned by ExcelJS
        if (cellVal && typeof cellVal === "object") {
          if (cellVal.result !== undefined) cellVal = cellVal.result; // Formula result
          else if (cellVal.richText) cellVal = cellVal.richText.map(t => t.text).join(""); // Rich text
          else if (cellVal.text) cellVal = cellVal.text;
        }

        if (cellVal !== undefined && cellVal !== null && cellVal !== "") {
          hasValue = true;
        }
        
        rowData[header] = cellVal !== undefined && cellVal !== null ? cellVal : "";
      });

      if (hasValue) {
        rows.push(rowData);
      }
    });

    console.log(`[ExcelExtractor] Successfully parsed ${rows.length} rows from file.`);

    // If dataset is large (>150 rows), chunk and validate safety progressively
    if (rows.length > 150) {
      console.log(`[ExcelExtractor] Dataset is large (${rows.length} rows). Applying chunking...`);
      const rowChunks = chunkArray(rows, 150);

      const processedChunks = await processChunksWithRateLimit(rowChunks, async (chunk, chunkIdx, totalChunks) => {
        // Optional security check per chunk using Prompt Guard 2 86M
        try {
          const sampleText = JSON.stringify(chunk.slice(0, 5));
          const safetyResult = await checkPromptSafety(sampleText);
          if (!safetyResult.isSafe) {
            console.warn(`[ExcelExtractor] Warning: Chunk ${chunkIdx + 1} flagged by Prompt Guard 2`);
          }
        } catch (guardErr) {
          // Ignore prompt guard error on excel parsing
        }
        return chunk;
      });

      return processedChunks;
    }

    return rows;
  } catch (error) {
    console.error("[ExcelExtractor] Error reading spreadsheet:", error);
    throw new Error(`Failed to process Excel/CSV file: ${error.message}`);
  }
}

module.exports = { extractExcelData };
