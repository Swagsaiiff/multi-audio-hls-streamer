import axios from 'axios';

export class RepositoryClient {
  constructor(options = {}) {
    this.timeout = options.timeout || 10000;
    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });
  }

  /**
   * Fetches the root repository manifest (e.g. CS.json)
   * @param {string} manifestUrl
   * @returns {Promise<Object>} Manifest data
   */
  async fetchManifest(manifestUrl) {
    try {
      const response = await this.client.get(manifestUrl);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch manifest from ${manifestUrl}: ${error.message}`);
    }
  }

  /**
   * Fetches all plugins declared across all pluginLists in the manifest
   * @param {string} manifestUrl
   * @returns {Promise<{manifest: Object, plugins: Array<Object>}>}
   */
  async fetchAllPlugins(manifestUrl) {
    const manifest = await this.fetchManifest(manifestUrl);
    const plugins = [];

    if (Array.isArray(manifest.pluginLists)) {
      for (const listUrl of manifest.pluginLists) {
        try {
          const res = await this.client.get(listUrl);
          if (Array.isArray(res.data)) {
            plugins.push(...res.data);
          }
        } catch (err) {
          console.warn(`[RepositoryClient] Warning: Failed to fetch plugin list from ${listUrl}: ${err.message}`);
        }
      }
    }

    return { manifest, plugins };
  }

  /**
   * Formats and summarizes plugin inspection details
   * @param {Array<Object>} plugins
   * @returns {Object}
   */
  inspectPlugins(plugins) {
    const total = plugins.length;
    const languages = [...new Set(plugins.map(p => p.language).filter(Boolean))];
    const tvTypes = [...new Set(plugins.flatMap(p => p.tvTypes || []))];
    const authors = [...new Set(plugins.flatMap(p => p.authors || []))];

    return {
      totalPlugins: total,
      languages,
      availableTvTypes: tvTypes,
      authors,
      pluginSummaryList: plugins.map(p => ({
        name: p.name,
        internalName: p.internalName,
        version: p.version,
        language: p.language,
        tvTypes: p.tvTypes || [],
        description: p.description,
        fileSize: p.fileSize ? `${(p.fileSize / 1024).toFixed(1)} KB` : 'N/A',
        downloadUrl: p.url,
        iconUrl: p.iconUrl
      }))
    };
  }
}
