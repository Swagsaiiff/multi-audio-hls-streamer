import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseProvider } from '../BaseProvider.js';
import { MdriveExtractor } from './extractors/MdriveExtractor.js';

/**
 * MoviesDriveProvider
 *
 * Scrapes MoviesDrive (multi-audio Hindi/English dual-audio site) to:
 *  1. Search for a movie/show by title
 *  2. Load episode/season links from a content page
 *  3. Resolve direct stream or mirror URLs via MdriveExtractor
 *
 * Compatible with the existing HLS transmuxer pipeline.
 */
export class MoviesDriveProvider extends BaseProvider {
  constructor() {
    super({
      name: 'MoviesDrive',
      baseUrl: 'https://new5.moviesdrive.christmas',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    this.mdriveExtractor = new MdriveExtractor();
  }

  /**
   * Search the site for a movie/show by title
   * @param {string} query
   * @returns {Promise<Array<{title, url, year, type}>>}
   */
  async search(query) {
    const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    console.log(`[MoviesDrive] Searching: ${searchUrl}`);

    try {
      const res = await axios.get(searchUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);
      const results = [];

      // Articles on search results pages
      $('article, .post, .blog-entry').each((i, el) => {
        const titleEl = $(el).find('h2 a, h3 a, .entry-title a').first();
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        const thumbnail = $(el).find('img').first().attr('src') || '';

        // Extract year from title string (e.g. "Movie Title (2024)")
        const yearMatch = title.match(/\((\d{4})\)/);
        const year = yearMatch ? yearMatch[1] : null;

        // Detect if it's a series or movie by title keywords
        const type = /season|series|episode|ep\.|s\d{2}/i.test(title) ? 'TvSeries' : 'Movie';

        if (title && url) {
          results.push({ title, url, year, type, thumbnail });
        }
      });

      console.log(`[MoviesDrive] Search returned ${results.length} result(s) for: "${query}"`);
      return results;
    } catch (err) {
      console.warn(`[MoviesDrive] Search error: ${err.message}`);
      return [];
    }
  }

  /**
   * Load a content page and extract all episode/quality download links
   * @param {string} pageUrl - Direct URL to a movie or series page
   * @returns {Promise<{title, description, episodes: Array, poster}>}
   */
  async loadPage(pageUrl) {
    console.log(`[MoviesDrive] Loading content page: ${pageUrl}`);

    try {
      const res = await axios.get(pageUrl, { headers: this.headers, timeout: 12000 });
      const $ = cheerio.load(res.data);

      const title = $('h1.entry-title, .post-title, article h1').first().text().trim() ||
                    $('title').text().split('–')[0].trim();
      const description = $('.entry-content p, .post-content p').first().text().trim();
      const poster = $('img.wp-post-image, .post-thumbnail img, .entry-content img').first().attr('src') || '';

      // Find all episode/season/quality hub links
      const episodes = [];

      // Common patterns: "1080p Single Episode", "720p", "Episode 1", etc.
      $('a[href*="mdrive.lol"], a[href*="hubcloud"], a[href*="gdflix"]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim() || `Link ${i + 1}`;
        const qualityMatch = text.match(/\b(4k|2160p|1080p|720p|480p)\b/i) ||
                             href.match(/\b(4k|2160p|1080p|720p|480p)\b/i);

        if (!href) return;

        episodes.push({
          label: text,
          url: href,
          quality: qualityMatch ? qualityMatch[1].toUpperCase() : '1080P',
          isMdrive: href.includes('mdrive.lol'),
          isDirectHost: /hubcloud|gdflix|fastdl/i.test(href)
        });
      });

      // Also pick up plain anchor links with quality labels
      $('a.btn, a[class*="button"], h5 a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (!href || href.startsWith('#') || /category|tag|page|t\.me/i.test(href)) return;
        if (episodes.find(e => e.url === href)) return;

        const qualityMatch = text.match(/\b(4k|2160p|1080p|720p|480p)\b/i);
        if (!qualityMatch) return;

        episodes.push({
          label: text,
          url: href,
          quality: qualityMatch[1].toUpperCase(),
          isMdrive: href.includes('mdrive.lol'),
          isDirectHost: /hubcloud|gdflix|fastdl/i.test(href)
        });
      });

      console.log(`[MoviesDrive] Found ${episodes.length} episode/quality link(s) on page.`);
      return { title, description, poster, pageUrl, episodes };
    } catch (err) {
      console.warn(`[MoviesDrive] loadPage error for ${pageUrl}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Full resolution flow: page URL → episode links → direct stream URLs
   * @param {string} pageUrl - A MoviesDrive or mdrive.lol page URL
   * @param {Object} [options]
   * @param {string} [options.quality='1080p'] - Preferred quality
   * @param {number} [options.episodeIndex=0] - Which episode link to follow (0-indexed)
   * @returns {Promise<Array<Object>>} Array of resolved stream objects
   */
  async resolveStreams(pageUrl, { quality = '1080p', episodeIndex = 0 } = {}) {
    console.log(`\n[MoviesDrive] === Resolving streams from: ${pageUrl} ===`);

    // If it's directly an mdrive.lol link, skip the page step
    if (pageUrl.includes('mdrive.lol')) {
      return this.mdriveExtractor.extract({ url: pageUrl, quality });
    }

    // Otherwise load the MoviesDrive page first
    const pageData = await this.loadPage(pageUrl);

    if (!pageData.episodes || pageData.episodes.length === 0) {
      console.warn('[MoviesDrive] No episode links found on page.');
      return [];
    }

    // Find episodes matching requested quality
    const qualityEpisodes = pageData.episodes.filter(e =>
      e.quality.toLowerCase() === quality.toLowerCase() ||
      e.quality.toLowerCase().includes(quality.toLowerCase().replace('p', ''))
    );
    const targetEpisodes = qualityEpisodes.length > 0 ? qualityEpisodes : pageData.episodes;
    const targetLink = targetEpisodes[episodeIndex] || targetEpisodes[0];

    console.log(`[MoviesDrive] Following link: "${targetLink.label}" → ${targetLink.url}`);

    // If direct mdrive link, resolve it
    if (targetLink.isMdrive || targetLink.url.includes('mdrive.lol')) {
      return this.mdriveExtractor.extract({ url: targetLink.url, quality });
    }

    // Return the link as-is for other mirror hosts (gdflix, hubcloud, etc.)
    return [{
      source: this.name,
      title: targetLink.label,
      url: targetLink.url,
      quality: targetLink.quality,
      type: 'video/x-matroska',
      directLink: false,
      isMirrorHost: true,
      mirrorHost: (() => { try { return new URL(targetLink.url).hostname; } catch { return 'unknown'; } })(),
      pageData,
      headers: {
        'User-Agent': this.headers['User-Agent'],
        'Referer': pageUrl
      }
    }];
  }
}
