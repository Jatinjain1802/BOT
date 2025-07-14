// Download the latest updated CSV or Excel file
const downloadUpdated = async (req, res) => {
  const format = req.query.format || "csv";
  let filePath, downloadName;
  if (format === "excel") {
    filePath = "./exports/updated_data.xlsx";
    downloadName = "updated_data.xlsx";
  } else {
    filePath = "./exports/updated_data.csv";
    downloadName = "updated_data.csv";
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: "No updated file found." });
  }
  res.download(filePath, downloadName);
};
// const fs = require("fs");
// const path = require("path");
// const { createStructuredCsv, createTraditionalCsv } = require("../services/csvWriter");
// const { getCsvData } = require("./pdfController");

// const previewCsv = async (req, res) => {
//   try {
//     const format = req.query.format || "structured";
//     const csvData = getCsvData();

//     if (csvData.length === 0) {
//       return res.status(400).json({ success: false, error: "No data available for preview" });
//     }

//     const tempFilename = `./exports/preview_${Date.now()}.csv`;
//     if (!fs.existsSync("./exports")) fs.mkdirSync("./exports");

//     if (format === "structured") {
//       createStructuredCsv(csvData.slice(0, 2), tempFilename);
//     } else {
//       await createTraditionalCsv(csvData.slice(0, 2), tempFilename);
//     }

//     const preview = fs.readFileSync(tempFilename, "utf8");
//     fs.unlinkSync(tempFilename);

//     res.json({ success: true, preview: preview + "\n... (showing first 2 records)" });
//   } catch (error) {
//     console.error("Error creating preview:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };






// const downloadCsv = async (req, res) => {
//   try {
//     const format = req.query.format || "structured";
//     const csvData = getCsvData();

//     if (csvData.length === 0) {
//       return res.status(400).json({ success: false, error: "No data available for download" });
//     }

//     const filename = `./exports/download_${Date.now()}.csv`;
//     if (!fs.existsSync("./exports")) fs.mkdirSync("./exports");

//     if (format === "structured") {
//       createStructuredCsv(csvData, filename);
//     } else {
//       await createTraditionalCsv(csvData, filename);
//     }

//     res.download(filename, "processed_data.csv", (err) => {
//       if (err) console.error("Download error:", err);
//       setTimeout(() => fs.existsSync(filename) && fs.unlinkSync(filename), 10000);
//     });
//   } catch (error) {
//     console.error("Error downloading file:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// module.exports = { previewCsv, downloadCsv };

const fs = require("fs");
const path = require("path");
const {
  createStructuredCsv,
  createTraditionalCsv,
  createExcelWithBoldHeaders,
} = require("../services/csvWriter");
const { getCsvData } = require("./pdfController");

const previewCsv = async (req, res) => {
  try {
    const format = req.query.format || "structured";
    const csvData = getCsvData();

    if (csvData.length === 0) {
      return res.status(400).json({ success: false, error: "No data available for preview" });
    }

    const tempFilename = `./exports/preview_${Date.now()}.${format === "structured" ? "csv" : "xlsx"}`;

    if (!fs.existsSync("./exports")) fs.mkdirSync("./exports");

    if (format === "structured") {
  createStructuredCsv(csvData.slice(0, 2), tempFilename);
} else {
  await createExcelWithBoldHeaders(csvData.slice(0, 2), tempFilename);
}


   let preview;
if (format === "structured") {
  preview = fs.readFileSync(tempFilename, "utf8");
} else {
  preview = "Preview not available for Excel format. Please download the file.";
}


    fs.unlinkSync(tempFilename);

    res.json({ success: true, preview: preview + "\n... (showing first 2 records)" });
  } catch (error) {
    console.error("Error creating preview:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const downloadCsv = async (req, res) => {
  try {
    const format = req.query.format || "structured";
    const csvData = getCsvData();

    if (csvData.length === 0) {
      return res.status(400).json({ success: false, error: "No data available for download" });
    }

    if (!fs.existsSync("./exports")) fs.mkdirSync("./exports");

    const timestamp = Date.now();
    let filePath, downloadName;

    if (format === "structured") {
        filePath = `./exports/download_${timestamp}.csv`;
        downloadName = "processed_data.csv";
        createStructuredCsv(csvData, filePath);
    } else if (format === "traditional") {
        filePath = `./exports/download_${timestamp}.csv`;
        downloadName = "processed_data.csv";
        await createTraditionalCsv(csvData, filePath);
    } else if (format === "excel") {
        filePath = `./exports/download_${timestamp}.xlsx`;
        downloadName = "processed_data.xlsx";
        await createExcelWithBoldHeaders(csvData, filePath);
    } else {
        return res.status(400).json({ success: false, error: "Invalid format requested." });
    }


    res.download(filePath, downloadName, (err) => {
      if (err) console.error("Download error:", err);
      setTimeout(() => fs.existsSync(filePath) && fs.unlinkSync(filePath), 10000);
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { previewCsv, downloadCsv, downloadUpdated };
