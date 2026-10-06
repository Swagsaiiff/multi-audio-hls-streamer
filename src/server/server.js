import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HlsTransmuxer } from './hlsTransmuxer.js';
import { probeMedia } from './ffmpegUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_MEDIA_FILE = path.resolve('./media/test.mkv');
const HLS_OUTPUT_DIR = path.resolve('./temp/hls');

const transmuxer = new HlsTransmuxer({ outputDir: HLS_OUTPUT_DIR });

// Enable CORS for all origins
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend player
app.use(express.static(path.resolve('./public')));

// Serve HLS streams (.m3u8 & .ts) with explicit MIME types and cache headers
app.use('/hls', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');

  // If path contains backslashes, rewrite URL internally
  if (req.url.includes('\\')) {
    req.url = req.url.replace(/\\/g, '/');
  }

  if (req.path.endsWith('.m3u8')) {
    res.type('application/x-mpegURL');
  } else if (req.path.endsWith('.ts')) {
    res.type('video/mp2t');
  }
  next();
}, express.static(HLS_OUTPUT_DIR));

// Dynamic Streaming API: /api/stream?url=...
app.all('/api/stream', async (req, res) => {
  try {
    const rawUrl = req.query.url || req.body?.url;
    const headers = req.body?.headers || req.query.headers || null;

    let targetSource = rawUrl ? String(rawUrl).trim() : null;

    if (!targetSource) {
      if (fs.existsSync(DEFAULT_MEDIA_FILE)) {
        targetSource = DEFAULT_MEDIA_FILE;
      } else {
        return res.status(400).json({ error: 'Please provide a valid remote URL or local file path via ?url=...' });
      }
    }

    console.log(`[API /api/stream] Received request to stream source: ${targetSource}`);

    // Parse custom headers if passed as JSON string
    let parsedHeaders = headers;
    if (typeof headers === 'string') {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        parsedHeaders = headers;
      }
    }

    // Trigger transmuxer asynchronously
    transmuxer.start(targetSource, { headers: parsedHeaders }).catch(err => {
      console.error('[API /api/stream] Transmuxer runtime error:', err.message);
    });

    res.json({
      success: true,
      message: 'Transmuxing pipeline initialized',
      source: targetSource,
      streamUrl: '/hls/master.m3u8'
    });
  } catch (err) {
    console.error('[API /api/stream] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Probe Media Information (local or remote URL)
app.get('/api/media/info', async (req, res) => {
  try {
    const target = req.query.url ? String(req.query.url).trim() : DEFAULT_MEDIA_FILE;
    if (!target.startsWith('http://') && !target.startsWith('https://') && !fs.existsSync(target)) {
      return res.status(404).json({ error: `Media file not found at ${target}` });
    }
    const info = await probeMedia(target, req.query.headers);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Check Transmuxing Status & Progress
app.get('/api/media/status', (req, res) => {
  res.json(transmuxer.getStatus());
});

// Start Server
app.listen(PORT, () => {
  console.log('================================================================');
  console.log(`🎬 Multi-Audio Streaming Engine running on http://localhost:${PORT}`);
  console.log(`📺 Web Player accessible at: http://localhost:${PORT}`);
  console.log(`📡 Dynamic Stream API: http://localhost:${PORT}/api/stream?url=<VIDEO_URL>`);
  console.log(`📡 HLS Master Playlist: http://localhost:${PORT}/hls/master.m3u8`);
  console.log('================================================================\n');

  // Auto-start default sample if available
  if (fs.existsSync(DEFAULT_MEDIA_FILE)) {
    console.log(`[Auto-Start] Initiating default sample: ${DEFAULT_MEDIA_FILE}`);
    transmuxer.start(DEFAULT_MEDIA_FILE).catch(err => {
      console.error('[Auto-Start] Transmuxer startup error:', err.message);
    });
  }
});
