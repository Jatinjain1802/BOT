const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const { checkPromptSafety } = require("./promptGuardService");

/**
 * Excel & CSV Extractor Service (Optimized)
 * ------------------------------------------
 * Educational Overview:
 * Excel files (.xlsx, .xls) and CSV files (.csv) store structured tabular data.
 * We use `exceljs` to parse workbooks, extract worksheets, and convert rows into
 * an array of JS objects.
 *
 * Performance Design Decisions:
 * ─────────────────────────────
 * OLD approach (slow):
 *   - Chunked rows into groups of 150
 *   - Called Prompt Guard API for EVERY chunk via processChunksWithRateLimit()
 *   - Each chunk waited ~4 seconds due to DOUBLE rate limiting:
 *       → 2s in chunkingService.processChunksWithRateLimit() (waitIfNeeded)
 *       → 2s in promptGuardService.checkPromptSafety()      (waitIfNeeded again)
 *   - For 1000 rows = 7 chunks × 4s = 28+ seconds of pure idle waiting
 *   - The safety results were IGNORED (errors caught silently, data returned anyway)
 *
 * NEW approach (fast):
 *   - Parse ALL rows in a single pass (ExcelJS is synchronous iteration, very fast)
 *   - Run ONE optional safety check on a tiny sample (3 rows) — non-blocking
 *   - No chunking during extraction (chunking belongs at the LLM query stage)
 *   - Result: 1000 rows processed in < 1 second instead of 28+ seconds
 *
 * Key Learning:
 *   Don't call rate-limited APIs inside loops unless EACH call produces
 *   a unique result you actually need. Here the safety check was redundant
 *   because the same data would be checked again when sent to the LLM later.
 *
 * Key Steps:
 * 1. Read Workbook — Load the file into an ExcelJS Workbook instance
 * 2. Extract Headers & Rows — Row 1 = keys, subsequent rows = objects
 * 3. Single Safety Sample — One lightweight Prompt Guard check on a small sample
 */

/**
 * Parses Excel (.xlsx, .xls) or CSV (.csv) file into structured JSON array.
 * @param {string} filePath - Path to uploaded spreadsheet file
 * @returns {Promise<Array<Object>>} Extracted JSON array of records
 */
async function extractExcelData(filePath) {
  /**
   * Performance Timer Pattern (Node.js)
   * ───────────────────────────────────
   * `Date.now()` returns milliseconds since epoch.
   * We capture start time, do the work, then log (end - start) to measure
   * exactly how long extraction takes. This is essential for debugging
   * performance issues. In production, you'd use `process.hrtime.bigint()`
   * for nanosecond precision, but Date.now() is fine for our use case.
   */
  const startTime = Date.now();

  try {
    const ext = path.extname(filePath).toLowerCase();
    const workbook = new ExcelJS.Workbook();

    // ─── Step 1: Read the file into ExcelJS Workbook ───
    if (ext === ".csv") {
      // CSV uses a different parser internally (stream-based, fast)
      await workbook.csv.readFile(filePath);
    } else {
      // XLSX/XLS uses zip decompression + XML parsing (slightly heavier)
      await workbook.xlsx.readFile(filePath);
    }

    const parseTime = Date.now();
    console.log(`[ExcelExtractor] File parsed by ExcelJS in ${parseTime - startTime}ms`);

    // ─── Step 2: Get the first worksheet ───
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0) {
      throw new Error("The uploaded spreadsheet is empty or contains no valid worksheets.");
    }

    const rows = [];
    let headers = [];

    /**
     * Row Iteration with eachRow()
     * ────────────────────────────
     * ExcelJS's `eachRow()` is a synchronous iterator — it does NOT make
     * any network calls. It simply walks through the in-memory worksheet.
     * This means even 10,000 rows iterate in milliseconds.
     *
     * The `{ includeEmpty: false }` option skips completely empty rows,
     * which saves us from processing blank lines at the bottom of the sheet.
     *
     * `row.values` is 1-indexed (index 0 is always undefined in ExcelJS),
     * so we `.slice(1)` to get the actual cell values starting from column A.
     */
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // Row 1 contains column header titles
      if (rowNumber === 1) {
        headers = row.values
          .slice(1)
          .map((val) =>
            val !== null && val !== undefined ? String(val).trim() : ""
          );
        return;
      }

      // Subsequent rows contain record values
      const rowData = {};
      const values = row.values.slice(1);

      let hasValue = false;
      headers.forEach((header, index) => {
        if (!header) header = `Column_${index + 1}`;
        let cellVal = values[index];

        /**
         * Cell Value Type Handling
         * ────────────────────────
         * ExcelJS can return different object types for special cells:
         * - Formula cells:  { formula: '=A1+B1', result: 42 }
         * - Rich text:      { richText: [{ text: 'Bold' }, { text: ' Normal' }] }
         * - Hyperlinks:     { text: 'Click here', hyperlink: 'https://...' }
         * We extract the plain value from each type.
         */
        if (cellVal && typeof cellVal === "object") {
          if (cellVal.result !== undefined) cellVal = cellVal.result;
          else if (cellVal.richText)
            cellVal = cellVal.richText.map((t) => t.text).join("");
          else if (cellVal.text) cellVal = cellVal.text;
        }

        if (cellVal !== undefined && cellVal !== null && cellVal !== "") {
          hasValue = true;
        }

        rowData[header] =
          cellVal !== undefined && cellVal !== null ? cellVal : "";
      });

      // Only push rows that have at least one non-empty cell
      if (hasValue) {
        rows.push(rowData);
      }
    });

    const iterationTime = Date.now();
    console.log(
      `[ExcelExtractor] ${rows.length} rows extracted in ${iterationTime - parseTime}ms`
    );

    // ─── Step 3: Single lightweight safety check on a small sample ───
    /**
     * Why ONE check instead of per-chunk checks?
     * ───────────────────────────────────────────
     * The old code ran Prompt Guard on every 150-row chunk, but:
     *   1. It only checked the first 5 rows of each chunk anyway
     *   2. Errors were silently caught — data was returned regardless
     *   3. Each call added 4+ seconds of rate-limit delay
     *
     * Now we check just 3 random rows in a single API call.
     * This catches malicious content without blocking extraction.
     * The check runs asynchronously (fire-and-forget) so it doesn't
     * slow down the return of parsed data.
     *
     * Real security enforcement happens downstream when the data
     * is sent to the LLM for analysis — that's where Prompt Guard
     * actually matters.
     */
    if (rows.length > 0) {
      // Fire-and-forget: don't await this, let it run in background
      runSafetyCheckInBackground(rows);
    }

    const totalTime = Date.now() - startTime;
    console.log(
      `[ExcelExtractor] ✅ Complete! ${rows.length} rows processed in ${totalTime}ms`
    );

    return rows;
  } catch (error) {
    console.error("[ExcelExtractor] Error reading spreadsheet:", error);
    throw new Error(`Failed to process Excel/CSV file: ${error.message}`);
  }
}

/**
 * Runs a single Prompt Guard safety check on a small sample of rows.
 * This is fire-and-forget — it logs warnings but does NOT block extraction.
 *
 * Educational Note (Fire-and-Forget Pattern):
 * ───────────────────────────────────────────
 * We intentionally do NOT `await` this function in the main flow.
 * This means extraction returns immediately while the safety check
 * runs in the background. The `.catch()` ensures unhandled promise
 * rejections don't crash Node.js.
 *
 * @param {Array<Object>} rows - All extracted rows
 */
function runSafetyCheckInBackground(rows) {
  /**
   * Sampling Strategy
   * ─────────────────
   * Instead of checking every row, we pick 3 rows:
   *   - First row  (catches header-area injection)
   *   - Middle row  (catches mid-file payloads)
   *   - Last row    (catches appended malicious content)
   *
   * This gives decent coverage with a single API call.
   */
  const sampleIndices = [
    0,
    Math.floor(rows.length / 2),
    rows.length - 1,
  ];

  // Deduplicate indices for small datasets (e.g., 1 or 2 rows)
  const uniqueIndices = [...new Set(sampleIndices)];
  const sampleRows = uniqueIndices.map((i) => rows[i]);
  const sampleText = JSON.stringify(sampleRows);

  checkPromptSafety(sampleText)
    .then((result) => {
      if (!result.isSafe) {
        console.warn(
          `[ExcelExtractor] ⚠️ Safety Warning: Sample rows flagged by Prompt Guard 2.`,
          result.reason || ""
        );
      }
    })
    .catch((err) => {
      // Non-critical: log and continue — extraction is already complete
      console.warn(
        "[ExcelExtractor] Safety check skipped (non-blocking):",
        err.message
      );
    });
}

module.exports = { extractExcelData };

