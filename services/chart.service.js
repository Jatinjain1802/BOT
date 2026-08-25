/**
 * Node.js Visualization Mapping Service
 * --------------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Automatic Chart Selection: A crucial feature of modern BI tools (like Tableau or Power BI).
 *    Instead of forcing users to build charts, the system inspects the dimension's datatype and cardinality:
 *    - Date Dimension -> Line Chart (shows continuous timeline trends).
 *    - Low-Cardinality Text Category (e.g. <= 6 values) -> Pie/Donut Chart (shows composition of whole).
 *    - High-Cardinality Text Category -> Horizontal or Vertical Bar Chart (shows discrete comparisons).
 *    - No Category (single aggregate value) -> KPI Card (displays key metrics at a glance).
 * 2. Chart.js Schema: Formats the data into the exact visual dataset structure required by the frontend
 *    canvas context, incorporating clean styling palettes.
 */

// Elegant visual theme color palette
const CHART_COLORS = [
  "#6366F1", // Indigo
  "#10B981", // Emerald
  "#06B6D4", // Cyan
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#EF4444", // Red
  "#3B82F6", // Blue
  "#14B8A6", // Teal
  "#F97316"  // Orange
];

/**
 * Automatically creates Chart.js configuration based on query results and planning.
 * @param {Array<Object>} queryResult - Data rows returned by SQLite query
 * @param {Object} queryPlan - Plan that was executed
 * @param {Object} columnProfiles - Column profile metadata mapping
 * @returns {Object} Chart.js configuration spec
 */
function mapDataToChart(queryResult, queryPlan, columnProfiles) {
  if (!Array.isArray(queryResult) || queryResult.length === 0) {
    return { type: "empty", title: "No Data Available", message: "The query returned no results." };
  }

  const operation = queryPlan.operation || "select";

  // Case 1: Raw row listing -> Render as raw Table
  if (operation === "select") {
    return {
      type: "table",
      title: queryPlan.sortColumn ? `Records ordered by ${queryPlan.sortColumn}` : "Data Records",
      data: queryResult
    };
  }

  // Case 2: Group By aggregations
  const dimension = queryPlan.dimension;
  const metric = queryPlan.metric;
  const agg = queryPlan.aggregation || "sum";
  const metricColumnName = `${metric}_${agg}`; // Matches SQLite alias naming

  // Safely extract properties
  const dimProfile = columnProfiles[dimension] || { type: "text" };
  const dimType = dimProfile.type;
  const cardinality = queryResult.length;

  // Determine human-readable label
  const aggLabel = agg.toUpperCase();
  const title = `${aggLabel} of ${metric} by ${dimension}`;

  // Case 2a: Single value aggregation -> Render as KPI Card
  if (cardinality === 1) {
    const kpiVal = parseFloat(Number(queryResult[0][metricColumnName]).toFixed(2));
    return {
      type: "kpi",
      title,
      kpiValue: isNaN(kpiVal) ? queryResult[0][metricColumnName] : kpiVal,
      kpiLabel: `${aggLabel} ${metric}`
    };
  }

  // Prepare standard labels and values lists
  const labels = queryResult.map((row) => {
    const val = row[dimension];
    return val !== null && val !== undefined && val !== "" ? String(val) : "Unknown";
  });

  const dataValues = queryResult.map((row) => {
    const val = Number(row[metricColumnName]);
    return isNaN(val) ? 0 : parseFloat(val.toFixed(2));
  });

  // Case 2b: Date-based time series -> Render as Line Chart
  if (dimType === "date") {
    return {
      type: "line",
      title,
      labels,
      datasets: [
        {
          label: `${aggLabel} of ${metric}`,
          data: dataValues,
          borderColor: "#4F46E5", // Indigo boundary line
          backgroundColor: "rgba(79, 70, 229, 0.1)", // Light indigo area fill
          borderWidth: 2,
          fill: true,
          tension: 0.3 // Smooth curves
        }
      ]
    };
  }

  // Case 2c: Text categories with low cardinality (<= 6 sectors) -> Render as Doughnut Chart
  if (dimType === "text" && cardinality <= 6) {
    return {
      type: "doughnut",
      title,
      labels,
      datasets: [
        {
          label: `${aggLabel} of ${metric}`,
          data: dataValues,
          backgroundColor: CHART_COLORS.slice(0, cardinality),
          borderWidth: 1
        }
      ]
    };
  }

  // Case 2d: High cardinality categories -> Render as Bar Chart
  return {
    type: "bar",
    title,
    labels,
    datasets: [
      {
        label: `${aggLabel} of ${metric}`,
        data: dataValues,
        backgroundColor: "#6366F1", // Indigo bars
        borderColor: "#4F46E5",
        borderWidth: 1
      }
    ]
  };
}

module.exports = { mapDataToChart };
