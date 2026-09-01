const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const modulePath = path.join(
  __dirname,
  '..',
  'public',
  'js',
  'modules',
  '05-playback',
  '02a-local-playlists.js'
);

function loadLocalPlaylistModule(values, options) {
  const store = values || new Map();
  const settings = options || {};
  const sandbox = {
    Date,
    JSON,
    Math,
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) {
        if (settings.failWrites) throw new Error('storage unavailable');
        store.set(key, String(value));
      },
    },
    __values: store,
  };
  if (typeof settings.rebuildUserPlaylistsFromCatalog === 'function') {
    sandbox.rebuildUserPlaylistsFromCatalog = settings.rebuildUserPlaylistsFromCatalog;
  }
  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), sandbox, { filename: modulePath });
  return sandbox;
}

test('refreshes the catalog after every successful local playlist mutation', () => {
  const syncReasons = [];
  const sandbox = loadLocalPlaylistModule(undefined, {
    rebuildUserPlaylistsFromCatalog(options) { syncReasons.push(options.reason); },
  });
  const created = sandbox.createLocalPlaylist('Sync targets');
  assert.equal(created.ok, true);
  assert.equal(sandbox.addSongToLocalPlaylist(created.playlist.id, { id: 'song-1', name: 'Song', artist: 'Artist' }).ok, true);
  assert.equal(sandbox.removeSongFromLocalPlaylist(created.playlist.id, 0).ok, true);
  assert.equal(sandbox.deleteLocalPlaylist(created.playlist.id).ok, true);
  assert.deepEqual(syncReasons, [
    'local-playlist-create',
    'local-playlist-add',
    'local-playlist-remove',
    'local-playlist-delete',
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(loadLocalPlaylistModule().syncLocalPlaylistCatalog())), []);
});

test('keeps local playlist memory unchanged when storage writes fail', () => {
  const storage = new Map();
  const writable = loadLocalPlaylistModule(storage);
  const created = writable.createLocalPlaylist('Write failure');
  assert.equal(writable.addSongToLocalPlaylist(created.playlist.id, { id: 'song-1', name: 'Saved', artist: 'Artist' }).ok, true);
  const storedBeforeFailure = storage.get('mineradio-local-playlists-v1');
  const failing = loadLocalPlaylistModule(storage, { failWrites: true });

  assert.equal(failing.addSongToLocalPlaylist(created.playlist.id, { id: 'song-2', name: 'Unsaved', artist: 'Artist' }).error, 'STORAGE_WRITE_FAILED');
  assert.equal(storage.get('mineradio-local-playlists-v1'), storedBeforeFailure);
  assert.deepEqual(JSON.parse(JSON.stringify(failing.getLocalPlaylist(created.playlist.id).songs.map((song) => song.id))), ['song-1']);
});

test('persists a named local playlist and a GD Studio song snapshot', () => {
  const sandbox = loadLocalPlaylistModule();
  const created = sandbox.createLocalPlaylist('夜间驾驶');
  assert.equal(created.ok, true);
  assert.equal(sandbox.addSongToLocalPlaylist(created.playlist.id, {
    provider: 'gdstudio', source: 'gdstudio', id: '5257138', providerSongId: '5257138',
    gdstudioSource: 'netease', name: '屋顶', artist: '周杰伦', album: '男女情歌对唱冠军全记录'
  }).added, true);
  const reloaded = loadLocalPlaylistModule(sandbox.__values);
  assert.deepEqual(reloaded.readLocalPlaylists()[0].songs[0].id, '5257138');
});

test('rejects duplicate songs, malformed storage, invalid names, and invalid mutations', () => {
  const sandbox = loadLocalPlaylistModule(new Map([['mineradio-local-playlists-v1', '{bad json']]));
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.readLocalPlaylists())), []);
  assert.equal(sandbox.createLocalPlaylist('   ').error, 'NAME_REQUIRED');
  const id = sandbox.createLocalPlaylist('收藏').playlist.id;
  assert.equal(sandbox.addSongToLocalPlaylist(id, {}).error, 'SONG_REQUIRED');
  assert.equal(sandbox.addSongToLocalPlaylist(id, { id: '1', name: '歌', artist: '歌手' }).added, true);
  assert.equal(sandbox.addSongToLocalPlaylist(id, { id: '1', name: '歌', artist: '歌手' }).error, 'DUPLICATE_SONG');
  assert.equal(sandbox.removeSongFromLocalPlaylist(id, 9).error, 'SONG_NOT_FOUND');
  assert.equal(sandbox.deleteLocalPlaylist('missing').error, 'PLAYLIST_NOT_FOUND');
});

test('keeps JSON-safe local song fields, caps playlists, and derives catalog rows', () => {
  const sandbox = loadLocalPlaylistModule();
  const created = sandbox.createLocalPlaylist(' Local files ');
  const song = {
    id: 'local-1', name: 'Offline', artist: 'Artist', album: 'Album', provider: 'local', source: 'local',
    localFileId: 'file-1', localUrl: 'mineradio-local://audio/file-1', cover: 'mineradio-local://cover/file-1',
    nested: { value: true }, callback() {}, undefinedValue: undefined,
  };
  assert.equal(sandbox.addSongToLocalPlaylist(created.playlist.id, song).added, true);
  song.name = 'Changed after save';
  const playlist = sandbox.getLocalPlaylist(created.playlist.id);
  assert.equal(playlist.songs[0].name, 'Offline');
  assert.equal(Object.hasOwn(playlist.songs[0], 'callback'), false);
  assert.equal(Object.hasOwn(playlist.songs[0], 'undefinedValue'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.localPlaylistCatalogRows())), [{
    id: created.playlist.id,
    provider: 'local', source: 'local', name: 'Local files',
    trackCount: 1, cover: 'mineradio-local://cover/file-1', creator: '本地歌单'
  }]);

  for (let index = 2; index <= 500; index += 1) {
    assert.equal(sandbox.addSongToLocalPlaylist(created.playlist.id, { id: String(index), name: String(index), artist: 'Artist' }).added, true);
  }
  assert.equal(sandbox.addSongToLocalPlaylist(created.playlist.id, { id: '501', name: '501', artist: 'Artist' }).error, 'PLAYLIST_FULL');
  assert.equal(sandbox.removeSongFromLocalPlaylist(created.playlist.id, 0).removed, true);
  assert.equal(sandbox.deleteLocalPlaylist(created.playlist.id).deleted, true);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.syncLocalPlaylistCatalog())), []);
});
