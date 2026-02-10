# ParsePilot AI

ParsePilot AI is an Express-based backend that turns PDFs into structured data, lets you modify that data through chat commands, and exports results as CSV or Excel.

## Why this name?

`ParsePilot AI` reflects what this product does: it pilots document parsing and data transformation from upload to export.

## Features

- Upload a PDF and extract structured JSON using Groq.
- Convert extracted data into:
  - Structured CSV
  - Traditional (flattened) CSV
  - Excel (`.xlsx`) with bold headers
- Chat-driven data operations (add, update, remove, filter, sort, format).
- Download latest modified data (`updated_data.csv` / `updated_data.xlsx`).
- Generate chart-ready analysis data and visualize it in the built-in UI.

## Tech Stack

- Node.js + Express
- Groq API (`groq-sdk`)
- `pdf-parse`, `multer`, `csv-writer`, `exceljs`

## Prerequisites

- Node.js 18+
- A Groq API key

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Run the app:

```bash
npm run dev
```

or

```bash
npm start
```

Server runs at:

- `http://localhost:3000`

## API Endpoints

- `POST /upload-pdf`
  - Form-data field: `pdf`
  - Uploads and processes a PDF
- `POST /chat`
  - JSON body: `{ "command": "your instruction" }`
  - Applies AI-assisted data manipulation or normal chat response
- `GET /preview-csv?format=structured|traditional|excel`
  - Preview export output
- `GET /download-csv?format=structured|traditional|excel`
  - Download processed file
- `GET /download-updated?format=csv|excel`
  - Download latest updated file after chat edits
- `GET /analyze`
  - Generate aggregated chart configurations + summary

## Typical Flow

1. Upload a PDF via `/upload-pdf`.
2. Send commands via `/chat` to refine data.
3. Preview and download using `/preview-csv` and `/download-csv`.
4. Use `/analyze` for chart insights.

## Notes

- Uploaded files are stored temporarily in `uploads/`.
- Generated files are stored in `exports/`.
- Keep your API key private and never commit `.env`.

## License

MIT
