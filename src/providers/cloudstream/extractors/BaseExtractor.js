import axios from 'axios';

export class BaseExtractor {
  constructor(name, mainUrl = '') {
    this.name = name;
    this.mainUrl = mainUrl;
    this.defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9'
    };
  }

  /**
   * Resolve direct media streams from media parameters
   * @param {Object} data Media load data
   * @returns {Promise<Array<{url: string, quality?: string, type?: string, headers: Object}>>}
   */
  async extract(data) {
    throw new Error(`Method extract() must be implemented by ${this.constructor.name}`);
  }
}
