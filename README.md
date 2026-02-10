# SheetSage AI

**Project Name:** `SheetSage AI`

SheetSage AI is an AI-powered PDF-to-data backend that extracts structured information from documents, lets you transform that data using natural language, and exports the final output as CSV or Excel.

## Why This Name

`SheetSage AI` combines:
- `Sheet`: spreadsheet-ready outputs (CSV/XLSX)
- `Sage`: intelligent AI-guided extraction, transformation, and analysis

## What This Project Does

1. Accepts PDF uploads.
2. Extracts structured JSON from PDF text using Groq.
3. Allows chat-based data manipulation (add/update/filter/sort/format).
4. Exports data in structured CSV, traditional CSV, or Excel.
5. Generates chart-ready analysis from the current dataset.

## Key Features

- PDF upload and parsing with `multer` + `pdf-parse`
- AI-based structured extraction from PDF content
- AI command processing for dataset transformations
- Export options:
  - Structured CSV
  - Traditional flattened CSV
  - Excel (`.xlsx`) with bold headers
- Analysis endpoint that returns summary + chart configs
- Built-in web UI served from `/`

## Tech Stack

- Node.js
- Express
- Groq SDK (`groq-sdk`)
- `pdf-parse`
- `multer`
- `csv-writer`
- `exceljs`
- `cors`, `dotenv`

## Project Structure

```text
.
|-- config/
|-- controller/
|-- middleware/
|-- routes/
|-- services/
|-- utils/
|-- uploads/
|-- exports/
|-- index.js
|-- package.json
```

## Prerequisites

- Node.js 18+
- npm
- Groq API key

## Installation

```bash
npm install
```

## Environment Setup

Create `.env` in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Security note:
- Keep `.env` private.
- If your key was ever exposed, rotate it immediately.

## Run

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Server URL:

```text
http://localhost:3000
```

Note: current code uses a fixed port (`3000`) in `index.js`.

## API Endpoints

### `POST /upload-pdf`

Uploads and processes a PDF file.

- Content type: `multipart/form-data`
- Field name: `pdf`

Example:

```bash
curl -X POST http://localhost:3000/upload-pdf -F "pdf=@/path/to/file.pdf"
```

### `POST /chat`

Applies natural-language commands to the current dataset (or handles normal assistant chat).

- Content type: `application/json`
- Body:

```json
{
  "command": "Sort data by name and filter rows where amount is empty"
}
```

Example:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"Add a new column named source with value imported\"}"
```

### `GET /preview-csv?format=structured|traditional|excel`

Returns a preview response for export content.

Current behavior:
- `structured`: text preview is returned
- `traditional` and `excel`: returns a message that direct preview is not available

### `GET /download-csv?format=structured|traditional|excel`

Downloads processed data.

- `structured` -> `processed_data.csv`
- `traditional` -> `processed_data.csv` (flattened)
- `excel` -> `processed_data.xlsx`

### `GET /download-updated?format=csv|excel`

Downloads the latest AI-updated export.

- `csv` (default) -> `updated_data.csv`
- `excel` -> `updated_data.xlsx`

### `GET /analyze`

Returns aggregated visualization config and summary for current data.

## Built-In UI Flow

1. Open `http://localhost:3000`
2. Upload a PDF
3. Send chat commands
4. Preview exports
5. Download CSV/Excel
6. Generate analysis/charts

## Example Chat Commands

- `Create CSV file from uploaded PDF`
- `Add new column named status with value active`
- `Filter data where city is Delhi`
- `Sort data alphabetically by name`
- `Update email for John Doe`
- `Format Excel with bold headers`
- `bold column 'name'`

## Data Storage Behavior

- Active dataset is held in memory (`csvData` in `pdfController`).
- Updated files are written to:
  - `exports/updated_data.csv`
  - `exports/updated_data.xlsx`

Implications:
- Restarting server clears in-memory dataset.
- Current data state is process-level and shared (no user isolation).

## Error Notes

Common cases:
- Missing upload -> `No PDF file uploaded`
- Chat before upload -> `No PDF data available. Please upload a PDF first.`
- Invalid format -> `Invalid format requested.`
- AI JSON parse issues can surface as extraction/processing errors

## Current Limitations

- No authentication/authorization
- No persistent database
- Shared global in-memory state
- AI response may occasionally be non-parseable JSON
- Frontend mentions 10MB support, but backend size limits are not explicitly enforced

## Recommended Next Improvements

1. Add auth and user-scoped datasets.
2. Persist data in a database/object storage.
3. Add strict schema validation for AI output.
4. Add upload size/type limits in middleware.
5. Add controller/service tests.
6. Support `PORT` via environment variable.

## License

MIT
