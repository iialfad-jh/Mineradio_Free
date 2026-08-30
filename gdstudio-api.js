'use strict';

const DEFAULT_BASE_URL = 'https://music-api.gdstudio.xyz/api.php';
const REQUEST_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_WINDOW_MAX = 40;
const SEARCH_CACHE_TTL_MS = 60 * 1000;
const URL_CACHE_TTL_MS = 3 * 60 * 1000;
const COVER_CACHE_TTL_MS = 60 * 60 * 1000;
const LYRIC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GDSOURCES = Object.freeze([
  'netease', 'tencent', 'kuwo', 'tidal', 'qobuz', 'joox', 'bilibili', 'apple', 'ytmusic', 'spotify',
]);
const GDBITRATES = Object.freeze([128, 192, 320, 740, 999]);
const transientCodes = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

function normalizeSource(value, fallback) {
  const candidate = String(value || '').trim().toLowerCase();
  const defaultSource = String(fallback || process.env.MINERADIO_GDSTUDIO_SOURCE || 'netease').trim().toLowerCase();
  return GDSOURCES.includes(candidate) ? candidate : (GDSOURCES.includes(defaultSource) ? defaultSource : 'netease');
}

function normalizeBitrate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 999;
  return GDBITRATES.reduce((best, item) => (
    Math.abs(item - numeric) < Math.abs(best - numeric) ? item : best
  ), 999);
}

function clampCount(value) {
  return Math.max(1, Math.min(50, Math.round(Number(value) || 20)));
}

function clampPage(value) {
  return Math.max(1, Math.min(10000, Math.round(Number(value) || 1)));
}

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\0/g, '').trim();
}

function normalizeArtists(value) {
  const raw = Array.isArray(value) ? value : normalizeText(value).split(/\s*\/\s*|\s*,\s*/);
  return raw.map((item) => {
    if (item && typeof item === 'object') {
      const name = normalizeText(item.name || item.title || item.artist);
      return { id: normalizeText(item.id || item.artistId || item.mid), name };
    }
    return { id: '', name: normalizeText(item) };
  }).filter((item) => item.name);
}

function unwrapPayload(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') return payload[key];
  }
  return payload;
}

function normalizeGdStudioSong(item, opts = {}) {
  item = item && typeof item === 'object' ? item : {};
  const source = normalizeSource(item.source || opts.source, opts.source);
  const id = normalizeText(item.id || item.track_id || item.trackId || item.song_id || item.mid);
  const artists = normalizeArtists(item.artist || item.artists || item.singers || item.author);
  const albumValue = item.album && typeof item.album === 'object' ? item.album.name || item.album.title : item.album;
  return {
    provider: 'gdstudio',
    source: 'gdstudio',
    type: 'song',
    id,
    providerSongId: id,
    gdstudioSource: source,
    picId: normalizeText(item.pic_id || item.picId || item.pic || item.album_pic_id),
    lyricId: normalizeText(item.lyric_id || item.lyricId || item.lyric || id),
    name: normalizeText(item.name || item.title),
    artist: artists.map((artist) => artist.name).join(' / '),
    artists,
    album: normalizeText(albumValue),
    albumId: normalizeText(item.album_id || item.albumId),
    cover: normalizeText(item.cover || item.picUrl || item.pic_url),
    duration: Number(item.duration || item.dt || item.duration_ms || 0) || 0,
  };
}

function normalizeGdStudioSearch(payload, opts = {}) {
  const rows = unwrapPayload(payload, ['data', 'result', 'results', 'songs', 'list']);
  const list = Array.isArray(rows) ? rows : (rows && rows.song ? rows.song : []);
  return list.map((item) => normalizeGdStudioSong(item, opts)).filter((song) => song.id && song.name);
}

function firstObject(payload) {
  const value = unwrapPayload(payload, ['data', 'result', 'results']);
  if (Array.isArray(value)) return value[0] || {};
  return value && typeof value === 'object' ? value : {};
}

function normalizeGdStudioUrl(payload) {
  const item = firstObject(payload);
  const url = normalizeText(item.url || item.playUrl || item.play_url);
  return {
    provider: 'gdstudio',
    source: 'gdstudio',
    url,
    br: Number(item.br || item.bitrate || 0) || 0,
    size: Number(item.size || 0) || 0,
    playable: /^https?:\/\//i.test(url),
  };
}

function normalizeGdStudioCover(payload) {
  const item = firstObject(payload);
  const url = normalizeText(typeof item === 'string' ? item : item.url || item.picUrl || item.pic_url);
  return { provider: 'gdstudio', source: 'gdstudio', url, playable: /^https?:\/\//i.test(url) };
}

function normalizeGdStudioLyric(payload) {
  const item = firstObject(payload);
  return {
    provider: 'gdstudio',
    source: 'gdstudio',
    lyric: normalizeText(item.lyric || item.lrc || item.lyrics),
    tlyric: normalizeText(item.tlyric || item.translation || item.tLyrics),
  };
}

function makeError(code, message, extra = {}) {
  const error = new Error(message || code);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function classifyError(error) {
  const statusCode = Number(error && (error.statusCode || error.status)) || 0;
  if (statusCode === 429 || error && error.code === 'GDS_RATE_LIMIT') return makeError('GDS_RATE_LIMIT', 'GD Studio request rate limited', { statusCode: 429 });
  if (statusCode >= 400) return makeError('GDS_HTTP_ERROR', `GD Studio HTTP ${statusCode}`, { statusCode });
  if (error && error.code) return error;
  return makeError('GDS_REQUEST_FAILED', error && error.message || 'GD Studio request failed');
}

function defaultRequestJson(url, options = {}) {
  const timeoutMs = Math.max(500, Math.min(15000, Number(options.timeoutMs) || 9000));
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return fetch(url, { method: 'GET', signal: controller && controller.signal }).then(async (response) => {
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return response.json();
  }).catch((error) => {
    if (error && error.name === 'AbortError') {
      error.code = 'ETIMEDOUT';
    }
    throw error;
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function createGdStudioClient(options = {}) {
  const baseUrl = String(options.baseUrl || process.env.MINERADIO_GDSTUDIO_API_URL || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const requestJson = typeof options.requestJson === 'function' ? options.requestJson : defaultRequestJson;
  const sleep = typeof options.sleep === 'function' ? options.sleep : ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const requestWindowMax = Math.max(1, Math.min(REQUEST_WINDOW_MAX, Number(options.requestWindowMax) || REQUEST_WINDOW_MAX));
  const requestWindow = [];
  const caches = { search: new Map(), url: new Map(), cover: new Map(), lyric: new Map() };

  function cacheGet(kind, key, ttl) {
    const hit = caches[kind].get(key);
    if (!hit || now() - hit.at > ttl) {
      if (hit) caches[kind].delete(key);
      return null;
    }
    return hit.value;
  }
  function cacheSet(kind, key, value) {
    caches[kind].set(key, { at: now(), value });
    if (caches[kind].size > 120) caches[kind].delete(caches[kind].keys().next().value);
  }
  function consumeRequestSlot() {
    const cutoff = now() - REQUEST_WINDOW_MS;
    while (requestWindow.length && requestWindow[0] <= cutoff) requestWindow.shift();
    if (requestWindow.length >= requestWindowMax) throw makeError('GDS_RATE_LIMIT', 'GD Studio request window exhausted', { statusCode: 429 });
    requestWindow.push(now());
  }
  async function request(params) {
    const query = new URLSearchParams(params);
    const target = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query.toString()}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      consumeRequestSlot();
      try {
        return await requestJson(target, { timeoutMs: options.timeoutMs });
      } catch (rawError) {
        const error = classifyError(rawError);
        if (error.code === 'GDS_RATE_LIMIT' || error.statusCode >= 400 || attempt > 0 || !transientCodes.has(error.code)) throw error;
        await sleep(Math.max(0, Number(options.retryDelayMs) || 120));
      }
    }
    throw makeError('GDS_REQUEST_FAILED', 'GD Studio request failed');
  }
  async function search(params = {}) {
    const source = normalizeSource(params.source);
    const name = normalizeText(params.name || params.keywords);
    if (!name) return [];
    const count = clampCount(params.count || params.limit);
    const pages = clampPage(params.pages || (Number(params.offset) ? Math.floor(Number(params.offset) / count) + 1 : 1));
    const key = `${source}|${name}|${count}|${pages}`;
    const cached = cacheGet('search', key, SEARCH_CACHE_TTL_MS);
    if (cached) return cached;
    const payload = await request({ types: 'search', source, name, count, pages });
    const value = normalizeGdStudioSearch(payload, { source });
    cacheSet('search', key, value);
    return value;
  }
  async function songUrl(params = {}) {
    const source = normalizeSource(params.source);
    const id = normalizeText(params.id);
    if (!id) throw makeError('GDS_INVALID_ID', 'GD Studio track id is required');
    const br = normalizeBitrate(params.br);
    const key = `${source}|${id}|${br}`;
    const cached = cacheGet('url', key, URL_CACHE_TTL_MS);
    if (cached) return cached;
    const value = normalizeGdStudioUrl(await request({ types: 'url', source, id, br }));
    cacheSet('url', key, value);
    return value;
  }
  async function cover(params = {}) {
    const source = normalizeSource(params.source);
    const id = normalizeText(params.id);
    if (!id) throw makeError('GDS_INVALID_ID', 'GD Studio picture id is required');
    const size = Number(params.size) >= 500 ? 500 : 300;
    const key = `${source}|${id}|${size}`;
    const cached = cacheGet('cover', key, COVER_CACHE_TTL_MS);
    if (cached) return cached;
    const value = normalizeGdStudioCover(await request({ types: 'pic', source, id, size }));
    cacheSet('cover', key, value);
    return value;
  }
  async function lyric(params = {}) {
    const source = normalizeSource(params.source);
    const id = normalizeText(params.id);
    if (!id) throw makeError('GDS_INVALID_ID', 'GD Studio lyric id is required');
    const key = `${source}|${id}`;
    const cached = cacheGet('lyric', key, LYRIC_CACHE_TTL_MS);
    if (cached) return cached;
    const value = normalizeGdStudioLyric(await request({ types: 'lyric', source, id }));
    cacheSet('lyric', key, value);
    return value;
  }
  return { search, songUrl, cover, lyric, clearCaches: () => Object.values(caches).forEach((cache) => cache.clear()) };
}

module.exports = {
  DEFAULT_BASE_URL,
  GDBITRATES,
  GDSOURCES,
  createGdStudioClient,
  normalizeBitrate,
  normalizeGdStudioCover,
  normalizeGdStudioLyric,
  normalizeGdStudioSearch,
  normalizeGdStudioSong,
  normalizeGdStudioUrl,
  normalizeSource,
};
