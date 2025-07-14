// const fs = require("fs");
// const {flattenObject}= require("../utils/flatten");
// const createCsvWriter = require("csv-writer").createObjectCsvWriter;


// // Enhanced function to create structured CSV with proper nested formatting
// function createStructuredCsv(data, filename) {
//   if (!data || data.length === 0) {
//     throw new Error("No data to save");
//   }

//   let csvContent = "";

//   // Process each record
//   data.forEach((record, recordIndex) => {
//     if (recordIndex > 0) {
//       csvContent += "\n"; // Add blank line between records
//     }

//     csvContent += `Record ${recordIndex + 1}\n`;
//     csvContent += "=".repeat(50) + "\n";

//     // Process each field in the record
//     Object.keys(record).forEach((key) => {
//       const value = record[key];

//       if (Array.isArray(value)) {
//         // Handle arrays
//         csvContent += `${key.toUpperCase()}\n`;
//         csvContent += "-".repeat(30) + "\n";

//         if (value.length === 0) {
//           csvContent += "No data\n";
//         } else if (typeof value[0] === "object" && value[0] !== null) {
//           // Array of objects - create structured sub-sections
//           value.forEach((item, index) => {
//             csvContent += `${key.slice(0, -1)} ${index + 1}:\n`; // Remove 's' from plural
//             Object.keys(item).forEach((subKey) => {
//               csvContent += `  ${subKey}: ${item[subKey] || "N/A"}\n`;
//             });
//             if (index < value.length - 1) csvContent += "\n";
//           });
//         } else {
//           // Array of primitives
//           value.forEach((item, index) => {
//             csvContent += `${index + 1}. ${item}\n`;
//           });
//         }
//         csvContent += "\n";
//       } else if (typeof value === "object" && value !== null) {
//         // Handle nested objects
//         csvContent += `${key.toUpperCase()}\n`;
//         csvContent += "-".repeat(30) + "\n";
//         Object.keys(value).forEach((subKey) => {
//           csvContent += `${subKey}: ${value[subKey] || "N/A"}\n`;
//         });
//         csvContent += "\n";
//       } else {
//         // Handle primitive values
//         csvContent += `${key}: ${value || "N/A"}\n`;
//       }
//     });
//   });

//   // Write to file
//   fs.writeFileSync(filename, csvContent, "utf8");
//   return filename;
// }

// // Alternative function for traditional CSV format (flattened)
// function createTraditionalCsv(data, filename) {
//   if (!data || data.length === 0) {
//     throw new Error("No data to save");
//   }

//   // Flatten all objects in the data array
//   const flattenedData = data.map((item) => flattenObject(item));

//   // Get all unique keys from all flattened objects
//   const allKeys = new Set();
//   flattenedData.forEach((item) => {
//     Object.keys(item).forEach((key) => allKeys.add(key));
//   });

//   // Create headers
//   const headers = Array.from(allKeys).map((key) => ({ id: key, title: key }));

//   // Ensure all objects have all keys (fill missing with empty strings)
//   const normalizedData = flattenedData.map((item) => {
//     const normalizedItem = {};
//     allKeys.forEach((key) => {
//       normalizedItem[key] = item[key] || "";
//     });
//     return normalizedItem;
//   });

//   const csvWriter = createCsvWriter({
//     path: filename,
//     header: headers,
//   });

//   return csvWriter.writeRecords(normalizedData);
// }

// module.exports = {
//   createStructuredCsv,
//   createTraditionalCsv,
// };

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { flattenObject } = require("../utils/flatten");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

// Structured CSV (no formatting, for text editors)
function createStructuredCsv(data, filename) {
  if (!data || data.length === 0) throw new Error("No data to save");

  let csvContent = "";
  data.forEach((record, recordIndex) => {
    if (recordIndex > 0) csvContent += "\n";
    csvContent += `Record ${recordIndex + 1}\n` + "=".repeat(50) + "\n";

    Object.keys(record).forEach((key) => {
      const value = record[key];
      if (Array.isArray(value)) {
        csvContent += `${key.toUpperCase()}\n` + "-".repeat(30) + "\n";
        if (value.length === 0) {
          csvContent += "No data\n";
        } else if (typeof value[0] === "object" && value[0] !== null) {
          value.forEach((item, index) => {
            csvContent += `${key.slice(0, -1)} ${index + 1}:\n`;
            Object.keys(item).forEach((subKey) => {
              csvContent += `  ${subKey}: ${item[subKey] || "N/A"}\n`;
            });
            if (index < value.length - 1) csvContent += "\n";
          });
        } else {
          value.forEach((item, index) => {
            csvContent += `${index + 1}. ${item}\n`;
          });
        }
        csvContent += "\n";
      } else if (typeof value === "object" && value !== null) {
        csvContent += `${key.toUpperCase()}\n` + "-".repeat(30) + "\n";
        Object.keys(value).forEach((subKey) => {
          csvContent += `${subKey}: ${value[subKey] || "N/A"}\n`;
        });
        csvContent += "\n";
      } else {
        csvContent += `${key}: ${value || "N/A"}\n`;
      }
    });
  });

  fs.writeFileSync(filename, csvContent, "utf8");
  return filename;
}

// Flattened CSV (for traditional tools)
function createTraditionalCsv(data, filename) {
  if (!data || data.length === 0) throw new Error("No data to save");

  const flattenedData = data.map(flattenObject);
  const allKeys = new Set(flattenedData.flatMap((item) => Object.keys(item)));
  const headers = Array.from(allKeys).map((key) => ({ id: key, title: key }));

  const normalizedData = flattenedData.map((item) => {
    const normalizedItem = {};
    allKeys.forEach((key) => {
      normalizedItem[key] = item[key] || "";
    });
    return normalizedItem;
  });

  const csvWriter = createCsvWriter({
    path: filename,
    header: headers,
  });

  return csvWriter.writeRecords(normalizedData);
}

// 🆕 Excel Writer with Bold Headers
async function createExcelWithBoldHeaders(data, filename) {
  if (!data || data.length === 0) throw new Error("No data to save");

  const flattenedData = data.map(flattenObject);
  const allKeys = new Set(flattenedData.flatMap((item) => Object.keys(item)));
  const headers = Array.from(allKeys);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Processed Data");

  // Add header row and bold it
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
  });

  // Add the data rows
  flattenedData.forEach((item) => {
    const row = headers.map((key) => item[key] || "");
    worksheet.addRow(row);
  });

  // Save the file
  await workbook.xlsx.writeFile(filename);
  return filename;
}

// 🆕 Excel Formatter
async function formatExcelFile(command, filename) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const worksheet = workbook.getWorksheet(1);

  if (command.toLowerCase().includes("bold headers")) {
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });
  } else if (command.toLowerCase().startsWith("bold column")) {
    const columnName = command.split("'")[1];
    const headerRow = worksheet.getRow(1);
    let colIndex = -1;
    headerRow.eachCell((cell, colNumber) => {
      if (cell.value === columnName) {
        colIndex = colNumber;
      }
    });

    if (colIndex !== -1) {
      worksheet.getColumn(colIndex).eachCell((cell) => {
        cell.font = { bold: true };
      });
    }
  }

  await workbook.xlsx.writeFile(filename);
  return filename;
}

module.exports = {
  createStructuredCsv,
  createTraditionalCsv,
  createExcelWithBoldHeaders, // 👈 Export Excel creator
  formatExcelFile,
};
