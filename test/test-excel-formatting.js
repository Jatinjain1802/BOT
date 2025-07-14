const fs = require("fs");
const { createExcelFromStructuredCsv, formatExcelFile } = require("../services/csvWriter");

async function runTest() {
  const testData = [
    {
      "Record 1": {
        name: "John Doe",
        date: "2023-01-15",
        details: [
          { item: "item1", value: "value1" },
          { item: "item2", value: "value2" },
        ],
      },
    },
    {
      "Record 2": {
        name: "Jane Smith",
        date: "2023-02-20",
        details: [
          { item: "item3", value: "value3" },
          { item: "item4", value: "value4" },
        ],
      },
    },
  ];
  const testFilename = "./exports/test_format.xlsx";

  // 1. Create a test Excel file
  await createExcelFromStructuredCsv(testData, testFilename);
  console.log("Test Excel file created.");

  // 2. Format the file
  await formatExcelFile("bold 'Jane Smith' in column 'name'", testFilename);
  console.log("Formatting applied to 'Jane Smith' in 'name' column.");

  // 3. Verify the formatting and data integrity
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(testFilename);
  const worksheet = workbook.getWorksheet(1);

  let janeSmithCell;
  worksheet.eachRow((row) => {
    if (row.getCell(3).value === "Jane Smith") {
      janeSmithCell = row.getCell(3);
    }
  });

  if (!janeSmithCell) {
    console.error("TEST FAILED: Could not find 'Jane Smith' cell.");
    return;
  }

  if (!janeSmithCell.font || !janeSmithCell.font.bold) {
    console.error("TEST FAILED: 'Jane Smith' cell is not bold.");
  }

  console.log("Test completed successfully!");

  // Clean up the test file
  fs.unlinkSync(testFilename);
}

runTest();
