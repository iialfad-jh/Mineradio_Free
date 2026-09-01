'use strict';

var LOCAL_PLAYLIST_STORE_KEY = 'mineradio-local-playlists-v1';
var LOCAL_PLAYLIST_STORE_VERSION = 1;
var LOCAL_PLAYLIST_MAX_SONGS = 500;
var localPlaylists = readLocalPlaylists();

function localPlaylistJsonClone(value) {
  try {
    var serialized = JSON.stringify(value);
    return serialized === undefined ? null : JSON.parse(serialized);
  } catch (e) {
    return null;
  }
}

function localPlaylistSongSnapshot(song) {
  if (!song || typeof song !== 'object') return null;
  var snapshot = localPlaylistJsonClone(song);
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null;
}

function normalizeLocalPlaylist(playlist) {
  if (!playlist || typeof playlist !== 'object') return null;
  var id = String(playlist.id || '').trim();
  var name = String(playlist.name || '').trim().slice(0, 40);
  if (!id || !name) return null;
  var songs = Array.isArray(playlist.songs) ? playlist.songs : [];
  return {
    id: id,
    provider: 'local',
    source: 'local',
    name: name,
    createdAt: Math.max(0, Number(playlist.createdAt) || 0),
    updatedAt: Math.max(0, Number(playlist.updatedAt) || 0),
    songs: songs.map(localPlaylistSongSnapshot).filter(Boolean).slice(0, LOCAL_PLAYLIST_MAX_SONGS),
  };
}

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
  localStorage.setItem(LOCAL_PLAYLIST_STORE_KEY, JSON.stringify({
    version: LOCAL_PLAYLIST_STORE_VERSION,
    playlists: normalized,
  }));
  localPlaylists = normalized;
  return localPlaylists;
}

function localPlaylistSongKey(song) {
  song = song || {};
  try {
    if (typeof queueItemKey === 'function') {
      var queueKey = String(queueItemKey(song) || '').trim();
      if (queueKey) return queueKey;
    }
  } catch (e) { }
  var provider = String(song.provider || song.source || song.gdstudioSource || '').trim().toLowerCase();
  var source = String(song.source || song.gdstudioSource || song.provider || '').trim().toLowerCase();
  var id = String(song.id || song.providerSongId || song.localFileId || song.mid || song.songmid || '').trim();
  if (id) return [provider, source, id].join(':');
  var localUrl = String(song.localUrl || song.url || '').trim();
  if (localUrl) return [provider, source, localUrl].join(':');
  var name = String(song.name || song.title || '').trim().toLowerCase();
  var artist = String(song.artist || song.artists || '').trim().toLowerCase();
  return name || artist ? [provider, source, name, artist].join(':') : '';
}

function getLocalPlaylist(playlistId) {
  var id = String(playlistId || '');
  for (var index = 0; index < localPlaylists.length; index += 1) {
    if (localPlaylists[index].id === id) return localPlaylistJsonClone(localPlaylists[index]);
  }
  return null;
}

function createLocalPlaylist(name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };
  var now = Date.now();
  var playlist = {
    id: 'local-' + now + '-' + Math.random().toString(36).slice(2, 8),
    provider: 'local',
    source: 'local',
    name: name,
    createdAt: now,
    updatedAt: now,
    songs: [],
  };
  try {
    writeLocalPlaylists(localPlaylists.concat([playlist]));
  } catch (e) {
    return { ok: false, error: 'STORAGE_WRITE_FAILED' };
  }
  syncLocalPlaylistCatalog({ reason: 'local-playlist-create' });
  return { ok: true, playlist: getLocalPlaylist(playlist.id) };
}

function addSongToLocalPlaylist(playlistId, song) {
  var songSnapshot = localPlaylistSongSnapshot(song);
  if (!songSnapshot) return { ok: false, added: false, error: 'SONG_REQUIRED' };
  var songKey = localPlaylistSongKey(songSnapshot);
  if (!songKey) return { ok: false, added: false, error: 'SONG_REQUIRED' };
  var playlistIndex = localPlaylists.findIndex(function (playlist) { return playlist.id === String(playlistId || ''); });
  if (playlistIndex < 0) return { ok: false, added: false, error: 'PLAYLIST_NOT_FOUND' };
  var playlist = localPlaylists[playlistIndex];
  if (playlist.songs.some(function (existing) { return localPlaylistSongKey(existing) === songKey; })) {
    return { ok: false, added: false, error: 'DUPLICATE_SONG' };
  }
  if (playlist.songs.length >= LOCAL_PLAYLIST_MAX_SONGS) return { ok: false, added: false, error: 'PLAYLIST_FULL' };
  var updated = localPlaylistJsonClone(playlist);
  updated.songs.push(songSnapshot);
  updated.updatedAt = Date.now();
  var next = localPlaylists.slice();
  next[playlistIndex] = updated;
  try {
    writeLocalPlaylists(next);
  } catch (e) {
    return { ok: false, added: false, error: 'STORAGE_WRITE_FAILED' };
  }
  syncLocalPlaylistCatalog({ reason: 'local-playlist-add' });
  return { ok: true, added: true, playlist: getLocalPlaylist(playlistId) };
}

function removeSongFromLocalPlaylist(playlistId, songIndex) {
  var playlistIndex = localPlaylists.findIndex(function (playlist) { return playlist.id === String(playlistId || ''); });
  if (playlistIndex < 0) return { ok: false, removed: false, error: 'PLAYLIST_NOT_FOUND' };
  var index = Number(songIndex);
  var playlist = localPlaylists[playlistIndex];
  if (!Number.isInteger(index) || index < 0 || index >= playlist.songs.length) return { ok: false, removed: false, error: 'SONG_NOT_FOUND' };
  var updated = localPlaylistJsonClone(playlist);
  updated.songs.splice(index, 1);
  updated.updatedAt = Date.now();
  var next = localPlaylists.slice();
  next[playlistIndex] = updated;
  try {
    writeLocalPlaylists(next);
  } catch (e) {
    return { ok: false, removed: false, error: 'STORAGE_WRITE_FAILED' };
  }
  syncLocalPlaylistCatalog({ reason: 'local-playlist-remove' });
  return { ok: true, removed: true, playlist: getLocalPlaylist(playlistId) };
}

function deleteLocalPlaylist(playlistId) {
  var playlistIndex = localPlaylists.findIndex(function (playlist) { return playlist.id === String(playlistId || ''); });
  if (playlistIndex < 0) return { ok: false, deleted: false, error: 'PLAYLIST_NOT_FOUND' };
  var next = localPlaylists.slice();
  next.splice(playlistIndex, 1);
  try {
    writeLocalPlaylists(next);
  } catch (e) {
    return { ok: false, deleted: false, error: 'STORAGE_WRITE_FAILED' };
  }
  syncLocalPlaylistCatalog({ reason: 'local-playlist-delete' });
  return { ok: true, deleted: true };
}

function localPlaylistCatalogRows() {
  return localPlaylists.map(function (playlist) {
    var firstSong = playlist.songs[0] || {};
    return {
      id: playlist.id,
      provider: 'local',
      source: 'local',
      name: playlist.name,
      trackCount: playlist.songs.length,
      cover: firstSong.cover || firstSong.pic || firstSong.albumCover || '',
      creator: '\u672c\u5730\u6b4c\u5355',
    };
  });
}

function syncLocalPlaylistCatalog(opts) {
  if (typeof rebuildUserPlaylistsFromCatalog === 'function') {
    rebuildUserPlaylistsFromCatalog(Object.assign({
      reason: 'local-playlist-sync',
      preserveScroll: true,
    }, opts || {}));
  }
  return localPlaylistCatalogRows();
}

async function playLocalPlaylist(id, startIndex, opts) {
  opts = opts || {};
  var playlist = getLocalPlaylist(id);
  if (!playlist || !playlist.songs.length) {
    if (typeof showToast === 'function') showToast('歌单为空');
    return false;
  }
  if (typeof cancelPlaylistQueueHydration === 'function') cancelPlaylistQueueHydration('local-playlist');
  playQueue = playlist.songs.map(function (song) { return Object.assign({}, song); });
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(startIndex) || 0));
  if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('local-playlist-play', { animate: true, scrollCurrent: true, deferWhenHidden: false });
  if (typeof safeSwitchPlaylistTab === 'function') safeSwitchPlaylistTab('queue', 'local-playlist-play');
  if (typeof safeShelfRebuild === 'function') safeShelfRebuild('local-playlist-play', true);
  if (opts.autoplay !== false && typeof playQueueAt === 'function') await playQueueAt(currentIdx, { preserveHomeState: !!opts.preserveHomeState });
  return true;
}
