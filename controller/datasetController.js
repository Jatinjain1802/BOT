const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { ingestFile, ingestJsonArray } = require("../services/ingestion.service");
const { profileDataset } = require("../services/profiling.service");
const { registerDataset, getDataset, setActiveDataset, getActiveDatasetId } = require("../services/dataset.service");
const { extractStructuredData } = require("../services/pdfExtractor");
const sqlite3 = require("sqlite3").verbose();
const ExcelJS = require("exceljs");

/**
 * Node.js Dataset Controller
 * --------------------------
 * LEARN THE TECHNOLOGY:
 * 1. HTTP File Handling: Multer places uploaded files in the local file system (e.g. `uploads/`).
 *    The controller reads this file, pipes it to the database, and unlinks (deletes) the original file
 *    immediately to prevent server storage bloat.
 * 2. Streaming Response Exports: Standard file down-streamers load the full export into memory, then send it.
 *    By using `WorkbookWriter` and `res.write()`, we stream data directly from SQLite to the user's browser,
 *    meaning our Node server can easily handle 100MB exports on standard server instances.
 * 3. Session Identification: Since HTTP is stateless, the client sends a unique UUID in the custom
 *    `x-session-id` header to define which active dataset context they are analyzing.
 */

/**
 * Handles dataset upload (Excel, CSV, PDF)
 */
async function uploadDataset(req, res) {
  // Support file received under multer fields
  const file = req.file || (req.files && req.files.length > 0 ? req.files[0] : null);
  const sessionId = req.headers["x-session-id"] || "default_session";

  if (!file) {
    return res.status(400).json({
      success: false,
      error: "No file was uploaded. Please upload a valid PDF, Excel (.xlsx, .xls), or CSV file."
    });
  }

  const filePath = file.path;
  const originalName = file.originalname;
  const ext = path.extname(originalName).toLowerCase();
  const datasetId = `ds_${Date.now()}_${Math.round(Math.random() * 1000)}`;

  console.log(`[DatasetController] Upload started: ${originalName} (Session: ${sessionId})`);

  try {
    let rowCount = 0;
    let headers = [];
    let dbPath = "";

    // Route based on extension
    if (ext === ".pdf") {
      // 1. PDF Pipeline: Read text, run LLM to structure to JSON array, insert JSON array
      console.log(`[DatasetController] Parsing PDF: ${originalName}`);
      const pdfBuffer = fs.readFileSync(filePath);
      const parsedPdf = await pdfParse(pdfBuffer);
      
      const structuredRows = await extractStructuredData(parsedPdf.text);
      
      console.log(`[DatasetController] Ingesting structured PDF rows into SQLite...`);
      const ingestResult = await ingestJsonArray(structuredRows, datasetId);
      rowCount = ingestResult.rowCount;
      headers = ingestResult.headers;
      dbPath = ingestResult.dbPath;

    } else if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
      // 2. Excel/CSV Pipeline: Stream directly into SQLite
      console.log(`[DatasetController] Streaming spreadsheet rows into SQLite...`);
      const ingestResult = await ingestFile(filePath, datasetId);
      rowCount = ingestResult.rowCount;
      headers = ingestResult.headers;
      dbPath = ingestResult.dbPath;

    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    // Run dynamic profiling on the imported SQLite table
    console.log(`[DatasetController] Running statistics profiling on table...`);
    const profile = await profileDataset(dbPath);

    // Register metadata in cache
    const metadata = {
      filename: originalName,
      size: file.size,
      rowCount,
      columnCount: headers.length,
      columns: headers,
      profile,
      dbPath
    };
    registerDataset(datasetId, metadata);

    // Set active for user session
    setActiveDataset(sessionId, datasetId);

    // Clean up temporary uploaded file from disk (since it is now safely stored inside SQLite)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`[DatasetController] Upload successfully processed: ${originalName} (${rowCount} rows)`);

    return res.json({
      success: true,
      message: `${ext.replace(".", "").toUpperCase()} processed and profiled successfully.`,
      datasetId,
      filename: originalName,
      size: file.size,
      rowCount,
      columnsCount: headers.length,
      profile
    });

  } catch (error) {
    console.error(`[DatasetController] Upload error:`, error.message);
    
    // Clean up uploaded file on failure
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    return res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred while processing the dataset."
    });
  }
}

/**
 * Gets the profile analysis of the active dataset
 */
async function getActiveDatasetProfile(req, res) {
  const sessionId = req.headers["x-session-id"] || "default_session";
  const datasetId = getActiveDatasetId(sessionId);

  if (!datasetId) {
    return res.status(404).json({
      success: false,
      error: "No active dataset context found for this session. Please upload a file."
    });
  }

  const dataset = getDataset(datasetId);
  if (!dataset) {
    return res.status(404).json({
      success: false,
      error: "Dataset profile could not be found or has expired."
    });
  }

  return res.json({
    success: true,
    datasetId,
    filename: dataset.filename,
    size: dataset.size,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    profile: dataset.profile
  });
}

/**
 * Sets the active dataset for the current session
 */
async function selectDataset(req, res) {
  const sessionId = req.headers["x-session-id"] || "default_session";
  const { datasetId } = req.body;

  if (!datasetId) {
    return res.status(400).json({ success: false, error: "datasetId is required." });
  }

  const dataset = getDataset(datasetId);
  if (!dataset) {
    return res.status(404).json({ success: false, error: "Requested dataset does not exist or has expired." });
  }

  setActiveDataset(sessionId, datasetId);
  return res.json({
    success: true,
    message: `Active dataset set to: ${dataset.filename}`,
    datasetId
  });
}

/**
 * Memory-efficient streaming export of the active dataset
 */
async function exportDataset(req, res) {
  const sessionId = req.headers["x-session-id"] || "default_session";
  const datasetId = getActiveDatasetId(sessionId);
  const format = (req.query.format || "csv").toLowerCase();

  if (!datasetId) {
    return res.status(404).json({ success: false, error: "No active dataset found for this session." });
  }

  const dataset = getDataset(datasetId);
  if (!dataset || !fs.existsSync(dataset.dbPath)) {
    return res.status(404).json({ success: false, error: "Dataset database file not found or expired." });
  }

  const headers = dataset.columns;
  const db = new sqlite3.Database(dataset.dbPath, sqlite3.OPEN_READONLY);
  const cleanFilename = dataset.filename.replace(/\.[^/.]+$/, ""); // Strip original extension

  console.log(`[DatasetController] Streaming export started: ${dataset.filename} (Format: ${format})`);

  try {
    if (format === "csv") {
      // Stream as CSV file
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${cleanFilename}_exported.csv"`);

      // Write column headers line
      res.write(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n");

      // Query database and stream records
      db.each("SELECT * FROM dataset", (err, row) => {
        if (!err) {
          const csvLine = headers.map((h) => {
            const val = row[h] !== undefined && row[h] !== null ? row[h] : "";
            return `"${val.toString().replace(/"/g, '""')}"`;
          }).join(",") + "\n";
          res.write(csvLine);
        }
      }, (err) => {
        db.close();
        if (err) {
          console.error("[DatasetController] Export streaming error:", err.message);
          if (!res.headersSent) {
            res.status(500).end("Failed during export streaming.");
          } else {
            res.end();
          }
        } else {
          res.end();
        }
      });

    } else if (format === "excel") {
      // Stream as XLSX Excel spreadsheet
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${cleanFilename}_exported.xlsx"`);

      // ExcelJS WorkbookWriter streams XLSX zip blocks directly to the response socket, using minimal RAM
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
      const worksheet = workbook.addWorksheet("Dataset Export");

      // Add styled headers row
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
      });
      headerRow.commit(); // Commits the row to stream immediately

      // Stream rows from database and append to Excel worksheet
      db.each("SELECT * FROM dataset", (err, row) => {
        if (!err) {
          const rowValues = headers.map(h => row[h] !== undefined && row[h] !== null ? row[h] : "");
          worksheet.addRow(rowValues).commit();
        }
      }, async (err) => {
        db.close();
        if (err) {
          console.error("[DatasetController] Excel export streaming error:", err.message);
          res.end();
        } else {
          await worksheet.commit();
          await workbook.commit();
          res.end();
        }
      });

    } else {
      db.close();
      return res.status(400).json({ success: false, error: `Invalid export format: ${format}. Use 'csv' or 'excel'.` });
    }
  } catch (error) {
    db.close();
    console.error("[DatasetController] Export handler failure:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Failed to export dataset." });
    }
  }
}

module.exports = {
  uploadDataset,
  getActiveDatasetProfile,
  selectDataset,
  exportDataset
};
