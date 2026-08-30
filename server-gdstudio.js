'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { createGdStudioClient, normalizeSource } = require('./gdstudio-api');
const { planCuefieldTransitionFromCache } = require('./cuefield/mineradio-bridge');
const { appendCuefieldFeedback, readCuefieldFeedbackStats } = require('./cuefield/feedback-log');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const APP_ROOT = __dirname;
const PUBLIC_ROOT = path.join(APP_ROOT, 'public');
const PACKAGE = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')); } catch (_) { return {}; }
})();
const gd = createGdStudioClient();
const BEAT_CACHE_DIR = path.resolve(process.env.MINERADIO_BEAT_CACHE_DIR || path.join(APP_ROOT, 'data', 'beatmaps'));
const CUEFIELD_FEEDBACK_FILE = path.resolve(process.env.CUEFIELD_FEEDBACK_FILE || path.join(APP_ROOT, 'data', 'cuefield-feedback.jsonl'));
const removedRoute = (res) => sendJson(res, { ok: false, error: 'PLATFORM_REMOVED', message: '该在线平台已停用，请使用 GD Studio 音源。' }, 410);
const REMOVED_ROUTE_RE = /^\/api\/(?:login|qq|kugou|qishui|spotify|album\/subscribe|playlist\/subscribe|song\/like|song\/comments|artist|user\/playlists|podcast)/i;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function sendJson(res, value, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) { reject(new Error('REQUEST_TOO_LARGE')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function beatCacheFile(key) {
  const normalized = String(key || '').trim();
  if (!normalized) throw new Error('BEAT_CACHE_KEY_REQUIRED');
  return path.join(BEAT_CACHE_DIR, crypto.createHash('sha256').update(normalized).digest('hex') + '.json');
}

function readBeatMapCache(key) {
  const file = beatCacheFile(key);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  return value && value.map ? value : null;
}

function writeBeatMapCache(body) {
  body = body && typeof body === 'object' ? body : {};
  const key = String(body.key || '').trim();
  if (!key || !body.map || typeof body.map !== 'object') throw new Error('BEAT_CACHE_PAYLOAD_INVALID');
  fs.mkdirSync(BEAT_CACHE_DIR, { recursive: true });
  const entry = { key, map: body.map, meta: body.meta && typeof body.meta === 'object' ? body.meta : {}, savedAt: Date.now() };
  const file = beatCacheFile(key);
  const temp = file + '.tmp-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify(entry), 'utf8');
  fs.renameSync(temp, file);
  return { ok: true, key, savedAt: entry.savedAt };
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').split(/[+-]/)[0];
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map((part) => Number(part) || 0);
  const b = normalizeVersion(right).split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

function safeExternalUpdateUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch (_) { return ''; }
}

function extractReleaseDownloadPages(body) {
  const pages = [];
  const seen = new Set();
  String(body || '').split(/\r?\n/).forEach((line) => {
    const match = line.match(/mineradio-download-page:\s*([^|<]+)\|([^\s<]+)/i);
    if (!match) return;
    const url = safeExternalUpdateUrl(match[2]);
    if (!url || seen.has(url)) return;
    seen.add(url);
    pages.push({ label: String(match[1] || '下载').trim().slice(0, 32), url });
  });
  return pages.slice(0, 8);
}

async function fetchLatestUpdate() {
  const currentVersion = PACKAGE.version || '0.0.0';
  const update = PACKAGE.mineradio && PACKAGE.mineradio.update || {};
  const owner = update.owner || 'XxHuberrr';
  const repo = update.repo || 'Mineradio';
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Mineradio/' + currentVersion },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const release = await response.json();
    const latestVersion = normalizeVersion(release.tag_name || release.name || currentVersion);
    const downloadPages = extractReleaseDownloadPages(release.body);
    const htmlUrl = safeExternalUpdateUrl(release.html_url);
    return {
      currentVersion,
      latestVersion,
      available: compareVersions(latestVersion, currentVersion) > 0,
      patchAvailable: false,
      downloadPages,
      downloadPageUrl: downloadPages[0] && downloadPages[0].url || htmlUrl,
      htmlUrl,
      release: { version: latestVersion, name: release.name || '', body: release.body || '', htmlUrl, downloadPages, downloadPageUrl: downloadPages[0] && downloadPages[0].url || htmlUrl },
    };
  } catch (error) {
    return { currentVersion, latestVersion: currentVersion, available: false, patchAvailable: false, downloadPages: [], release: { version: currentVersion, notes: [] }, error: error.message };
  }
}

function safePublicPath(requestPath) {
  const decoded = decodeURIComponent(String(requestPath || '/'));
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  const target = path.resolve(PUBLIC_ROOT, relative);
  const root = path.resolve(PUBLIC_ROOT) + path.sep;
  return target === path.resolve(PUBLIC_ROOT, 'index.html') || target.startsWith(root) ? target : '';
}

function serveStatic(res, requestPath) {
  const target = safePublicPath(requestPath);
  if (!target) { res.writeHead(400); res.end('Bad path'); return; }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function requestBinary(targetUrl, range) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    if (!/^https?:$/.test(parsed.protocol)) return reject(new Error('GDS_INVALID_MEDIA_URL'));
    const lib = parsed.protocol === 'https:' ? https : http;
    const request = lib.get(parsed, { headers: range ? { Range: range } : {} }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode || 502, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.setTimeout(12000, () => request.destroy(new Error('GDS_MEDIA_TIMEOUT')));
    request.on('error', reject);
  });
}

async function proxyMedia(res, targetUrl, range) {
  const result = await requestBinary(targetUrl, range);
  const headers = {
    'Content-Type': result.headers['content-type'] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  ['content-length', 'content-range'].forEach((key) => { if (result.headers[key]) headers[key] = result.headers[key]; });
  res.writeHead(result.status, headers);
  res.end(result.body);
}

function weatherQuery(url) {
  const value = String(url.searchParams.get('query') || url.searchParams.get('city') || '上海').trim();
  return value.slice(0, 80) || '上海';
}

async function buildDiscovery(url) {
  const query = weatherQuery(url);
  const songs = await gd.search({ source: normalizeSource(process.env.MINERADIO_GDSTUDIO_SOURCE), name: query, count: 12, pages: 1 });
  return { loggedIn: false, mode: 'gdstudio', updatedAt: Date.now(), dailySongs: songs, dailySongTotal: songs.length, dailySongsComplete: true, playlists: [], podcasts: [], provider: 'gdstudio' };
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url || '/', `http://${HOST}:${PORT}`); } catch (_) { res.writeHead(400); res.end('Bad URL'); return; }
  const pathname = url.pathname;

  if (pathname === '/api/app/version') {
    sendJson(res, { name: PACKAGE.name || 'mineradio', productName: PACKAGE.productName || 'Mineradio', version: PACKAGE.version || '2.1.0', provider: 'gdstudio' });
    return;
  }
  if (pathname === '/api/platform/capabilities') {
    sendJson(res, { gdstudio: { search: true, playback: true, lyrics: true, covers: true }, local: { import: true, playback: true, lyrics: true, covers: true } });
    return;
  }
  if (pathname === '/api/update/latest') { sendJson(res, await fetchLatestUpdate()); return; }
  if (pathname === '/api/update/download' || pathname === '/api/update/download/status'
    || pathname === '/api/update/patch' || pathname === '/api/update/patch/status') {
    sendJson(res, { ok: false, externalOnly: true, error: 'UPDATE_EXTERNAL_ONLY' }, 410);
    return;
  }
  if (REMOVED_ROUTE_RE.test(pathname) || pathname === '/api/login/status' || pathname === '/api/logout') { removedRoute(res); return; }

  try {
    if (pathname === '/api/search') {
      const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') || 20) || 20));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
      const songs = await gd.search({ source: url.searchParams.get('source'), name: url.searchParams.get('keywords'), count: limit, offset });
      const source = normalizeSource(url.searchParams.get('source'));
      songs.forEach((song) => {
        if (!song.cover && song.picId) song.cover = `/api/gdstudio/cover?source=${encodeURIComponent(song.gdstudioSource || source)}&id=${encodeURIComponent(song.picId)}&size=500`;
      });
      sendJson(res, { provider: 'gdstudio', songs, offset, limit, nextOffset: offset + songs.length, hasMore: songs.length >= limit });
      return;
    }
    if (pathname === '/api/song/url') {
      const data = await gd.songUrl({ source: url.searchParams.get('source'), id: url.searchParams.get('id'), br: url.searchParams.get('br') || url.searchParams.get('quality') });
      sendJson(res, data);
      return;
    }
    if (pathname === '/api/lyric') {
      sendJson(res, await gd.lyric({ source: url.searchParams.get('source'), id: url.searchParams.get('id') || url.searchParams.get('lyricId') }));
      return;
    }
    if (pathname === '/api/gdstudio/cover') {
      const cover = await gd.cover({ source: url.searchParams.get('source'), id: url.searchParams.get('id') || url.searchParams.get('picId'), size: url.searchParams.get('size') });
      if (!cover.playable) { sendJson(res, { ok: false, provider: 'gdstudio', error: 'GDS_COVER_UNAVAILABLE' }, 404); return; }
      await proxyMedia(res, cover.url, '');
      return;
    }
    if (pathname === '/api/cover') {
      const target = url.searchParams.get('url');
      if (!target) { res.writeHead(400); res.end('Missing url'); return; }
      await proxyMedia(res, target, '');
      return;
    }
    if (pathname === '/api/audio') {
      const target = url.searchParams.get('url');
      if (!target) { res.writeHead(400); res.end('Missing url'); return; }
      await proxyMedia(res, target, req.headers.range || '');
      return;
    }
    if (pathname === '/api/discover/home') { sendJson(res, await buildDiscovery(url)); return; }
    if (pathname === '/api/weather/radio') {
      const discovery = await buildDiscovery(url);
      sendJson(res, { provider: 'gdstudio', source: 'gdstudio', songs: discovery.dailySongs, location: { name: weatherQuery(url) }, mood: 'clear', updatedAt: Date.now() });
      return;
    }
    if (pathname === '/api/beatmap/cache/status') {
      let enabled = true;
      try { fs.mkdirSync(BEAT_CACHE_DIR, { recursive: true }); } catch (_) { enabled = false; }
      sendJson(res, { enabled, mode: enabled ? 'disk' : 'memory-only', dir: BEAT_CACHE_DIR, reason: enabled ? '' : 'TARGET_UNAVAILABLE' });
      return;
    }
    if (pathname === '/api/beatmap/cache') {
      if (req.method === 'GET') {
        const key = url.searchParams.get('key') || '';
        const entry = readBeatMapCache(key);
        sendJson(res, entry ? { ok: true, hit: true, ...entry } : { ok: true, hit: false, key });
        return;
      }
      if (req.method === 'POST') {
        sendJson(res, writeBeatMapCache(JSON.parse(await readBody(req) || '{}')));
        return;
      }
      sendJson(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
      return;
    }
    if (pathname === '/api/cuefield/transition') {
      if (req.method !== 'POST') { sendJson(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405); return; }
      const body = JSON.parse(await readBody(req) || '{}');
      sendJson(res, planCuefieldTransitionFromCache({
        fromKey: body.fromKey, toKey: body.toKey, fromLrc: body.fromLrc, toLrc: body.toLrc,
        exitBias: body.exitBias || 'late', maxEntryTime: Math.max(8, Math.min(32, Number(body.maxEntryTime) || 32)),
        readBeatMapCache,
      }));
      return;
    }
    if (pathname === '/api/cuefield/feedback') {
      if (req.method === 'GET') { sendJson(res, { ok: true, stats: readCuefieldFeedbackStats(CUEFIELD_FEEDBACK_FILE) }); return; }
      if (req.method === 'POST') { sendJson(res, { ok: true, record: appendCuefieldFeedback(CUEFIELD_FEEDBACK_FILE, JSON.parse(await readBody(req) || '{}')) }); return; }
      sendJson(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
      return;
    }
    if (pathname.startsWith('/api/')) { removedRoute(res); return; }
  } catch (error) {
    const status = error && (error.statusCode === 429 || error.code === 'GDS_RATE_LIMIT') ? 429 : 502;
    sendJson(res, { ok: false, provider: 'gdstudio', error: error.code || 'GDS_REQUEST_FAILED', message: error.message || 'GD Studio request failed' }, status);
    return;
  }
  serveStatic(res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`[Mineradio] GD Studio server listening on http://${HOST}:${PORT}`);
});

module.exports = server;
