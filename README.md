# Custom Media Player - Manifest Client & Stream Resolver

Modular Node.js client designed for research and testing custom media player pipelines. It fetches plugin manifests, inspects plugin metadata, and resolves direct video stream containers (MKV, HLS `.m3u8`, MP4) using **Axios** and **Cheerio**.

---

## 📁 Architecture Overview

```
├── package.json
├── src
│   ├── index.js                      # Pipeline entrypoint & CLI logger
│   ├── manifest
│   │   └── RepositoryClient.js       # Manifest parser & plugin inspector
│   ├── providers
│   │   ├── BaseProvider.js           # Base HTTP & HTML scraper class
│   │   └── SampleStreamProvider.js   # Media stream resolution flow
│   └── resolvers
│       └── StreamResolver.js         # Container MIME detection & Cheerio DOM parser
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Client
```bash
npm start
# or
node src/index.js
```

---

## 🧩 Key Modules

### 1. `RepositoryClient` (`src/manifest/RepositoryClient.js`)
- Fetches the root repository manifest (e.g. `CS.json`).
- Traverses `pluginLists` to fetch plugin descriptors (`.cs3` packages).
- Aggregates metadata: plugin name, version, language, supported `tvTypes`, file size, author, and download URLs.

### 2. `StreamResolver` (`src/resolvers/StreamResolver.js`)
- Detects MIME types:
  - **HLS**: `application/x-mpegURL` (`.m3u8`)
  - **Matroska**: `video/x-matroska` (`.mkv`)
  - **MP4**: `video/mp4` (`.mp4`)
  - **DASH**: `application/dash+xml` (`.mpd`)
- Unpacks packed JavaScript routines (Dean Edwards packer).
- Parses DOM `<video>`, `<source>`, and script configurations with Cheerio.

### 3. `SampleStreamProvider` (`src/providers/SampleStreamProvider.js`)
- Orchestrates the provider extraction workflow:
  1. Requests media page via Axios.
  2. Parses DOM and script payloads using Cheerio.
  3. Returns resolved stream objects with direct URLs, MIME types, and required request headers (`Referer`, `Origin`, `User-Agent`).
