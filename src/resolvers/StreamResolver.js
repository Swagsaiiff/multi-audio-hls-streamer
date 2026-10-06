import * as cheerio from 'cheerio';

export class StreamResolver {
  /**
   * Determine MIME type based on file extension or URL patterns
   * @param {string} url
   * @param {string} [declaredType]
   * @returns {string} Standard MIME type
   */
  static detectMimeType(url, declaredType = '') {
    if (declaredType) return declaredType;

    const cleanUrl = url.split('?')[0].toLowerCase();

    if (cleanUrl.endsWith('.m3u8')) {
      return 'application/x-mpegURL'; // HLS Stream
    }
    if (cleanUrl.endsWith('.mpd')) {
      return 'application/dash+xml'; // MPEG-DASH Stream
    }
    if (cleanUrl.endsWith('.mkv')) {
      return 'video/x-matroska'; // Matroska Container
    }
    if (cleanUrl.endsWith('.mp4')) {
      return 'video/mp4'; // MP4 Container
    }
    if (cleanUrl.endsWith('.webm')) {
      return 'video/webm'; // WebM Container
    }
    if (cleanUrl.endsWith('.ts')) {
      return 'video/mp2t'; // MPEG-2 Transport Stream
    }

    // Default fallback container
    return 'video/mp4';
  }

  /**
   * Evaluates and extracts packed JavaScript (Dean Edwards Packer)
   * @param {string} packedCode
   * @returns {string} Unpacked script
   */
  static unpackJs(packedCode) {
    try {
      const match = packedCode.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\}\((.+?)\)\)/);
      if (!match) return packedCode;

      // Extract arguments: p, a, c, k, e, d
      const argsRegex = /'([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/;
      const parsed = match[1].match(argsRegex);
      if (!parsed) return packedCode;

      let [_, payload, radixStr, countStr, symStr] = parsed;
      const radix = parseInt(radixStr, 10);
      const count = parseInt(countStr, 10);
      const symbols = symStr.split('|');

      const unbase = (val, r) => {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (val < r) return chars[val];
        return unbase(Math.floor(val / r), r) + chars[val % r];
      };

      for (let i = count - 1; i >= 0; i--) {
        const key = unbase(i, radix);
        if (symbols[i]) {
          const regex = new RegExp(`\\b${key}\\b`, 'g');
          payload = payload.replace(regex, symbols[i]);
        }
      }
      return payload;
    } catch {
      return packedCode;
    }
  }

  /**
   * Parse HTML with Cheerio to extract direct streams, sources, and embedded configurations
   * @param {string} html
   * @param {string} refererUrl
   * @returns {Array<{url: string, mimeType: string, quality?: string, headers: Object}>}
   */
  static parseStreamsFromHtml(html, refererUrl = '') {
    const $ = cheerio.load(html);
    const streams = [];

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(refererUrl ? { 'Referer': refererUrl, 'Origin': new URL(refererUrl).origin } : {})
    };

    // 1. Direct <video> and <source> elements
    $('video source, video').each((_, el) => {
      const src = $(el).attr('src');
      const type = $(el).attr('type') || '';
      const quality = $(el).attr('data-quality') || $(el).attr('label') || 'Auto';

      if (src && !src.startsWith('blob:')) {
        streams.push({
          url: src,
          mimeType: this.detectMimeType(src, type),
          quality,
          headers: { ...defaultHeaders }
        });
      }
    });

    // 2. Embedded JS script configuration (e.g. jwplayer, sources: [...], file: "...")
    $('script').each((_, el) => {
      let scriptContent = $(el).html() || '';
      if (!scriptContent) return;

      if (scriptContent.includes('eval(function(p,a,c,k,e,d)')) {
        scriptContent = this.unpackJs(scriptContent);
      }

      // Regex for HLS (.m3u8), MKV (.mkv), MP4 (.mp4) links
      const streamRegex = /(?:file|source|src)\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mkv|mp4|webm)[^"']*)["']/gi;
      let match;
      while ((match = streamRegex.exec(scriptContent)) !== null) {
        const streamUrl = match[1];
        streams.push({
          url: streamUrl,
          mimeType: this.detectMimeType(streamUrl),
          quality: 'Original/Auto',
          headers: { ...defaultHeaders }
        });
      }
    });

    // Deduplicate by URL
    const seen = new Set();
    return streams.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }
}
