const fs = require("fs");
const path = require("path");
const assert = require("assert");

// Import target refactored services
const { ingestFile } = require("../services/ingestion.service");
const { profileDataset } = require("../services/profiling.service");
const { executeQueryPlan, translatePlanToSQL } = require("../services/query.service");
const { mapDataToChart } = require("../services/chart.service");

/**
 * Node.js Platform Verification Test Suite
 * -----------------------------------------
 * Executing direct assertions on the refactored services.
 */

async function runTests() {
  console.log("\n==================================================");
  console.log("🚀 STARTING PLATFORM INTEGRATION TESTS");
  console.log("==================================================\n");

  const csvPath = path.join(__dirname, "../sample_test.csv");
  const testDatasetId = `test_ds_${Date.now()}`;
  let testDbPath = "";

  try {
    // ─── Test 1: File Ingestion ───
    console.log("👉 Test 1: Ingesting sample_test.csv into SQLite...");
    const ingestResult = await ingestFile(csvPath, testDatasetId);
    testDbPath = ingestResult.dbPath;

    assert.strictEqual(ingestResult.rowCount, 5, "Should successfully ingest 5 records");
    assert.ok(fs.existsSync(testDbPath), "SQLite database file should be created on disk");
    assert.deepStrictEqual(
      ingestResult.headers,
      ["employee_id", "name", "department", "salary", "join_date"],
      "Sanitized headers mapping mismatch"
    );
    console.log("✅ Test 1 Passed: CSV streamed and imported successfully.\n");

    // ─── Test 2: Dataset Profiling ───
    console.log("👉 Test 2: Profiling SQLite database table statistics...");
    const profile = await profileDataset(testDbPath);

    assert.strictEqual(profile.rowCount, 5, "Profile row count mismatch");
    assert.strictEqual(profile.columnCount, 5, "Profile column count mismatch");
    
    // Assert data type detections
    assert.strictEqual(profile.profiles.salary.type, "numeric", "Salary column should be detected as numeric");
    assert.strictEqual(profile.profiles.join_date.type, "date", "Join_Date column should be detected as date");
    assert.strictEqual(profile.profiles.department.type, "text", "Department column should be detected as text");
    
    // Assert numeric statistics
    assert.strictEqual(profile.profiles.salary.min, 65000, "Min salary mismatch");
    assert.strictEqual(profile.profiles.salary.max, 90000, "Max salary mismatch");
    assert.strictEqual(profile.profiles.salary.mean, 78000, "Average salary mismatch");
    console.log("✅ Test 2 Passed: Data type detection and stats profiling verify correct.\n");

    // ─── Test 3: SQL Plan Translation ───
    console.log("👉 Test 3: Translating Structured Query Plans to SQL...");
    const planAgg = {
      operation: "group_by",
      dimension: "department",
      metric: "salary",
      aggregation: "sum",
      sort: "desc",
      limit: 5
    };
    
    const translated = translatePlanToSQL(planAgg, ingestResult.headers);
    const expectedSql = 'SELECT "department", SUM(CAST("salary" AS REAL)) AS "salary_sum" FROM dataset GROUP BY "department" ORDER BY "salary_sum" DESC LIMIT 5';
    assert.strictEqual(translated.sql, expectedSql, "Aggregation SQL translation mismatch");
    console.log("✅ Test 3 Passed: Plan translated to standard SQL correctly.\n");

    // ─── Test 4: SQL Execution & Math Accuracy ───
    console.log("👉 Test 4: Executing database query plans and checking math...");
    const aggResult = await executeQueryPlan(testDbPath, planAgg, ingestResult.headers);

    // Grouping salary sum by department:
    // Engineering: 85000 (John) + 90000 (Emily) = 175000
    // Marketing: 65000 (Jane)
    // Sales: 72000 (Robert)
    // Finance: 78000 (Michael)
    assert.strictEqual(aggResult.length, 4, "Should return 4 grouped department rows");
    
    const engRow = aggResult.find(r => r.department === "Engineering");
    assert.ok(engRow, "Engineering row should be in the outputs");
    assert.strictEqual(engRow.salary_sum, 175000, "Engineering total salary sum mismatch");
    
    const mktRow = aggResult.find(r => r.department === "Marketing");
    assert.strictEqual(mktRow.salary_sum, 65000, "Marketing total salary sum mismatch");
    console.log("✅ Test 4 Passed: Query engine executed with 100% mathematical accuracy.\n");

    // ─── Test 5: Visual Chart Mappings ───
    console.log("👉 Test 5: Mapping query results to Chart.js configurations...");
    const chartConfig = mapDataToChart(aggResult, planAgg, profile.profiles);

    assert.strictEqual(chartConfig.type, "doughnut", "Aggregated text dimensions should map to composition Doughnut charts when cardinality <= 6");
    assert.strictEqual(chartConfig.labels.length, 4, "Labels size mismatch");
    assert.deepStrictEqual(chartConfig.labels, ["Engineering", "Finance", "Sales", "Marketing"], "Labels sorting order mismatch");
    assert.strictEqual(chartConfig.datasets[0].data[0], 175000, "Dataset values mapping mismatch");
    console.log("✅ Test 5 Passed: Automated chart heuristical mapping checks out.\n");

    // ─── Test 6: Security & SQL Injection Protection ───
    console.log("👉 Test 6: Testing query security and column validations...");
    
    // Test 6a: Referencing a column name not in schema (column injection)
    const malformedPlan = {
      operation: "select",
      sortColumn: "non_existent_column; DROP TABLE dataset; --",
      limit: 10
    };

    assert.throws(
      () => translatePlanToSQL(malformedPlan, ingestResult.headers),
      /Security Violation/,
      "Query engine should block non-schema columns"
    );

    // Test 6b: Testing value parameterization (safe value filters)
    const parameterTestPlan = {
      operation: "select",
      filters: [
        { column: "name", operator: "=", value: "John Doe' OR '1'='1" }
      ],
      limit: 5
    };

    const paramExecuted = await executeQueryPlan(testDbPath, parameterTestPlan, ingestResult.headers);
    assert.strictEqual(paramExecuted.length, 0, "Parameterized query should treat injection strings strictly as data values");
    console.log("✅ Test 6 Passed: SQL column name block and parameters protect query successfully.\n");

    console.log("==================================================");
    console.log("🎉 ALL PLATFORM TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");

  } catch (error) {
    console.error("\n❌ TEST FAILURE ENCOUNTERED:", error);
    process.exit(1);
  } finally {
    // ─── Cleanup Test Database File ───
    if (testDbPath && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
        console.log(`\n🧹 Cleaned up test database file: ${testDbPath}`);
      } catch (err) {
        console.warn(`Could not delete test database:`, err.message);
      }
    }
  }
}

runTests();
