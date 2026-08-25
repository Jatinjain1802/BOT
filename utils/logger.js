/**
 * Server Observability Logger Utility
 * -----------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Log Levels: Categorizing logs (INFO, WARN, ERROR, DEBUG) helps engineers filter console output
 *    during debugging and allows log aggregators (like Datadog or ELK) to trigger alerts on ERRORs.
 * 2. Visual Separation: Using ANSI colors in terminal logs makes running servers significantly easier
 *    to audit visually at a glance.
 * 3. Execution Timings: Using `performance.now()` or `Date.now()` to measure durations of complex operations
 *    (like importing files or calling AI services) is essential for identifying bottlenecks.
 */

// Terminal ANSI color escape codes
const COLORS = {
  reset: "\x1b[0m",
  info: "\x1b[36m",    // Cyan
  warn: "\x1b[33m",    // Yellow
  error: "\x1b[31m",   // Red
  sql: "\x1b[34m",     // Blue
  timing: "\x1b[32m",  // Green
  timestamp: "\x1b[90m" // Gray
};

function getTimestamp() {
  return `${COLORS.timestamp}[${new Date().toISOString()}]${COLORS.reset}`;
}

const logger = {
  info: (msg, details = "") => {
    console.log(`${getTimestamp()} ${COLORS.info}[INFO]${COLORS.reset} ${msg}`, details);
  },
  
  warn: (msg, details = "") => {
    console.warn(`${getTimestamp()} ${COLORS.warn}[WARN]${COLORS.reset} ⚠️ ${msg}`, details);
  },
  
  error: (msg, err = "") => {
    console.error(`${getTimestamp()} ${COLORS.error}[ERROR]${COLORS.reset} ❌ ${msg}`, err);
  },

  sql: (query, params = []) => {
    const formattedParams = params.length > 0 ? `| Params: ${JSON.stringify(params)}` : "";
    console.log(`${getTimestamp()} ${COLORS.sql}[SQL]${COLORS.reset} ${query} ${formattedParams}`);
  },

  timing: (operation, durationMs) => {
    console.log(`${getTimestamp()} ${COLORS.timing}[TIME]${COLORS.reset} ⏱️ ${operation} completed in ${COLORS.timing}${durationMs}ms${COLORS.reset}`);
  }
};

module.exports = logger;
