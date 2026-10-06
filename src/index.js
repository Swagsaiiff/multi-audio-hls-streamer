import { RepositoryClient } from './manifest/RepositoryClient.js';
import { SampleStreamProvider } from './providers/SampleStreamProvider.js';

const MANIFEST_URL = 'https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/CS.json';

async function main() {
  console.log('================================================================');
  console.log('  Media Player Pipeline - Repository Manifest & Stream Resolver');
  console.log('================================================================\n');

  // 1. Fetch and Inspect Repository Manifest
  const repoClient = new RepositoryClient();
  console.log(`[Step 1] Fetching manifest from: ${MANIFEST_URL}`);
  
  try {
    const { manifest, plugins } = await repoClient.fetchAllPlugins(MANIFEST_URL);
    const inspection = repoClient.inspectPlugins(plugins);

    console.log('\n--- Repository Overview ---');
    console.log(`Repository Name : ${manifest.name}`);
    console.log(`Description     : ${manifest.description}`);
    console.log(`Manifest Version: ${manifest.manifestVersion}`);
    console.log(`Total Plugins   : ${inspection.totalPlugins}`);
    console.log(`Languages       : ${inspection.languages.join(', ')}`);
    console.log(`Available Types : ${inspection.availableTvTypes.join(', ')}`);
    console.log(`Authors         : ${inspection.authors.join(', ')}\n`);

    console.log('--- Discovered Plugins (CSX builds) ---');
    inspection.pluginSummaryList.forEach((plugin, index) => {
      console.log(
        `[${index + 1}] ${plugin.name} (v${plugin.version}) [${plugin.language}] ` +
        `- Types: [${plugin.tvTypes.join(', ')}] ` +
        `- Size: ${plugin.fileSize}`
      );
      console.log(`    Desc : ${plugin.description}`);
      console.log(`    URL  : ${plugin.downloadUrl}\n`);
    });

    // 2. Execute Sample Provider Stream Resolution Flow
    console.log('================================================================');
    console.log('  [Step 2] Executing Provider Stream Resolution Flow (Axios + Cheerio)');
    console.log('================================================================\n');

    const provider = new SampleStreamProvider();
    
    // Test stream extraction using Cheerio DOM parsing + script detection
    const extractedStreams = provider.resolveFromSampleEmbed();

    console.log(`Successfully extracted ${extractedStreams.length} stream endpoint(s):\n`);

    extractedStreams.forEach((stream, idx) => {
      console.log(`-------------------- [ Stream #${idx + 1} ] --------------------`);
      console.log(`Video URL   : ${stream.url}`);
      console.log(`MIME Type   : ${stream.mimeType}`);
      console.log(`Quality     : ${stream.quality || 'Auto'}`);
      console.log('Required Request Headers:');
      console.log(JSON.stringify(stream.headers, null, 2));
      console.log('------------------------------------------------------------\n');
    });

    console.log('✅ Pipeline test complete. Streams are ready for player engine playback.');
  } catch (err) {
    console.error('Pipeline execution error:', err.message);
  }
}

main();
