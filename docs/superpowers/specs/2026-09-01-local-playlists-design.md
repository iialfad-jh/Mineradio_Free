# Local Playlists Design

## Goal

Add a first local-playlist workflow that lets a Mineradio user create a playlist, add online or imported local tracks, browse it in the existing playlist panel, and play it after restarting the app. The feature must not use online account APIs or restore any removed provider login path.

## Scope

This first release supports:

- creating a local playlist from the existing collect dialog;
- adding a search result, queue item, current song, or detail-row song to a local playlist;
- showing local playlists in the existing Playlists tab;
- opening a playlist and playing its stored songs as the queue;
- removing a stored song from an opened playlist;
- deleting a local playlist;
- persistence in renderer `localStorage`.

It does not support renaming, artwork uploads, playlist sharing, cloud sync, imports from online services, or album-wide additions.

## Alternatives Considered

1. `localStorage` in the renderer. Recommended for this prototype because it requires no Electron IPC, works with the current browser-based UI, and survives normal app restarts.
2. An Electron user-data JSON file. This avoids browser storage quotas but adds a new main-process/preload contract. It is deferred until a larger library or cross-window requirement exists.
3. Reusing the removed online playlist APIs. Rejected because GD Studio has no authenticated playlist-write contract and the project explicitly removed third-party account paths.

## Data Model

Store one versioned document under `mineradio-local-playlists-v1`:

```js
{
  version: 1,
  playlists: [
    {
      id: 'local-<timestamp>-<random>',
      provider: 'local',
      source: 'local',
      name: '我的歌单',
      createdAt: 0,
      updatedAt: 0,
      songs: [songSnapshot]
    }
  ]
}
```

`songSnapshot` is a cloned, JSON-safe copy of the current normalized song object. It keeps the GD Studio song id, source, URL metadata, cover/lyric identifiers, title, artists, album, and local-file fields when present. Runtime-only fields and functions are excluded. A playlist keeps at most 500 tracks, and a duplicate is identified by the existing `queueItemKey(song)` when available, otherwise by provider/source plus song id, local key, or title and artist.

The UI derives `trackCount`, `cover`, and `creator: '本地歌单'` from the stored playlist. The local catalog is separate from `userPlaylists`, which remains reserved for legacy provider data still present in source history.

## Architecture

Create a focused `local-playlists` renderer module loaded before the playlist panel and track-detail modules. It owns normalization, persistence, mutation, and lookup. Its public functions are:

```js
readLocalPlaylists()
createLocalPlaylist(name)
addSongToLocalPlaylist(playlistId, song)
removeSongFromLocalPlaylist(playlistId, songIndex)
deleteLocalPlaylist(playlistId)
getLocalPlaylist(playlistId)
localPlaylistCatalogRows()
playLocalPlaylist(playlistId)
```

Each mutation writes the complete versioned document, refreshes the playlist panel and shelf through existing safe render helpers, and reports a concise result object rather than calling remote APIs.

The existing collect dialog becomes dual-purpose. For a GD Studio or local track it opens a local-playlist view, lets the user create a playlist, and adds the selected track to it. The old account-adapter path remains disabled and is not reintroduced.

The Playlists tab merges `localPlaylistCatalogRows()` with the existing catalog rows. Local cards open their saved song list without a network request. The playlist detail view displays a remove control for each local row and a delete-playlist action. Selecting Play plays the stored song snapshots with the current playback path.

## Error Handling

- Blank or whitespace-only names are rejected.
- Playlist names are trimmed and limited to 40 characters.
- Missing or malformed storage is treated as an empty local catalog.
- Storage write errors leave in-memory data unchanged and show a local-save failure notice.
- Adding a duplicate song returns a non-error result and informs the user that the track is already present.
- A missing playlist, invalid index, or empty playlist is handled without changing the queue.

## Tests

Add isolated Node tests for the storage module using a Map-backed `localStorage` double. Cover creation and restart-style reload, adding an online song snapshot, adding a local song snapshot, duplicate prevention, deleting songs and playlists, malformed-storage recovery, and storage-write failure.

Add renderer-contract tests that verify the GD Studio runtime uses the local playlist adapter for collect actions and that the playlist panel routes local cards to the local stored tracks without an online playlist endpoint.

## Acceptance Criteria

1. A user can create a named playlist from the existing collect action while browsing a GD Studio search result.
2. The selected song appears in that playlist and can be played.
3. The playlist and its tracks remain after fully restarting the app.
4. A user can remove a track or delete a local playlist.
5. No online login, cookie, account, or third-party playlist route is loaded or called.
