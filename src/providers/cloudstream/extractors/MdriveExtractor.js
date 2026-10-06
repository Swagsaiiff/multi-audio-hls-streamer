import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseExtractor } from './BaseExtractor.js';

/**
 * MdriveExtractor
 * Resolves direct stream/download links from mdrive.lol archive pages.
 * These are the intermediate pages linked from MoviesDrive episode listings.
 */
export class MdriveExtractor extends BaseExtractor {
  constructor() {
    super('Mdrive', 'https://mdrive.lol');
  }

  /**
   * Extract direct links from an mdrive.lol/archive/* page
   * @param {Object} data
   * @param {string} data.url - The mdrive.lol archive URL
   * @param {string} [data.quality] - Preferred quality hint (e.g. '1080p')
   * @returns {Promise<Array<Object>>}
   */
  async extract({ url, quality = '1080p' } = {}) {
    if (!url) return [];

    console.log(`[Mdrive] Fetching archive page: ${url}`);
    try {
      const res = await axios.get(url, {
        headers: {
          ...this.defaultHeaders,
          'Referer': 'https://new5.moviesdrive.christmas/'
        },
        timeout: 12000
      });

      const $ = cheerio.load(res.data);
      const streams = [];

      // Gather all <a> links that look like direct video or mirror host links
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();

        // Skip navigation / social links
        if (!href || href.startsWith('#') || href === '/') return;

        const isMirror = /hubcloud|gdflix|fastdl|pixeldrain|gofile|buzzheavier|doodstream|filemoon|streamwish|vidhide|dropgalaxy|send\.cm|krakenfiles/i.test(href);
        const isDirectVideo = /\.(mkv|mp4|avi|webm)(\?|$)/i.test(href);

        if (isDirectVideo) {
          const qualityMatch = text.match(/\b(4k|2160p|1080p|720p|480p)\b/i) ||
                              href.match(/\b(4k|2160p|1080p|720p|480p)\b/i);
          const q = qualityMatch ? qualityMatch[1].toUpperCase() : quality;

          streams.push({
            source: this.name,
            title: text || `Direct ${q}`,
            url: href,
            quality: q,
            type: href.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4',
            directLink: true,
            headers: {
              'User-Agent': this.defaultHeaders['User-Agent'],
              'Referer': url
            }
          });
        } else if (isMirror) {
          const qualityMatch = text.match(/\b(4k|2160p|1080p|720p|480p)\b/i);
          const q = qualityMatch ? qualityMatch[1].toUpperCase() : quality;

          streams.push({
            source: this.name,
            title: text || `Mirror (${new URL(href).hostname})`,
            url: href,
            quality: q,
            type: 'video/x-matroska',
            directLink: false,
            isMirrorHost: true,
            mirrorHost: new URL(href).hostname,
            headers: {
              'User-Agent': this.defaultHeaders['User-Agent'],
              'Referer': url
            }
          });
        }
      });

      // Also look for quality-specific section links (common pattern on mdrive)
      $('h3, h4, .entry-content p strong').each((i, heading) => {
        const headingText = $(heading).text().trim();
        const qMatch = headingText.match(/\b(4k|2160p|1080p|720p|480p)\b/i);
        if (!qMatch) return;
        const q = qMatch[1].toUpperCase();

        // Find links in the next sibling block
        $(heading).nextUntil('h3, h4', 'p, div').find('a[href]').each((j, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().trim();
          if (!href || href.startsWith('#')) return;
          if (/hubcloud|gdflix|fastdl|pixeldrain|gofile|buzzheavier|doodstream|filemoon|streamwish|vidhide/i.test(href)) {
            if (!streams.find(s => s.url === href)) {
              streams.push({
                source: this.name,
                title: text || `Mirror [${q}] (${new URL(href).hostname})`,
                url: href,
                quality: q,
                type: 'video/x-matroska',
                directLink: false,
                isMirrorHost: true,
                mirrorHost: new URL(href).hostname,
                headers: {
                  'User-Agent': this.defaultHeaders['User-Agent'],
                  'Referer': url
                }
              });
            }
          }
        });
      });

      console.log(`[Mdrive] Found ${streams.length} stream(s) from: ${url}`);
      return streams;
    } catch (err) {
      console.warn(`[Mdrive] Extraction error for ${url}: ${err.message}`);
      return [];
    }
  }
}
