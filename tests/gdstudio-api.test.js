'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const api = require('../gdstudio-api');

test('normalizes GD Studio search records into the Mineradio song model', () => {
  const songs = api.normalizeGdStudioSearch([
    {
      id: 123,
      name: 'Test Song',
      artist: [{ id: 7, name: 'Artist A' }, { id: 8, name: 'Artist B' }],
      album: 'Test Album',
      pic_id: 'pic-1',
      lyric_id: 'lyric-1',
      source: 'joox',
    },
  ], { source: 'joox' });

  assert.deepEqual(songs, [{
    provider: 'gdstudio',
    source: 'gdstudio',
    type: 'song',
    id: '123',
    providerSongId: '123',
    gdstudioSource: 'joox',
    picId: 'pic-1',
    lyricId: 'lyric-1',
    name: 'Test Song',
    artist: 'Artist A / Artist B',
    artists: [{ id: '7', name: 'Artist A' }, { id: '8', name: 'Artist B' }],
    album: 'Test Album',
    albumId: '',
    cover: '',
    duration: 0,
  }]);
});

test('builds bounded and encoded search requests', async () => {
  const calls = [];
  const client = api.createGdStudioClient({
    requestJson: async (url) => {
      calls.push(url);
      return [];
    },
    now: () => 1000,
  });

  await client.search({ source: 'joox', name: 'A&B / 现场', count: 4, pages: 2 });
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('types'), 'search');
  assert.equal(url.searchParams.get('source'), 'joox');
  assert.equal(url.searchParams.get('name'), 'A&B / 现场');
  assert.equal(url.searchParams.get('count'), '4');
  assert.equal(url.searchParams.get('pages'), '2');
});

test('maps URL, cover, and lyric responses', async () => {
  const responses = [
    { url: 'https://cdn.example/song.mp3', br: 320, size: 1234 },
    { url: 'https://cdn.example/cover.jpg' },
    { lyric: '[00:01.00]hello', tlyric: '[00:01.00]你好' },
  ];
  const client = api.createGdStudioClient({ requestJson: async () => responses.shift() });
  assert.deepEqual(await client.songUrl({ source: 'netease', id: '42', br: 320 }), {
    provider: 'gdstudio', source: 'gdstudio', url: 'https://cdn.example/song.mp3', br: 320,
    size: 1234, playable: true,
  });
  assert.deepEqual(await client.cover({ source: 'netease', id: 'pic-42', size: 500 }), {
    provider: 'gdstudio', source: 'gdstudio', url: 'https://cdn.example/cover.jpg', playable: true,
  });
  assert.deepEqual(await client.lyric({ source: 'netease', id: '42' }), {
    provider: 'gdstudio', source: 'gdstudio', lyric: '[00:01.00]hello', tlyric: '[00:01.00]你好',
  });
});

test('retries one transient request but refuses rate-limit responses', async () => {
  let attempts = 0;
  const client = api.createGdStudioClient({
    requestJson: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('temporary');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return [];
    },
    sleep: async () => {},
  });
  await client.search({ name: 'retry' });
  assert.equal(attempts, 2);

  const limited = api.createGdStudioClient({
    requestJson: async () => {
      const error = new Error('HTTP 429');
      error.statusCode = 429;
      throw error;
    },
    sleep: async () => {},
  });
  await assert.rejects(() => limited.search({ name: 'limited' }), (error) => error.code === 'GDS_RATE_LIMIT');
});

test('enforces a five-minute request window below the upstream limit', async () => {
  let now = 1000;
  let calls = 0;
  const client = api.createGdStudioClient({
    requestJson: async () => { calls += 1; return []; },
    now: () => now,
    requestWindowMax: 2,
  });
  await client.search({ name: 'one' });
  await client.search({ name: 'two' });
  await assert.rejects(() => client.search({ name: 'three' }), (error) => error.code === 'GDS_RATE_LIMIT');
  assert.equal(calls, 2);
  now += 5 * 60 * 1000 + 1;
  await client.search({ name: 'after-window' });
  assert.equal(calls, 3);
});
