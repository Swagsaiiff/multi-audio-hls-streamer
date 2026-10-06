import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
import ffprobeStatic from '@ffprobe-installer/ffprobe';

const GYAN_FFMPEG = 'C:\\Users\\masum\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe';
const GYAN_FFPROBE = 'C:\\Users\\masum\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffprobe.exe';

export function getFfmpegPath() {
  if (fs.existsSync(GYAN_FFMPEG)) return GYAN_FFMPEG;
  if (ffmpegStatic && ffmpegStatic.path && fs.existsSync(ffmpegStatic.path)) return ffmpegStatic.path;
  return 'ffmpeg';
}

export function getFfprobePath() {
  if (fs.existsSync(GYAN_FFPROBE)) return GYAN_FFPROBE;
  if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) return ffprobeStatic.path;
  return 'ffprobe';
}

/**
 * Formats request headers into standard CRLF format for FFmpeg/FFprobe HTTP client
 * @param {Object|string} headers
 * @returns {string}
 */
export function formatHeaderString(headers = {}) {
  if (!headers) return '';
  if (typeof headers === 'string') {
    return headers.endsWith('\r\n') ? headers : `${headers}\r\n`;
  }
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n') + '\r\n';
}

/**
 * Probes the local or remote media source and returns video & audio stream metadata
 * @param {string} inputSource File path or HTTP/HTTPS remote URL
 * @param {Object|string} [headers] Optional HTTP request headers for remote URL
 * @returns {Promise<Object>}
 */
export function probeMedia(inputSource, headers = {}) {
  return new Promise((resolve, reject) => {
    const ffprobe = getFfprobePath();
    const args = ['-v', 'error'];

    const isRemote = inputSource.startsWith('http://') || inputSource.startsWith('https://');
    if (isRemote) {
      args.push(
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      );
      const headerStr = formatHeaderString(headers);
      if (headerStr) {
        args.push('-headers', headerStr);
      }
    }

    args.push(
      '-show_format',
      '-show_streams',
      '-of', 'json',
      inputSource
    );

    execFile(ffprobe, args, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`ffprobe failed on ${inputSource}: ${stderr || err.message}`));
      }
      try {
        const data = JSON.parse(stdout);
        const format = data.format || {};
        const streams = data.streams || [];

        // Primary video stream (ignore attached images/thumbnails)
        const videoStreams = streams.filter(s => s.codec_type === 'video' && s.codec_name !== 'png' && s.codec_name !== 'mjpeg');
        const primaryVideo = videoStreams[0] || null;

        // Audio streams
        const audioStreams = streams
          .filter(s => s.codec_type === 'audio')
          .map((s, idx) => {
            const lang = s.tags?.language || `trk${idx + 1}`;
            const title = s.tags?.title || (lang === 'hin' ? 'Hindi' : lang === 'eng' ? 'English' : `Audio Track ${idx + 1}`);
            const name = lang === 'hin' ? 'Hindi' : lang === 'eng' ? 'English' : title;
            return {
              index: s.index,
              audioIndex: idx,
              codec_name: s.codec_name,
              channels: s.channels || 2,
              language: lang,
              title: title,
              displayName: name
            };
          });

        let fps = 0;
        if (primaryVideo && primaryVideo.r_frame_rate) {
          try {
            const [num, den] = primaryVideo.r_frame_rate.split('/');
            fps = den && den !== '0' ? parseFloat(num) / parseFloat(den) : parseFloat(num || 0);
          } catch {
            fps = 0;
          }
        }

        resolve({
          inputSource,
          isRemote,
          duration: parseFloat(format.duration || 0),
          bitRate: parseInt(format.bit_rate || 0, 10),
          video: primaryVideo ? {
            index: primaryVideo.index,
            codec_name: primaryVideo.codec_name,
            width: primaryVideo.width,
            height: primaryVideo.height,
            fps: fps
          } : null,
          audioTracks: audioStreams
        });
      } catch (parseErr) {
        reject(new Error(`Failed to parse ffprobe JSON for ${inputSource}: ${parseErr.message}`));
      }
    });
  });
}
