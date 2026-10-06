import axios from 'axios';
import { BaseExtractor } from './BaseExtractor.js';

export class AnimetoshoExtractor extends BaseExtractor {
  constructor() {
    super('Animetosho', 'https://feed.animetosho.xyz');
  }

  /**
   * Resolves direct media stream links from AnimeTosho search
   * @param {Object} data
   * @param {string} data.title Title or search keyword
   * @param {number} [data.episode] Episode number
   * @returns {Promise<Array<Object>>}
   */
  async extract(data) {
    const { title, episode } = data;
    if (!title) return [];

    const searchQuery = episode ? `${title} ${episode}` : title;
    const searchUrl = `${this.mainUrl}/json?q=${encodeURIComponent(searchQuery)}&limit=15`;

    console.log(`[CloudStream] [Extractor:Animetosho] Querying: ${searchUrl}`);

    try {
      const response = await axios.get(searchUrl, {
        headers: this.defaultHeaders,
        timeout: 10000
      });

      const items = Array.isArray(response.data) ? response.data : [];
      const streams = [];

      for (const item of items) {
        // Look for attachments or direct download links
        const itemTitle = item.title || '';
        const isDualAudio = /dual[- ]audio|multi[- ]audio|dub/i.test(itemTitle);
        const qualityMatch = itemTitle.match(/\b(1080p|720p|480p|2160p|4k)\b/i);
        const quality = qualityMatch ? qualityMatch[1].toUpperCase() : '1080P';

        // Check if direct file or attachment exists
        if (item.torrent_url) {
          // If direct mirror exists in link or attachments
          const linkId = item.id || (item.link && item.link.split('/').pop());
          if (linkId) {
            // AnimeTosho provides direct web mirror downloads for cached torrent files
            const mirrorUrl = `https://animetosho.org/storage/torrent/${linkId}`;
            streams.push({
              source: this.name,
              title: itemTitle,
              url: mirrorUrl,
              quality: isDualAudio ? `${quality} (Dual-Audio)` : quality,
              isDualAudio,
              type: 'video/x-matroska',
              headers: {
                'User-Agent': this.defaultHeaders['User-Agent'],
                'Referer': 'https://animetosho.org/'
              }
            });
          }
        }
      }

      return streams;
    } catch (err) {
      console.warn(`[CloudStream] [Extractor:Animetosho] Extraction error: ${err.message}`);
      return [];
    }
  }
}
