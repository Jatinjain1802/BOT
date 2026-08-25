const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const csvParser = require("csv-parser");
const ExcelJS = require("exceljs");

/**
 * Node.js Ingestion Service
 * -------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Streams: Standard file reading (`fs.readFileSync`) loads the entire file into RAM.
 *    For a 100MB file, this creates heavy memory pressure. Streams process files chunk-by-chunk,
 *    keeping RAM usage low and flat (typically < 30MB) regardless of file size.
 * 2. SQLite: A self-contained, disk-backed SQL database. By creating a database file per dataset,
 *    we store millions of rows out of Node's memory space.
 * 3. Prepared Statements & Transactions: Databases are slow when executing multiple single write operations
 *    because each write triggers disk write syncs. Placing insertions inside a Transaction (`BEGIN` ... `COMMIT`)
 *    batches writes in memory first, speeding up ingestion from 50 rows/sec to over 20,000 rows/sec.
 */

/**
 * Sanitizes headers to make them valid, safe SQLite column names.
 * Replacing non-alphanumeric characters with underscores and ensuring unique names.
 * @param {string[]} headers - Raw column headers
 * @returns {Object} { sanitizedHeaders: string[], headerMap: Object } - Map of raw -> sanitized names
 */
function sanitizeHeaders(headers) {
  const sanitized = [];
  const headerMap = {};
  const seen = new Set();

  headers.forEach((header, index) => {
    let clean = (header || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/gi, "_") // Replace spaces/special chars with underscore
      .replace(/^[^a-z_]/gi, "col_$1") // Must start with letter or underscore
      .replace(/_+/g, "_"); // Deduplicate underscores

    if (!clean || clean === "_") {
      clean = `column_${index + 1}`;
    }

    // Resolve duplicate column names
    let finalClean = clean;
    let count = 1;
    while (seen.has(finalClean)) {
      finalClean = `${clean}_${count}`;
      count++;
    }

    seen.add(finalClean);
    sanitized.push(finalClean);
    headerMap[header] = finalClean; // Raw -> Sanitized map
  });

  return { sanitizedHeaders: sanitized, headerMap };
}

/**
 * Establishes a temporary SQLite database connection.
 * @param {string} datasetId - Unique dataset ID
 * @returns {sqlite3.Database} SQLite database instance
 */
function getDatabaseConnection(datasetId) {
  const dbPath = path.join(__dirname, "../uploads", `dataset_${datasetId}.db`);
  return new sqlite3.Database(dbPath);
}

/**
 * Ingests a CSV file into SQLite.
 * @param {string} filePath - Path to CSV file
 * @param {sqlite3.Database} db - SQLite database instance
 * @param {string[]} headers - Sanitized headers
 * @param {Object} headerMap - Raw -> Sanitized headers map
 */
function ingestCSVStream(filePath, db, headers, headerMap) {
  return new Promise((resolve, reject) => {
    let insertQuery = `INSERT INTO dataset (${headers.join(", ")}) VALUES (${headers.map(() => "?").join(", ")})`;
    
    db.serialize(() => {
      // Begin batch transaction
      db.run("BEGIN TRANSACTION");
      const stmt = db.prepare(insertQuery);
      let count = 0;

      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on("data", (row) => {
          const values = [];
          // Build insert values array in header order
          Object.keys(headerMap).forEach((rawHeader) => {
            const sanitizedKey = headerMap[rawHeader];
            let val = row[rawHeader] !== undefined ? row[rawHeader] : "";
            values.push(val);
          });

          stmt.run(values, (err) => {
            if (err) {
              console.error("[Ingestion] Statement error:", err);
            }
          });

          count++;
          if (count % 5000 === 0) {
            // Commit and restart transaction periodically to save memory in SQLite
            db.run("COMMIT");
            db.run("BEGIN TRANSACTION");
          }
        })
        .on("end", () => {
          stmt.finalize();
          db.run("COMMIT", (err) => {
            if (err) reject(err);
            else resolve(count);
          });
        })
        .on("error", (err) => {
          stmt.finalize();
          db.run("ROLLBACK");
          reject(err);
        });
    });
  });
}

/**
 * Ingests an Excel (.xlsx/.xls) file into SQLite using streaming ExcelJS reader.
 * @param {string} filePath - Path to Excel file
 * @param {sqlite3.Database} db - SQLite database instance
 * @param {string[]} headers - Sanitized headers
 * @param {Object} headerMap - Raw -> Sanitized headers map
 */
async function ingestExcelStream(filePath, db, headers, headerMap) {
  return new Promise((resolve, reject) => {
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      entries: "emit",
      sharedStrings: "cache",
      styles: "ignore",
      hyperlinks: "ignore",
      worksheets: "emit"
    });

    let count = 0;
    let insertQuery = `INSERT INTO dataset (${headers.join(", ")}) VALUES (${headers.map(() => "?").join(", ")})`;
    
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      const stmt = db.prepare(insertQuery);

      workbookReader.read();

      workbookReader.on("worksheet", (worksheetReader) => {
        worksheetReader.on("row", (row) => {
          // Row 1 contains column header titles (skip it here as we already parsed headers)
          if (row.number === 1) return;

          const rowValues = row.values.slice(1); // ExcelJS values are 1-indexed
          const values = [];

          // Map cells to sanitized header positions
          Object.keys(headerMap).forEach((rawHeader, idx) => {
            let cellVal = rowValues[idx];
            
            // Extract raw value if cell is an object (formulas, rich text)
            if (cellVal && typeof cellVal === "object") {
              if (cellVal.result !== undefined) cellVal = cellVal.result;
              else if (cellVal.richText) cellVal = cellVal.richText.map(t => t.text).join("");
              else if (cellVal.text) cellVal = cellVal.text;
            }

            values.push(cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : "");
          });

          // Check if row has at least one non-empty value
          if (values.some(v => v !== "")) {
            stmt.run(values);
            count++;

            if (count % 5000 === 0) {
              db.run("COMMIT");
              db.run("BEGIN TRANSACTION");
            }
          }
        });

        worksheetReader.on("end", () => {
          stmt.finalize();
          db.run("COMMIT", (err) => {
            if (err) reject(err);
            else resolve(count);
          });
        });

        worksheetReader.on("error", (err) => {
          stmt.finalize();
          db.run("ROLLBACK");
          reject(err);
        });
      });

      workbookReader.on("end", () => {
        // Fallback in case worksheet was processed earlier
      });

      workbookReader.on("error", (err) => {
        reject(err);
      });
    });
  });
}

/**
 * Extracts headers from the file to build database schema before streaming dataset rows.
 * @param {string} filePath - Path to file
 * @param {string} ext - Extension name
 * @returns {Promise<string[]>} List of raw headers
 */
function extractRawHeaders(filePath, ext) {
  return new Promise((resolve, reject) => {
    if (ext === ".csv") {
      let resolved = false;
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on("headers", (headers) => {
          resolved = true;
          resolve(headers);
        })
        .on("data", () => {
          // Resolve if headers not emitted, fallback
          if (!resolved) {
            resolve([]);
          }
        })
        .on("end", () => {
          if (!resolved) resolve([]);
        })
        .on("error", (err) => reject(err));
    } else {
      // For XLSX, read the workbook and extract row 1 of sheet 1
      const workbook = new ExcelJS.Workbook();
      workbook.xlsx.read(fs.createReadStream(filePath))
        .then((wb) => {
          const ws = wb.worksheets[0];
          if (!ws) {
            return resolve([]);
          }
          const row1 = ws.getRow(1);
          const headers = row1.values.slice(1).map(val => val !== null && val !== undefined ? String(val).trim() : "");
          resolve(headers);
        })
        .catch(reject);
    }
  });
}

/**
 * Main ingestion controller
 * Validates, creates SQLite table schema, and inserts file rows.
 * @param {string} filePath - Local upload path of CSV/Excel
 * @param {string} datasetId - Destination dataset id
 * @returns {Promise<{ dbPath: string, headers: string[], headerMap: Object, rowCount: number }>} Ingestion results
 */
async function ingestFile(filePath, datasetId) {
  const ext = path.extname(filePath).toLowerCase();
  const dbPath = path.join(__dirname, "../uploads", `dataset_${datasetId}.db`);

  // 1. Get raw headers
  const rawHeaders = await extractRawHeaders(filePath, ext);
  if (rawHeaders.length === 0) {
    throw new Error("No column headers detected in the uploaded file.");
  }

  // 2. Sanitize headers to create SQLite columns
  const { sanitizedHeaders, headerMap } = sanitizeHeaders(rawHeaders);

  // 3. Establish SQLite and create table
  const db = new sqlite3.Database(dbPath);

  try {
    await new Promise((resolve, reject) => {
      // Text type is used as storage default in SQLite; SQLite supports dynamic typing
      const schemaDefinitions = sanitizedHeaders.map((header) => `"${header}" TEXT`).join(", ");
      const createTableQuery = `CREATE TABLE IF NOT EXISTS dataset (${schemaDefinitions})`;

      db.run(createTableQuery, (err) => {
        if (err) reject(new Error("Failed to initialize database table schema: " + err.message));
        else resolve();
      });
    });

    // 4. Stream data into SQLite
    let rowCount = 0;
    if (ext === ".csv") {
      rowCount = await ingestCSVStream(filePath, db, sanitizedHeaders, headerMap);
    } else {
      rowCount = await ingestExcelStream(filePath, db, sanitizedHeaders, headerMap);
    }

    db.close();
    return {
      dbPath,
      headers: sanitizedHeaders,
      headerMap,
      rowCount
    };
  } catch (error) {
    // Make sure database is closed on failure to release lock
    db.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch (_) {}
    throw error;
  }
}

/**
 * Ingests a pre-extracted JSON array (used for PDFs) into SQLite.
 * @param {Array<Object>} rows - Extracted rows
 * @param {string} datasetId - Destination dataset ID
 * @returns {Promise<{ dbPath: string, headers: string[], headerMap: Object, rowCount: number }>}
 */
async function ingestJsonArray(rows, datasetId) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No structured data was extracted from the PDF document.");
  }

  const dbPath = path.join(__dirname, "../uploads", `dataset_${datasetId}.db`);
  const rawHeaders = Object.keys(rows[0]);
  const { sanitizedHeaders, headerMap } = sanitizeHeaders(rawHeaders);

  const db = new sqlite3.Database(dbPath);

  try {
    await new Promise((resolve, reject) => {
      const schemaDefinitions = sanitizedHeaders.map((header) => `"${header}" TEXT`).join(", ");
      const createTableQuery = `CREATE TABLE IF NOT EXISTS dataset (${schemaDefinitions})`;

      db.run(createTableQuery, (err) => {
        if (err) reject(new Error("Failed to initialize database table schema: " + err.message));
        else resolve();
      });
    });

    let count = 0;
    let insertQuery = `INSERT INTO dataset (${sanitizedHeaders.join(", ")}) VALUES (${sanitizedHeaders.map(() => "?").join(", ")})`;

    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare(insertQuery);

        rows.forEach((row) => {
          const values = sanitizedHeaders.map((h) => {
            const rawKey = Object.keys(headerMap).find(k => headerMap[k] === h);
            const val = row[rawKey];
            return val !== undefined && val !== null ? String(val).trim() : "";
          });

          stmt.run(values);
          count++;

          if (count % 5000 === 0) {
            db.run("COMMIT");
            db.run("BEGIN TRANSACTION");
          }
        });

        stmt.finalize();
        db.run("COMMIT", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    db.close();
    return {
      dbPath,
      headers: sanitizedHeaders,
      headerMap,
      rowCount: count
    };
  } catch (error) {
    db.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch (_) {}
    throw error;
  }
}

module.exports = { ingestFile, ingestJsonArray };

