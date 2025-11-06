const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/gif') {
      cb(null, true);
    } else {
      cb(new Error('Only .gif files are allowed!'), false);
    }
  }
});

// Serve static files from public directory
app.use(express.static('public'));

// GIF Analysis Function
function analyzeGif(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, buffer) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const analysis = parseGif(buffer);
        resolve(analysis);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseGif(buffer) {
  let offset = 0;

  // Check GIF signature
  const signature = buffer.toString('ascii', 0, 6);
  if (!signature.startsWith('GIF')) {
    throw new Error('Not a valid GIF file');
  }
  offset = 6;

  // Skip Logical Screen Descriptor (7 bytes)
  const packed = buffer[offset + 4];
  const hasGlobalColorTable = (packed & 0x80) !== 0;
  const globalColorTableSize = 2 << (packed & 0x07);
  offset += 7;

  // Skip Global Color Table if present
  if (hasGlobalColorTable) {
    offset += globalColorTableSize * 3;
  }

  let frameCount = 0;
  let totalDelayTime = 0; // in centiseconds (1/100 second)
  let loopCount = null;

  // Parse data stream
  while (offset < buffer.length) {
    const block = buffer[offset];

    // Extension block (0x21)
    if (block === 0x21) {
      const label = buffer[offset + 1];

      // Application Extension (0xFF) - contains loop count
      if (label === 0xFF) {
        const blockSize = buffer[offset + 2];
        const appName = buffer.toString('ascii', offset + 3, offset + 3 + blockSize);

        if (appName.startsWith('NETSCAPE')) {
          // Read sub-blocks
          let subOffset = offset + 3 + blockSize;
          while (buffer[subOffset] !== 0x00) {
            const subBlockSize = buffer[subOffset];
            if (subBlockSize >= 3 && buffer[subOffset + 1] === 0x01) {
              // Loop count is stored in little-endian format
              loopCount = buffer[subOffset + 2] | (buffer[subOffset + 3] << 8);
            }
            subOffset += subBlockSize + 1;
          }
        }
        offset += 2 + blockSize;
        offset = skipSubBlocks(buffer, offset);
      }
      // Graphic Control Extension (0xF9) - contains frame delay
      else if (label === 0xF9) {
        const blockSize = buffer[offset + 2];
        // Delay time is at offset 4-5 (in centiseconds)
        const delayTime = buffer[offset + 4] | (buffer[offset + 5] << 8);
        totalDelayTime += delayTime;
        offset += 3 + blockSize;
        offset = skipSubBlocks(buffer, offset);
      }
      // Other extensions
      else {
        offset += 2;
        const blockSize = buffer[offset];
        offset += 1 + blockSize;
        offset = skipSubBlocks(buffer, offset);
      }
    }
    // Image descriptor (0x2C)
    else if (block === 0x2C) {
      frameCount++;
      offset += 1;

      // Skip image descriptor (9 bytes)
      const packed = buffer[offset + 8];
      const hasLocalColorTable = (packed & 0x80) !== 0;
      const localColorTableSize = hasLocalColorTable ? 2 << (packed & 0x07) : 0;
      offset += 9;

      // Skip local color table
      if (hasLocalColorTable) {
        offset += localColorTableSize * 3;
      }

      // Skip LZW minimum code size
      offset += 1;

      // Skip image data sub-blocks
      offset = skipSubBlocks(buffer, offset);
    }
    // Trailer (0x3B) - end of GIF
    else if (block === 0x3B) {
      break;
    }
    // Unknown block, skip it
    else {
      offset++;
    }
  }

  // Calculate total duration in seconds
  const durationSeconds = totalDelayTime / 100;

  // Calculate total loops
  // loopCount 0 means infinite loops
  // If no loop count specified, GIF plays once (loopCount = 1)
  if (loopCount === null) {
    loopCount = 1; // Plays once
  } else if (loopCount === 0) {
    loopCount = Infinity; // Infinite loops
  } else {
    loopCount = loopCount + 1; // NETSCAPE extension stores loops - 1
  }

  const totalLoops = loopCount === Infinity ? Infinity : loopCount;

  return {
    frameCount,
    durationSeconds: parseFloat(durationSeconds.toFixed(2)),
    loopCount: totalLoops,
    exceedsDuration: durationSeconds > 15,
    exceedsLoops: totalLoops > 3,
    isAnimated: frameCount > 1
  };
}

function skipSubBlocks(buffer, offset) {
  while (offset < buffer.length) {
    const blockSize = buffer[offset];
    if (blockSize === 0) {
      offset++;
      break;
    }
    offset += blockSize + 1;
  }
  return offset;
}

// Upload endpoint
app.post('/upload', upload.single('gifFile'), async (req, res) => {
  console.log('Upload request received');

  if (!req.file) {
    console.log('No file in request');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log('File received:', req.file.originalname, 'Size:', req.file.size);

  try {
    const analysis = await analyzeGif(req.file.path);
    console.log('Analysis complete:', analysis);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      filename: req.file.originalname,
      analysis: analysis
    });
  } catch (error) {
    console.error('Error analyzing GIF:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({
      error: 'Error analyzing GIF',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  res.status(500).json({ error: err.message || 'Server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`GIF Checker server running at http://localhost:${PORT}`);
});
