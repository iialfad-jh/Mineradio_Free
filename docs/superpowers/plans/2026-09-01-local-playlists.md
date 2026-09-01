# Local Playlists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, persistent playlist prototype that can store and play GD Studio or imported local tracks without any online account API.

**Architecture:** A new renderer module owns a versioned `localStorage` document and returns derived local playlist rows. The existing playlist panel, collect dialog, and playback queue use that module at interaction time, so no Electron IPC, login state, or network playlist endpoint is introduced.

**Tech Stack:** Browser JavaScript, `localStorage`, existing global renderer modules, Node `node:test` and `node:vm`.

## Global Constraints

- Store all local playlist data under `mineradio-local-playlists-v1` as `{ version: 1, playlists: [] }`.
- Do not add or call online account, login, cookie, or third-party playlist routes.
- Keep each playlist to 500 tracks and reject blank names or duplicate songs.
- Preserve imported local-song fields and GD Studio song identifiers in stored JSON-safe snapshots.
- Use the existing `showToast`, `safeRenderQueuePanel`, `safeShelfRebuild`, and `playQueueAt` paths at runtime when they are available.
- Run the full Node test suite before the final commit.

---

## File Structure

- Create `public/js/modules/05-playback/02a-local-playlists.js`: versioned storage, snapshotting, playlist mutations, derived card rows, and playback handoff.
- Modify `public/js/index-loader.js`: load the new module after listen statistics and before playlist/collect consumers.
- Modify `public/js/modules/06-lyrics/01-playlist-panel-shell.js`: populate the playlist catalog from local playlist rows.
- Modify `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`: make the existing collect dialog create and add to local playlists.
- Modify `public/js/modules/06-lyrics/02-playlist-detail.js`: show, play, remove tracks from, and delete a local playlist without fetching a remote endpoint.
- Create `tests/local-playlists.test.js`: isolated storage and mutation tests with a Map-backed `localStorage` double.
- Modify `tests/gdstudio-renderer-contract.test.js`: enforce the loader and no-online-route integration contract.

## Shared Interfaces

`public/js/modules/05-playback/02a-local-playlists.js` exposes the following global functions:

```js
readLocalPlaylists() // Array<LocalPlaylist>
localPlaylistCatalogRows() // Array<PlaylistCard>
getLocalPlaylist(id) // LocalPlaylist | null
createLocalPlaylist(name) // { ok, playlist?, error? }
addSongToLocalPlaylist(id, song) // { ok, added, playlist?, error? }
removeSongFromLocalPlaylist(id, index) // { ok, playlist?, error? }
deleteLocalPlaylist(id) // { ok, error? }
playLocalPlaylist(id, startIndex, opts) // Promise<boolean>
syncLocalPlaylistCatalog(opts) // Array<PlaylistCard>
```

`LocalPlaylist` stores `{ id, provider: 'local', source: 'local', name, createdAt, updatedAt, songs }`. `PlaylistCard` is a derived copy with `trackCount`, `cover`, and `creator: '本地歌单'`.

### Task 1: Persistent Local Playlist Store

**Files:**
- Create: `public/js/modules/05-playback/02a-local-playlists.js`
- Create: `tests/local-playlists.test.js`

**Interfaces:**
- Consumes: `localStorage`, and lazily reads `queueItemKey(song)` when it exists.
- Produces: all shared storage interfaces listed above except `playLocalPlaylist`, which is added in Task 3.

- [ ] **Step 1: Write the failing storage tests**

Create `tests/local-playlists.test.js` with a Map-backed storage implementation and a VM that loads only the new module. Include these assertions:

```js
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
  assert.deepEqual(sandbox.readLocalPlaylists(), []);
  assert.equal(sandbox.createLocalPlaylist('   ').error, 'NAME_REQUIRED');
  const id = sandbox.createLocalPlaylist('收藏').playlist.id;
  assert.equal(sandbox.addSongToLocalPlaylist(id, { id: '1', name: '歌', artist: '歌手' }).added, true);
  assert.equal(sandbox.addSongToLocalPlaylist(id, { id: '1', name: '歌', artist: '歌手' }).error, 'DUPLICATE_SONG');
  assert.equal(sandbox.removeSongFromLocalPlaylist(id, 9).error, 'SONG_NOT_FOUND');
  assert.equal(sandbox.deleteLocalPlaylist('missing').error, 'PLAYLIST_NOT_FOUND');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/local-playlists.test.js
```

Expected: FAIL because `02a-local-playlists.js` does not exist and the storage functions are unavailable.

- [ ] **Step 3: Implement the versioned storage module**

Create `public/js/modules/05-playback/02a-local-playlists.js`. Use this core shape:

```js
'use strict';

var LOCAL_PLAYLIST_STORE_KEY = 'mineradio-local-playlists-v1';
var LOCAL_PLAYLIST_STORE_VERSION = 1;
var LOCAL_PLAYLIST_MAX_SONGS = 500;
var localPlaylists = readLocalPlaylists();

function readLocalPlaylists() {
  try {
    var raw = localStorage.getItem(LOCAL_PLAYLIST_STORE_KEY);
    var value = raw ? JSON.parse(raw) : null;
    if (!value || value.version !== LOCAL_PLAYLIST_STORE_VERSION || !Array.isArray(value.playlists)) return [];
    return value.playlists.map(normalizeLocalPlaylist).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function writeLocalPlaylists(next) {
  var normalized = (next || []).map(normalizeLocalPlaylist).filter(Boolean);
  localStorage.setItem(LOCAL_PLAYLIST_STORE_KEY, JSON.stringify({ version: LOCAL_PLAYLIST_STORE_VERSION, playlists: normalized }));
  localPlaylists = normalized;
  return localPlaylists;
}

function createLocalPlaylist(name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };
  var now = Date.now();
  var playlist = { id: 'local-' + now + '-' + Math.random().toString(36).slice(2, 8), provider: 'local', source: 'local', name: name, createdAt: now, updatedAt: now, songs: [] };
  try { writeLocalPlaylists(localPlaylists.concat([playlist])); }
  catch (e) { return { ok: false, error: 'STORAGE_WRITE_FAILED' }; }
  return { ok: true, playlist: getLocalPlaylist(playlist.id) };
}

function syncLocalPlaylistCatalog() {
  return localPlaylistCatalogRows();
}
```

Implement `normalizeLocalPlaylist`, `localPlaylistSongSnapshot`, `localPlaylistSongKey`, `addSongToLocalPlaylist`, `removeSongFromLocalPlaylist`, `deleteLocalPlaylist`, `getLocalPlaylist`, and `localPlaylistCatalogRows` in the same module. `addSongToLocalPlaylist` must clone the input before saving, reject a duplicate key with `{ ok: false, added: false, error: 'DUPLICATE_SONG' }`, and call `syncLocalPlaylistCatalog({ reason: 'local-playlist-add' })` only after a successful write.

- [ ] **Step 4: Run the storage test to verify it passes**

Run:

```powershell
node --test tests/local-playlists.test.js
```

Expected: PASS with persistence, normalization, duplicate prevention, and invalid-mutation cases green.

- [ ] **Step 5: Commit the storage layer**

```powershell
git add public/js/modules/05-playback/02a-local-playlists.js tests/local-playlists.test.js
git commit -m "feat: add persistent local playlist storage"
```

### Task 2: Expose Local Playlists in the Existing Catalog

**Files:**
- Modify: `public/js/index-loader.js:60-86`
- Modify: `public/js/modules/06-lyrics/01-playlist-panel-shell.js:480-526`
- Modify: `tests/gdstudio-renderer-contract.test.js`

**Interfaces:**
- Consumes: `localPlaylistCatalogRows()` and `syncLocalPlaylistCatalog(opts)` from Task 1.
- Produces: local playlist cards in `userPlaylists` with `provider: 'local'`.

- [ ] **Step 1: Write the failing renderer contract test**

Add this test to `tests/gdstudio-renderer-contract.test.js`:

```js
test('local playlist runtime is loaded without restoring online playlist APIs', () => {
  assert.match(loader, /05-playback\/02a-local-playlists\.js/);
  const playlistShell = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  assert.match(playlistShell, /localPlaylistCatalogRows\(\)/);
  assert.doesNotMatch(playlistShell, /\/api\/(?:qq|kugou|qishui|spotify|login)\/playlist/);
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```powershell
node --test tests/gdstudio-renderer-contract.test.js
```

Expected: FAIL because the local-playlist module is not yet included by the renderer loader and the panel does not use its catalog rows.

- [ ] **Step 3: Load and render the local catalog**

Insert this entry in `public/js/index-loader.js` immediately after `02-listen-stats.js`:

```js
'js/modules/05-playback/02a-local-playlists.js',
```

Replace the GD-only catalog reset in `rebuildUserPlaylistsFromCatalog` and `refreshUserPlaylists` with:

```js
function rebuildUserPlaylistsFromCatalog(opts) {
  opts = opts || {};
  userPlaylists = typeof localPlaylistCatalogRows === 'function' ? localPlaylistCatalogRows() : [];
  if (typeof applyUserPlaylistOrder === 'function') applyUserPlaylistOrder();
  playlistCatalogRevision += 1;
  renderUserPlaylistsList({ animate: !!opts.animate, reset: !!opts.reset, preserveScroll: opts.preserveScroll !== false });
  if (emptyHomeActive) renderHomeDiscover();
  scheduleShelfRebuild(opts.reason || 'local-playlist-catalog', true);
}

async function refreshUserPlaylists() {
  resetPlaylistPanelRenderLimit();
  rebuildUserPlaylistsFromCatalog({ reason: 'local-playlist-refresh', preserveScroll: true });
  return true;
}
```

Replace Task 1's `syncLocalPlaylistCatalog` body with this renderer-aware version. It must invoke `rebuildUserPlaylistsFromCatalog` only when available and return `localPlaylistCatalogRows()` without making HTTP calls:

```js
function syncLocalPlaylistCatalog(opts) {
  if (typeof rebuildUserPlaylistsFromCatalog === 'function') {
    rebuildUserPlaylistsFromCatalog(Object.assign({ reason: 'local-playlist-sync', preserveScroll: true }, opts || {}));
  }
  return localPlaylistCatalogRows();
}
```

- [ ] **Step 4: Run the renderer contract test to verify it passes**

Run:

```powershell
node --test tests/gdstudio-renderer-contract.test.js
```

Expected: PASS, including existing checks that prevent legacy provider routes in loaded modules.

- [ ] **Step 5: Commit the catalog integration**

```powershell
git add public/js/index-loader.js public/js/modules/05-playback/02a-local-playlists.js public/js/modules/06-lyrics/01-playlist-panel-shell.js tests/gdstudio-renderer-contract.test.js
git commit -m "feat: show local playlists in the catalog"
```

### Task 3: Reuse the Collect Dialog for Local Playlist Creation and Additions

**Files:**
- Modify: `public/js/modules/05-playback/06-track-detail-lyrics-actions.js:1283-1458`
- Test: `tests/local-playlists.test.js`

**Interfaces:**
- Consumes: `createLocalPlaylist(name)`, `addSongToLocalPlaylist(id, song)`, `localPlaylistCatalogRows()`, and `getLocalPlaylist(id)` from Task 1.
- Produces: GD Studio and imported local songs can use the existing collect icon without login or remote writes.

- [ ] **Step 1: Write the failing collect-flow contract test**

Append these source assertions to `tests/local-playlists.test.js`:

```js
const collectSource = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js'), 'utf8');

test('collect dialog routes GD Studio songs to local playlist mutations', () => {
  assert.match(collectSource, /createLocalPlaylist\(name\)/);
  assert.match(collectSource, /addSongToLocalPlaylist\(pid, targetSong\)/);
  assert.doesNotMatch(namedFunctionSource(collectSource, 'openCollectModal'), /ensureLoggedInForAction/);
});
```

Reuse the `namedFunctionSource` helper from `tests/search-frontend-pagination.test.js` or copy its complete implementation into this test file.

- [ ] **Step 2: Run the collect-flow test to verify it fails**

Run:

```powershell
node --test tests/local-playlists.test.js
```

Expected: FAIL because `openCollectModal` currently rejects GD Studio songs before opening the dialog.

- [ ] **Step 3: Replace remote collect behavior with local mutations**

Replace `openCollectModal` with a local-only path:

```js
function openCollectModal(song) {
  if (!song || !song.name) { showToast('当前歌曲信息不完整'); return; }
  collectTargetSong = song;
  renderCollectModal();
  openGsapModal(document.getElementById('collect-modal'));
}
```

In `renderCollectModal`, remove login and provider-adapter checks. Build the selectable list from `localPlaylistCatalogRows()` and show `还没有本地歌单，可以先新建一个` when empty.

Replace `createPlaylistFromCollect` and `addCollectTargetToPlaylist` with:

```js
function createPlaylistFromCollect() {
  var input = document.getElementById('collect-new-name');
  var result = createLocalPlaylist(input && input.value);
  if (!result.ok) { showToast(result.error === 'NAME_REQUIRED' ? '先输入歌单名称' : '本地歌单保存失败'); return; }
  if (input) input.value = '';
  showToast('本地歌单已创建');
  addCollectTargetToPlaylist(result.playlist.id);
}

function addCollectTargetToPlaylist(pid) {
  if (!collectTargetSong || !pid) return;
  var result = addSongToLocalPlaylist(pid, collectTargetSong);
  if (result.ok) { showToast('已加入本地歌单'); closeCollectModal(); return; }
  showToast(result.error === 'DUPLICATE_SONG' ? '歌曲已在歌单中' : '加入本地歌单失败');
}
```

Do not call `apiJson`, `ensureLoggedInForAction`, or a provider playlist adapter from these local collect functions.

- [ ] **Step 4: Run the collect-flow and storage tests to verify they pass**

Run:

```powershell
node --test tests/local-playlists.test.js
```

Expected: PASS with the new local collection assertions and all persistence cases green.

- [ ] **Step 5: Commit the collect integration**

```powershell
git add public/js/modules/05-playback/06-track-detail-lyrics-actions.js tests/local-playlists.test.js
git commit -m "feat: collect songs into local playlists"
```

### Task 4: Open, Play, Remove, and Delete Local Playlists

**Files:**
- Modify: `public/js/modules/05-playback/02a-local-playlists.js`
- Modify: `public/js/modules/06-lyrics/02-playlist-detail.js:116-178,257-277,401-482,710-747`
- Modify: `tests/local-playlists.test.js`
- Modify: `tests/gdstudio-renderer-contract.test.js`

**Interfaces:**
- Consumes: Task 1 mutation functions and local catalog rows.
- Produces: local playlist details with playback, per-song removal, and playlist deletion, with no `apiJson` call for local playlists.

- [ ] **Step 1: Write the failing detail and playback tests**

Add a VM test for `playLocalPlaylist` to `tests/local-playlists.test.js`:

```js
test('plays a saved local playlist through the existing queue path', async () => {
  const sandbox = loadLocalPlaylistModule();
  const list = sandbox.createLocalPlaylist('出发').playlist;
  sandbox.addSongToLocalPlaylist(list.id, { provider: 'gdstudio', id: '2', name: '晴天', artist: '周杰伦' });
  sandbox.playQueueAt = async (index) => { sandbox.playedIndex = index; };
  sandbox.safeRenderQueuePanel = () => {};
  sandbox.safeSwitchPlaylistTab = () => {};
  sandbox.safeShelfRebuild = () => {};
  sandbox.cancelPlaylistQueueHydration = () => {};
  assert.equal(await sandbox.playLocalPlaylist(list.id, 0, { autoplay: true }), true);
  assert.equal(sandbox.playQueue[0].name, '晴天');
  assert.equal(sandbox.playedIndex, 0);
});
```

Add source assertions that `openPlaylistPanelDetail` branches for `provider === 'local'`, `playlistPanelDetailHtml` emits `data-pl-detail-delete`, and local detail rows emit `data-pl-detail-remove`.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
node --test tests/local-playlists.test.js tests/gdstudio-renderer-contract.test.js
```

Expected: FAIL because local playlists cannot yet populate detail state or play without the empty remote playlist endpoint.

- [ ] **Step 3: Add local playback and local detail branches**

Add `playLocalPlaylist` to the storage module:

```js
async function playLocalPlaylist(id, startIndex, opts) {
  opts = opts || {};
  var playlist = getLocalPlaylist(id);
  if (!playlist || !playlist.songs.length) { if (typeof showToast === 'function') showToast('歌单为空'); return false; }
  if (typeof cancelPlaylistQueueHydration === 'function') cancelPlaylistQueueHydration('local-playlist');
  playQueue = playlist.songs.map(function (song) { return Object.assign({}, song); });
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(startIndex) || 0));
  if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('local-playlist-play', { animate: true, scrollCurrent: true, deferWhenHidden: false });
  if (typeof safeSwitchPlaylistTab === 'function') safeSwitchPlaylistTab('queue', 'local-playlist-play');
  if (typeof safeShelfRebuild === 'function') safeShelfRebuild('local-playlist-play', true);
  if (opts.autoplay !== false && typeof playQueueAt === 'function') await playQueueAt(currentIdx, { preserveHomeState: !!opts.preserveHomeState });
  return true;
}
```

In `openPlaylistPanelDetail`, before `loadMorePlaylistPanelDetailTracks('initial')`, resolve a local playlist when `provider === 'local'`, initialize state with cloned local songs, `loading: false`, `hasMore: false`, and render without calling `apiJson`.

In `playPlaylistPanelDetail` and `playPlaylistPanelDetailTrack`, route local playlists to `playLocalPlaylist(pid, index, { autoplay: true, preserveHomeState: true })`.

For a local detail, render these buttons in `playlistPanelDetailHtml`:

```js
'<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-pl-detail-delete="1">删除歌单</button>'
```

For each local row, render:

```js
'<button type="button" class="pl-detail-row-remove" data-pl-detail-remove="' + i + '" title="从歌单移除">移除</button>'
```

Handle those attributes before the normal row click handler. `data-pl-detail-remove` calls `removeSongFromLocalPlaylist(pid, index)`, refreshes state from `getLocalPlaylist(pid)`, and rerenders. `data-pl-detail-delete` calls `deleteLocalPlaylist(pid)`, clears `playlistPanelDetailState`, and rerenders the catalog. Both handlers must stop propagation so they do not start playback.

- [ ] **Step 4: Run the local playlist tests and full test suite**

Run:

```powershell
node --test tests/local-playlists.test.js tests/gdstudio-renderer-contract.test.js
node --test (Get-ChildItem tests -Filter '*.test.js' | Select-Object -ExpandProperty FullName)
```

Expected: all focused tests pass, then the full suite reports zero failures.

- [ ] **Step 5: Perform a desktop smoke check**

Run the app with `npm start`, search for a song, use the collect button to create a local playlist, close and reopen the app, then confirm the playlist appears in the Playlists tab and starts the saved song queue. Remove one song, delete the playlist, and confirm both changes survive an app restart.

- [ ] **Step 6: Commit the finished feature**

```powershell
git add public/js/modules/05-playback/02a-local-playlists.js public/js/modules/06-lyrics/02-playlist-detail.js tests/local-playlists.test.js tests/gdstudio-renderer-contract.test.js
git commit -m "feat: play and manage local playlists"
```

## Plan Self-Review

- Spec coverage: Task 1 persists versioned playlists and snapshots; Task 2 exposes the catalog; Task 3 creates and adds through the existing dialog; Task 4 plays, removes, and deletes. All first-release acceptance criteria have a corresponding task.
- Placeholder scan: this plan contains no incomplete implementation markers or generic testing instructions.
- Type consistency: every later task uses the exact Task 1 interfaces, and local card ids remain raw `local-*` ids passed through `playlistPanelProviderId`.
