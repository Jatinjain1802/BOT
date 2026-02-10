const { generateChartConfig } = require("../services/analysisService");
const { getCsvData } = require("./pdfController");

const analyzeDataHandler = async (req, res) => {
    try {
        const currentData = getCsvData();

        if (!currentData || currentData.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No data available to analyze. Please upload a PDF first."
            });
        }

        const visualizationConfig = await generateChartConfig(currentData);

        res.json({
            success: true,
            data: visualizationConfig
        });

    } catch (error) {
        console.error("Analysis error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to generate analysis: " + error.message
        });
    }
};

module.exports = { analyzeDataHandler };
