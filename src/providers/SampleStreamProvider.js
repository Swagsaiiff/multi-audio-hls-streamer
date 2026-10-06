import { BaseProvider } from './BaseProvider.js';
import { StreamResolver } from '../resolvers/StreamResolver.js';

export class SampleStreamProvider extends BaseProvider {
  constructor() {
    super({
      name: 'SampleMediaProvider',
      baseUrl: 'https://test-streams.mux.dev'
    });
  }

  /**
   * Sample flow: Resolves media stream from an HTML page or video embed
   * 1. Fetches HTML using Axios
   * 2. Parses DOM/Scripts using Cheerio & StreamResolver
   * 3. Formats stream metadata (url, mimeType, request headers, container)
   *
   * @param {string} mediaPageUrl URL of media or embed page
   * @returns {Promise<Array<Object>>} Resolved video streams
   */
  async resolveMediaStreams(mediaPageUrl) {
    try {
      console.log(`[${this.name}] Fetching media page: ${mediaPageUrl}`);
      const html = await this.fetchHtml(mediaPageUrl);

      console.log(`[${this.name}] Parsing DOM elements and script configurations with Cheerio...`);
      const streams = StreamResolver.parseStreamsFromHtml(html, mediaPageUrl);

      // If no direct video tag or embedded script matched, fallback to inspecting direct response
      if (streams.length === 0 && (mediaPageUrl.includes('.m3u8') || mediaPageUrl.includes('.mkv') || mediaPageUrl.includes('.mp4'))) {
        streams.push({
          url: mediaPageUrl,
          mimeType: StreamResolver.detectMimeType(mediaPageUrl),
          quality: 'Direct Source',
          headers: {
            'User-Agent': this.defaultHeaders['User-Agent'],
            'Referer': mediaPageUrl,
            'Origin': new URL(mediaPageUrl).origin
          }
        });
      }

      return streams;
    } catch (error) {
      console.error(`[${this.name}] Error resolving stream: ${error.message}`);
      throw error;
    }
  }

  /**
   * Demonstrates parsing a simulated multi-server video player embed
   * @returns {Array<Object>} Extracted stream links with headers
   */
  resolveFromSampleEmbed() {
    const samplePlayerHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Watch Big Buck Bunny - 4K Master</title></head>
        <body>
          <div id="player-container">
            <video id="main-player" controls poster="https://image.tmdb.org/t/p/original/sample.jpg">
              <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" type="video/mp4" data-quality="1080p">
              <source src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" type="application/x-mpegURL" data-quality="Adaptive HLS">
              <source src="https://example.com/cdn/stream/master_video_feed.mkv" type="video/x-matroska" data-quality="4K MKV">
            </video>
          </div>
          <script>
            var playerConfig = {
              title: "Big Buck Bunny",
              file: "https://test-streams.mux.dev/test_backup/stream.m3u8",
              tracks: [
                { file: "https://example.com/subs/en.vtt", label: "English", kind: "captions" }
              ]
            };
          </script>
        </body>
      </html>
    `;

    console.log(`[${this.name}] Simulating extraction on HTML player payload via Cheerio...`);
    return StreamResolver.parseStreamsFromHtml(samplePlayerHtml, 'https://streaming-service.example.com/watch/10293');
  }
}
