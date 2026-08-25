const sqlite3 = require("sqlite3").verbose();

/**
 * Node.js SQLite Safe Query Engine
 * -------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Parameterization: Placing values directly into query strings (`SELECT * FROM dataset WHERE name = "John"`)
 *    invites SQL injection. Parameterization replaces values with `?` placeholders, telling the database
 *    to treat values strictly as parameters (data), not executable SQL instructions.
 * 2. Column Validation: SQL parameters (`?`) only work for values, not identifiers (column or table names).
 *    To prevent injection via column names, we must explicitly check column inputs against a list of known
 *    valid columns in the dataset schema before concatenating them.
 * 3. Read-Only Databases: Opening connections with `sqlite3.OPEN_READONLY` means that even if a query
 *    somehow bypasses validation, the database engine will block any writing operations (`INSERT`, `UPDATE`, `DROP`).
 * 4. Query Timeouts: Complex queries on huge tables can block the Node.js event loop or overload the server.
 *    We set a timer that calls `db.interrupt()` if execution takes longer than 5 seconds, stopping the query.
 */

/**
 * Validates that a column exists in the dataset schema.
 * Throws an error if invalid to prevent SQL injection.
 * @param {string} col - Column name to validate
 * @param {string[]} schemaColumns - Array of valid columns in schema
 */
function validateColumn(col, schemaColumns) {
  if (!col) return;
  if (!schemaColumns.includes(col)) {
    throw new Error(`Security Violation: Column name "${col}" does not exist in the dataset schema.`);
  }
}

/**
 * Translates a Structured Query Plan JSON into a SQL query and values array.
 * @param {Object} plan - Query plan JSON
 * @param {string[]} schemaColumns - List of valid columns in database
 * @returns {Object} { sql: string, params: any[] }
 */
function translatePlanToSQL(plan, schemaColumns) {
  const params = [];
  let selectClause = "";
  let whereClause = "";
  let groupByClause = "";
  let orderByClause = "";
  let limitClause = "";

  const operation = plan.operation || "select";
  const limit = Math.min(plan.limit || 100, 1000); // Enforce a hard maximum limit of 1000 records

  // 1. Build SELECT and GROUP BY clauses
  if (operation === "group_by") {
    const dimension = plan.dimension;
    const metric = plan.metric;
    const agg = (plan.aggregation || "sum").toLowerCase();

    validateColumn(dimension, schemaColumns);
    validateColumn(metric, schemaColumns);

    const allowedAggs = ["sum", "avg", "count", "min", "max"];
    if (!allowedAggs.includes(agg)) {
      throw new Error(`Invalid aggregation operation "${agg}". Allowed: ${allowedAggs.join(", ")}`);
    }

    // Cast metric to numeric to ensure math functions run correctly on text storage
    selectClause = `SELECT "${dimension}", ${agg.toUpperCase()}(CAST("${metric}" AS REAL)) AS "${metric}_${agg}"`;
    groupByClause = `GROUP BY "${dimension}"`;
    
    // Default sorting for group_by is by the aggregated metric descending
    const sortOrder = (plan.sort || "desc").toUpperCase();
    orderByClause = `ORDER BY "${metric}_${agg}" ${sortOrder}`;

  } else {
    // Default operation: raw select (with limit)
    // Select all sanitized columns
    selectClause = `SELECT ${schemaColumns.map(c => `"${c}"`).join(", ")}`;
    
    if (plan.sortColumn) {
      validateColumn(plan.sortColumn, schemaColumns);
      const sortOrder = (plan.sort || "asc").toUpperCase();
      orderByClause = `ORDER BY "${plan.sortColumn}" ${sortOrder}`;
    }
  }

  // 2. Build WHERE clause (Filters)
  if (Array.isArray(plan.filters) && plan.filters.length > 0) {
    const filterConditions = [];

    plan.filters.forEach((filter) => {
      const col = filter.column;
      const op = filter.operator;
      let val = filter.value;

      validateColumn(col, schemaColumns);

      const allowedOps = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"];
      if (!allowedOps.includes(op)) {
        throw new Error(`Unsupported filter operator "${op}".`);
      }

      if (op === "LIKE") {
        filterConditions.push(`"${col}" LIKE ?`);
        params.push(`%${val}%`); // Add wildcards for partial match
      } else if (op === "IN") {
        if (!Array.isArray(val)) {
          val = [val];
        }
        const placeholders = val.map(() => "?").join(", ");
        filterConditions.push(`"${col}" IN (${placeholders})`);
        params.push(...val);
      } else {
        filterConditions.push(`"${col}" ${op} ?`);
        params.push(val);
      }
    });

    whereClause = `WHERE ${filterConditions.join(" AND ")}`;
  }

  // 3. Build LIMIT clause
  limitClause = `LIMIT ${limit}`;

  // Assemble full SQL
  const sql = [
    selectClause,
    "FROM dataset",
    whereClause,
    groupByClause,
    orderByClause,
    limitClause
  ].filter(part => part !== "").join(" ");

  return { sql, params };
}

/**
 * Safely executes a structured analysis plan against the SQLite database.
 * @param {string} dbPath - Absolute path to SQLite db file
 * @param {Object} plan - Structured Query Plan JSON
 * @param {string[]} schemaColumns - Valid schema columns
 * @returns {Promise<Array<Object>>} Query result rows
 */
async function executeQueryPlan(dbPath, plan, schemaColumns) {
  // Translate plan to standard safe parameterized SQL query
  const { sql, params } = translatePlanToSQL(plan, schemaColumns);
  console.log(`[QueryEngine] Executing: ${sql} | Params: ${JSON.stringify(params)}`);

  // Open database in READONLY mode to prevent data mutation
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  return new Promise((resolve, reject) => {
    let timeoutId;

    // Timeout safety wrapper (5 seconds query execution limit)
    const timeoutMs = 5000;
    timeoutId = setTimeout(() => {
      console.warn(`[QueryEngine] Timeout reached (${timeoutMs}ms). Interrupting query.`);
      db.interrupt(); // Stops SQLite process immediately
      reject(new Error("Query execution timed out. The operation was too heavy for this dataset. Try adding filters or picking smaller dimensions."));
    }, timeoutMs);

    db.all(sql, params, (err, rows) => {
      clearTimeout(timeoutId);
      db.close();

      if (err) {
        if (err.message.includes("interrupted")) {
          reject(new Error("Query execution timed out. The operation was too heavy for this dataset."));
        } else {
          console.error("[QueryEngine] SQLite execution error:", err.message);
          reject(new Error("Database calculation error: " + err.message));
        }
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = { executeQueryPlan, translatePlanToSQL };
