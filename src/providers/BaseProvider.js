import axios from 'axios';
import * as cheerio from 'cheerio';

export class BaseProvider {
  /**
   * @param {Object} options
   * @param {string} options.name Provider name
   * @param {string} options.baseUrl Base provider domain
   * @param {Object} [options.headers] Default headers
   */
  constructor({ name, baseUrl, headers = {} }) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...headers
    };

    this.http = axios.create({
      timeout: 15000,
      headers: this.defaultHeaders
    });
  }

  /**
   * Fetch web page HTML
   * @param {string} url
   * @param {Object} [customHeaders]
   * @returns {Promise<string>}
   */
  async fetchHtml(url, customHeaders = {}) {
    const targetUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    const response = await this.http.get(targetUrl, {
      headers: { ...this.defaultHeaders, ...customHeaders }
    });
    return response.data;
  }

  /**
   * Parse HTML using Cheerio
   * @param {string} html
   * @returns {cheerio.CheerioAPI}
   */
  loadCheerio(html) {
    return cheerio.load(html);
  }
}
