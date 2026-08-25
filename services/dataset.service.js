const fs = require("fs");
const path = require("path");

/**
 * Node.js Dataset & Session Management Service
 * --------------------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Session Registry: An in-memory cache to manage active datasets. In production, this can be backed by
 *    Redis or a database. For local server usage, a standard JavaScript Object/Map functions as a fast session cache.
 * 2. Background Deletion: Temporary file stores can fill disk space quickly on servers handling large uploads.
 *    Using standard Node.js `setInterval` timers, we run asynchronous directory cleanups in the background.
 */

// In-memory dataset registry
// Format: { datasetId: { filename, size, rows, columns, status, schema, createdAt } }
const datasetRegistry = {};

// In-memory active session map
// Format: { sessionId: datasetId }
const sessionActiveDatasets = {};

/**
 * Registers a dataset in the memory cache.
 */
function registerDataset(datasetId, metadata) {
  datasetRegistry[datasetId] = {
    datasetId,
    ...metadata,
    status: "ready",
    createdAt: new Date().toISOString()
  };
}

/**
 * Gets dataset metadata.
 */
function getDataset(datasetId) {
  return datasetRegistry[datasetId] || null;
}

/**
 * Binds a dataset to a session ID.
 */
function setActiveDataset(sessionId, datasetId) {
  sessionActiveDatasets[sessionId] = datasetId;
}

/**
 * Retrieves the current active dataset ID for a session.
 */
function getActiveDatasetId(sessionId) {
  return sessionActiveDatasets[sessionId] || null;
}

/**
 * Removes a dataset from the registry and deletes its SQLite database file.
 */
function removeDataset(datasetId) {
  const dataset = datasetRegistry[datasetId];
  if (!dataset) return;

  const dbPath = path.join(__dirname, "../uploads", `dataset_${datasetId}.db`);
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log(`[DatasetService] Deleted SQLite DB: ${dbPath}`);
    }
  } catch (err) {
    console.error(`[DatasetService] Error deleting SQLite DB ${dbPath}:`, err.message);
  }

  delete datasetRegistry[datasetId];

  // Clean active session mappings pointing to this dataset
  Object.keys(sessionActiveDatasets).forEach((sessId) => {
    if (sessionActiveDatasets[sessId] === datasetId) {
      delete sessionActiveDatasets[sessId];
    }
  });
}

/**
 * Background Task: Scans upload and export folders to clean up files older than a threshold (2 hours).
 */
function cleanStaleFiles() {
  const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
  const uploadsDir = path.join(__dirname, "../uploads");
  const exportsDir = path.join(__dirname, "../exports");
  const now = Date.now();

  console.log("[DatasetService] Running file cleanup check...");

  [uploadsDir, exportsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) return;

    try {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        
        // Exclude gitkeep files
        if (file === ".gitkeep" || file === ".keep") return;

        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > MAX_AGE_MS) {
          // Delete file
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
          console.log(`[DatasetService] Cleaned up stale file: ${filePath} (Age: ${Math.round(age / 60000)} mins)`);

          // If it was a database, remove it from registry
          if (file.startsWith("dataset_") && file.endsWith(".db")) {
            const datasetId = file.replace("dataset_", "").replace(".db", "");
            delete datasetRegistry[datasetId];
            console.log(`[DatasetService] Cleaned database session registry for: ${datasetId}`);
          }
        }
      });
    } catch (err) {
      console.error(`[DatasetService] Error reading cleanup folder ${dir}:`, err.message);
    }
  });
}

// Start recurring cleanup job every 30 minutes
setInterval(cleanStaleFiles, 30 * 60 * 1000);

module.exports = {
  registerDataset,
  getDataset,
  setActiveDataset,
  getActiveDatasetId,
  removeDataset,
  cleanStaleFiles
};
