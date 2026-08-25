const sqlite3 = require("sqlite3").verbose();

/**
 * Node.js Dataset Profiling Service
 * ---------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Data Profiling: Understanding the shape, types, and quality of a dataset before starting analysis.
 * 2. SQLite Aggregations: Using SQL functions like `COUNT`, `AVG`, `MIN`, and `MAX` to compute statistics
 *    on disk, avoiding loading millions of rows into JavaScript heap memory.
 * 3. Type Inference: Reading a sample (e.g. 100 records) to identify column types.
 *    If a column contains mostly numbers, we treat it as Numeric. If it fits ISO-8601 or common date string formats,
 *    we treat it as Date. Otherwise, it is Text/Categorical.
 */

/**
 * Checks if a string value represents a valid number.
 */
function isNumeric(val) {
  if (val === undefined || val === null || val === "") return false;
  return !isNaN(Number(val));
}

/**
 * Checks if a string value represents a valid date.
 */
function isDate(val) {
  if (val === undefined || val === null || val === "" || typeof val !== "string") return false;
  // Exclude simple short numbers (which would otherwise parse as timestamps)
  if (/^\d+$/.test(val) && val.length < 5) return false;
  const timestamp = Date.parse(val);
  return !isNaN(timestamp);
}

/**
 * Infers data types for all columns using a 100-row sample.
 * @param {Array<Object>} sampleRows - List of row objects
 * @param {string[]} columns - Column headers
 * @returns {Object} Column -> Type mapping ('numeric' | 'date' | 'text')
 */
function inferColumnTypes(sampleRows, columns) {
  const colTypes = {};

  columns.forEach((col) => {
    let numericCount = 0;
    let dateCount = 0;
    let filledCount = 0;

    sampleRows.forEach((row) => {
      const val = row[col];
      if (val !== undefined && val !== null && val !== "") {
        filledCount++;
        const strVal = String(val).trim();
        if (isNumeric(strVal)) {
          numericCount++;
        } else if (isDate(strVal)) {
          dateCount++;
        }
      }
    });

    if (filledCount === 0) {
      colTypes[col] = "text"; // Default for empty column
    } else if (numericCount / filledCount >= 0.8) {
      colTypes[col] = "numeric";
    } else if (dateCount / filledCount >= 0.8) {
      colTypes[col] = "date";
    } else {
      colTypes[col] = "text";
    }
  });

  return colTypes;
}

/**
 * Runs dataset profiling queries on SQLite table.
 * @param {string} dbPath - Absolute path to SQLite db
 * @returns {Promise<Object>} Detailed dataset profiling report
 */
async function profileDataset(dbPath) {
  const db = new sqlite3.Database(dbPath);

  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        // 1. Get Table row count
        const rowCount = await new Promise((res, rej) => {
          db.get("SELECT COUNT(*) AS total FROM dataset", (err, row) => {
            if (err) rej(err);
            else res(row.total);
          });
        });

        if (rowCount === 0) {
          throw new Error("Dataset contains no rows.");
        }

        // 2. Fetch column information
        const columnsInfo = await new Promise((res, rej) => {
          db.all("PRAGMA table_info(dataset)", (err, rows) => {
            if (err) rej(err);
            else res(rows.map((r) => r.name));
          });
        });

        // 3. Fetch sample of 100 rows to infer types
        const sampleRows = await new Promise((res, rej) => {
          db.all("SELECT * FROM dataset LIMIT 100", (err, rows) => {
            if (err) rej(err);
            else res(rows);
          });
        });

        // Infer types
        const columnTypes = inferColumnTypes(sampleRows, columnsInfo);

        const columnProfiles = {};
        
        // 4. Gather detailed profile stats column-by-column
        for (const col of columnsInfo) {
          const type = columnTypes[col];

          // Null/Empty count and Cardinality (unique values count)
          const basicStats = await new Promise((res, rej) => {
            const query = `
              SELECT 
                SUM(CASE WHEN "${col}" IS NULL OR TRIM("${col}") = '' THEN 1 ELSE 0 END) AS nulls,
                COUNT(DISTINCT "${col}") AS distincts
              FROM dataset
            `;
            db.get(query, (err, row) => {
              if (err) rej(err);
              else res(row);
            });
          });

          const nullCount = basicStats.nulls || 0;
          const distinctCount = basicStats.distincts || 0;
          const nullPercentage = ((nullCount / rowCount) * 100).toFixed(1);

          const colProfile = {
            name: col,
            type,
            nullCount,
            nullPercentage: parseFloat(nullPercentage),
            distinctCount,
            isCategorical: type === "text" && distinctCount > 0 && distinctCount <= 20,
          };

          // 5. Gather Min, Max, Average for Numeric fields
          if (type === "numeric") {
            const numStats = await new Promise((res, rej) => {
              // We cast columns to real numbers, ignoring rows that are not numbers
              const query = `
                SELECT 
                  MIN(CAST("${col}" AS REAL)) AS minVal,
                  MAX(CAST("${col}" AS REAL)) AS maxVal,
                  AVG(CAST("${col}" AS REAL)) AS avgVal
                FROM dataset
                WHERE "${col}" IS NOT NULL AND TRIM("${col}") != ''
              `;
              db.get(query, (err, row) => {
                if (err) rej(err);
                else res(row);
              });
            });

            colProfile.min = numStats.minVal !== null ? parseFloat(numStats.minVal.toFixed(4)) : null;
            colProfile.max = numStats.maxVal !== null ? parseFloat(numStats.maxVal.toFixed(4)) : null;
            colProfile.mean = numStats.avgVal !== null ? parseFloat(numStats.avgVal.toFixed(4)) : null;
          }

          // 6. Gather Distribution for Categorical columns (max top 5 categories)
          if (colProfile.isCategorical) {
            const distribution = await new Promise((res, rej) => {
              const query = `
                SELECT "${col}" AS category, COUNT(*) AS count 
                FROM dataset 
                WHERE "${col}" IS NOT NULL AND TRIM("${col}") != ''
                GROUP BY "${col}" 
                ORDER BY count DESC 
                LIMIT 5
              `;
              db.all(query, (err, rows) => {
                if (err) rej(err);
                else res(rows.map(r => ({ category: r.category, count: r.count })));
              });
            });
            colProfile.distribution = distribution;
          }

          columnProfiles[col] = colProfile;
        }

        db.close();

        resolve({
          rowCount,
          columnCount: columnsInfo.length,
          columns: columnsInfo,
          profiles: columnProfiles,
          createdAt: new Date().toISOString()
        });

      } catch (err) {
        db.close();
        reject(err);
      }
    });
  });
}

module.exports = { profileDataset };
