# AI PDF to CSV Agent

This project is an AI-powered agent that can extract structured data from PDF files and convert it into CSV or Excel format. The agent also provides a chat interface that allows users to manipulate the data using natural language commands.

## Features

*   **PDF to CSV/Excel Conversion:** Upload a PDF file and the agent will automatically extract the data and convert it into a structured CSV or Excel file.
*   **Chat Interface:** Use the chat interface to manipulate the data using natural language commands. For example, you can:
    *   Add or remove columns
    *   Filter or sort the data
    *   Update cell values
*   **Excel Formatting:** Format the Excel file using natural language commands. For example, you can:
    *   Make the headers bold
    *   Bold a specific column
    *   Bold a specific cell

## How to Use

1.  **Upload a PDF file:** Drag and drop a PDF file into the upload area or click to browse for a file.
2.  **Choose an export format:** Select whether you want to export the data as a structured CSV, traditional CSV, or Excel file.
3.  **Use the chat interface to manipulate the data:** Type your commands into the chat input area and press Ctrl+Enter to send.
4.  **Download the processed data:** Click the "Download" button to download the processed data in the selected format.

## Technologies Used

*   **Node.js:** The backend is built using Node.js and Express.
*   **pdf-parse:** Used to extract text from PDF files.
*   **exceljs:** Used to create and manipulate Excel files.
*   **Groq:** The AI assistant is powered by the Groq API.
*   **Tailwind CSS:** The frontend is styled using Tailwind CSS.
*   **Feather Icons:** Used for the icons in the user interface.
