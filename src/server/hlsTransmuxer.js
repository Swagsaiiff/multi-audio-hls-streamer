import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import EventEmitter from 'events';
import { getFfmpegPath, probeMedia, formatHeaderString } from './ffmpegUtils.js';

export class HlsTransmuxer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.outputBaseDir = options.outputDir || path.resolve('./temp/hls');
    this.currentProcess = null;
    this.status = 'idle'; // idle | probing | transmuxing | ready | error
    this.progress = 0;
    this.probeData = null;
    this.error = null;
    this.currentSource = null;
    this.currentHeaders = null;
  }

  /**
   * Cleans old segments/playlists from the output directory
   */
  ensureOutputDir() {
    if (!fs.existsSync(this.outputBaseDir)) {
      fs.mkdirSync(this.outputBaseDir, { recursive: true });
      return;
    }

    try {
      const items = fs.readdirSync(this.outputBaseDir);
      for (const item of items) {
        const itemPath = path.join(this.outputBaseDir, item);
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } catch (e) {
          console.warn(`[HlsTransmuxer] Cleanup notice for ${item}:`, e.message);
        }
      }
    } catch (err) {
      console.warn('[HlsTransmuxer] Error during directory clean:', err.message);
    }
  }

  /**
   * Starts transmuxing the media (local file path or remote HTTP/HTTPS URL) into a multi-audio HLS stream
   * @param {string} inputSource File path or remote URL
   * @param {Object} [options]
   * @param {Object|string} [options.headers] Request headers for remote streaming link
   * @returns {Promise<Object>}
   */
  async start(inputSource, options = {}) {
    if (this.currentProcess) {
      console.log('[HlsTransmuxer] Terminating existing FFmpeg process...');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
      // Brief pause to allow Windows file locks to release
      await new Promise(r => setTimeout(r, 200));
    }

    this.currentSource = inputSource;
    this.currentHeaders = options.headers || null;
    this.status = 'probing';
    this.progress = 0;
    this.error = null;
    this.emit('status', { status: this.status, progress: 0, inputSource });

    try {
      console.log(`[HlsTransmuxer] Probing source: ${inputSource}`);
      this.probeData = await probeMedia(inputSource, this.currentHeaders);
      console.log('[HlsTransmuxer] Probed media info successfully:', {
        duration: this.probeData.duration,
        video: this.probeData.video,
        audioTracksCount: this.probeData.audioTracks.length
      });
    } catch (err) {
      this.status = 'error';
      this.error = err.message;
      this.emit('status', { status: this.status, error: this.error });
      throw err;
    }

    this.ensureOutputDir();
    this.status = 'transmuxing';
    this.emit('status', { status: this.status, progress: 0 });

    const ffmpegPath = getFfmpegPath();
    const args = ['-y'];

    // If source is a remote URL, add network reconnection & HTTP headers
    const isRemote = inputSource.startsWith('http://') || inputSource.startsWith('https://');
    if (isRemote) {
      args.push(
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      );
      const headerStr = formatHeaderString(this.currentHeaders);
      if (headerStr) {
        args.push('-headers', headerStr);
      }
    }

    args.push('-i', inputSource);

    // 1. Map video stream and transcode to H.264 (AVC) for broad browser compatibility
    if (this.probeData.video) {
      args.push(
        '-map', `0:${this.probeData.video.index}`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p'
      );
    }

    // 2. Map all audio tracks and transcode to AAC
    const varStreamMapParts = [];
    if (this.probeData.video) {
      varStreamMapParts.push('v:0,agroup:audio,default:yes');
    }

    this.probeData.audioTracks.forEach((track, idx) => {
      args.push(
        '-map', `0:${track.index}`,
        `-c:a:${idx}`, 'aac',
        `-b:a:${idx}`, '192k',
        `-ac:a:${idx}`, `${Math.min(track.channels || 2, 2)}`
      );

      const isDefault = idx === 0 ? 'yes' : 'no';
      const lang = track.language || `und`;
      // Sanitize name for FFmpeg var_stream_map (no spaces/symbols)
      const safeName = (track.displayName || track.title || `Track_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      varStreamMapParts.push(`a:${idx},agroup:audio,language:${lang},name:${safeName},default:${isDefault}`);
    });

    const varStreamMap = varStreamMapParts.join(' ');
    const outPosix = this.outputBaseDir.replace(/\\/g, '/');
    const segmentPattern = `${outPosix}/v%v/segment_%04d.ts`;
    const playlistPattern = `${outPosix}/v%v/playlist.m3u8`;

    args.push(
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '0',
      '-hls_flags', 'independent_segments',
      '-hls_segment_type', 'mpegts',
      '-master_pl_name', 'master.m3u8',
      '-hls_segment_filename', segmentPattern,
      '-var_stream_map', varStreamMap,
      playlistPattern
    );

    console.log(`[HlsTransmuxer] Spawning FFmpeg process:\n${ffmpegPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      this.currentProcess = proc;

      const duration = this.probeData.duration || 1;
      let masterPlaylistReady = false;

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        // Extract time progress (e.g. time=00:01:23.45)
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseFloat(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          this.progress = Math.min(100, Math.round((currentTime / duration) * 100));
          this.emit('progress', { progress: this.progress, currentTime, duration });
        }

        // Check if master playlist is created on disk
        if (!masterPlaylistReady) {
          const masterPath = path.join(this.outputBaseDir, 'master.m3u8');
          if (fs.existsSync(masterPath)) {
            masterPlaylistReady = true;
            this.emit('ready', { masterPlaylist: masterPath, probeData: this.probeData });
          }
        }
      });

      proc.on('error', (err) => {
        console.error('[HlsTransmuxer] Process error:', err);
        this.status = 'error';
        this.error = err.message;
        this.emit('status', { status: this.status, error: this.error });
        reject(err);
      });

      proc.on('close', (code) => {
        this.currentProcess = null;
        if (code === 0 || code === 255) {
          this.status = 'ready';
          this.progress = 100;
          console.log('[HlsTransmuxer] Transmuxing completed successfully.');
          this.emit('completed', { outputDir: this.outputBaseDir });
          resolve({ outputDir: this.outputBaseDir, probeData: this.probeData });
        } else {
          this.status = 'error';
          this.error = `FFmpeg exited with code ${code}`;
          console.error(`[HlsTransmuxer] ${this.error}`);
          this.emit('status', { status: this.status, error: this.error });
          reject(new Error(this.error));
        }
      });

      // Poll briefly to resolve as soon as master.m3u8 is written (live streaming mode)
      const checkInterval = setInterval(() => {
        const masterPath = path.join(this.outputBaseDir, 'master.m3u8');
        if (fs.existsSync(masterPath)) {
          clearInterval(checkInterval);
          if (!masterPlaylistReady) {
            masterPlaylistReady = true;
            this.emit('ready', { masterPlaylist: masterPath, probeData: this.probeData });
          }
          resolve({ outputDir: this.outputBaseDir, probeData: this.probeData });
        }
      }, 500);

      setTimeout(() => {
        clearInterval(checkInterval);
      }, 15000);
    });
  }

  getStatus() {
    const masterPath = path.join(this.outputBaseDir, 'master.m3u8');
    const isReady = fs.existsSync(masterPath);
    return {
      status: this.status,
      isPlaylistReady: isReady,
      progress: this.progress,
      currentSource: this.currentSource,
      probeData: this.probeData,
      error: this.error
    };
  }
}
