# GIF Checker - YB

A web application to analyze GIF files for duration and loop count.

## Features

- Upload GIF files via drag-and-drop or file browser
- Analyze GIF properties:
  - Total duration in seconds
  - Loop count (including infinite loops)
  - Whether duration exceeds 15 seconds
  - Whether the GIF loops more than 3 times
  - Whether the GIF is animated
- Clean, modern UI with real-time analysis results

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Upload a GIF file and click "Analyze GIF" to see the results.

## Technical Details

The application uses:
- **Express** for the web server
- **Multer** for handling file uploads
- **Custom GIF parser** to extract duration and loop count from GIF metadata

The GIF parser reads:
- Frame delay times from Graphic Control Extensions
- Loop count from NETSCAPE2.0 Application Extension
- Frame count to determine if the GIF is animated

## Project Structure

```
YB-Gif-Checker/
├── public/
│   └── index.html      # Frontend interface
├── uploads/            # Temporary upload directory (auto-cleaned)
├── server.js           # Express server and GIF parser
├── package.json        # Dependencies
└── README.md          # This file
```

## API Endpoint

### POST /upload
Upload and analyze a GIF file.

**Request:**
- Content-Type: multipart/form-data
- Body: gifFile (file)

**Response:**
```json
{
  "success": true,
  "filename": "example.gif",
  "analysis": {
    "frameCount": 10,
    "durationSeconds": 2.5,
    "loopCount": 5,
    "exceedsDuration": false,
    "exceedsLoops": true,
    "isAnimated": true
  }
}
```
