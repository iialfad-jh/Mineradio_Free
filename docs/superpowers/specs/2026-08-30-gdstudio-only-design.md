# GD Studio Only Online Music Design

## Goal

Make GD Studio the only online music service used by Mineradio. Remove runtime use of
NetEase Cloud Music, QQ Music, Kugou, Qishui, and Spotify accounts, searches, playback
routes, recommendations, and account-dependent actions while preserving local music and
the existing visual player experience.

## Scope

The change covers the Electron main process, local HTTP server, renderer state and UI,
packaging metadata, documentation, migration behavior, and regression tests.

The following remain supported:

- Local music import, persistent local library, local lyrics and covers.
- GD Studio search, audio URL resolution, cover lookup, and lyrics.
- Playback queue, history, custom covers, custom lyrics, beat analysis, visual presets,
  desktop lyrics, Wallpaper Engine, full desktop mode, and performance controls.

The following are removed from the runtime path:

- Platform login windows, QR flows, cookie/token status, membership checks, and logout.
- Platform-specific search tabs, recommendations, playlists, favorites, comments, and
  remote listen reporting.
- Direct imports and calls to the NetEase, QQ, Kugou, Qishui, and Spotify adapters.

Legacy provider source files may remain in the repository temporarily, but they must not
be imported, loaded by the renderer, included in the packaged runtime, or called by any
active route.

## Runtime Data Model

Online tracks use one provider identity:

```js
{
  provider: 'gdstudio',
  source: 'gdstudio',
  type: 'song',
  id: '<GD source-specific track id>',
  providerSongId: '<same id>',
  gdstudioSource: '<GD upstream source>',
  picId: '<GD pic_id>',
  lyricId: '<GD lyric_id>',
  name: '<title>',
  artist: '<joined artist names>',
  artists: [{ id: '', name: '<artist>' }],
  album: '<album>',
  cover: '/api/gdstudio/cover?...',
  duration: 0
}
```

`gdstudioSource` is an internal GD Studio routing value, not a Mineradio account or
platform. It is not exposed as an independent NetEase/QQ/etc. search tab. Local tracks
continue to use `type: 'local'` and `source: 'local'`.

Old provider records in localStorage are preserved as data, but startup restoration must
skip them without making a network request. Local records and visual settings continue to
restore normally.

## Server Architecture

Create `gdstudio-api.js` as the only online music adapter. It owns:

- Allowed GD source names and default-source configuration.
- Query encoding and request timeouts.
- Response validation and normalized error codes.
- Search, URL, cover, and lyric mapping.
- In-process TTL cache and a five-minute request window capped below the service limit.

The adapter must never read or attach platform cookies, tokens, or account headers.

The existing local routes are repurposed as follows:

| Route | Behavior |
| --- | --- |
| `/api/search` | Call GD `types=search`; convert renderer `offset/limit` to GD `pages/count`; return normalized `songs`. |
| `/api/song/url` | Call GD `types=url`; return normalized playback metadata and let the renderer use `/api/audio` for streaming. |
| `/api/lyric` | Call GD `types=lyric`; return `lyric` and `tlyric`. |
| `/api/gdstudio/cover` | Call GD `types=pic` and proxy the resulting image response. |
| `/api/discover/home` | Build non-account discovery from bounded GD searches and local history. |
| `/api/weather/radio` | Build weather-themed queues from bounded GD searches only. |
| `/api/platform/capabilities` | Report only `gdstudio` and `local` capabilities. |

Old platform routes and login routes return `410 PLATFORM_REMOVED` without making an
external request. Account-dependent server helpers and provider imports are removed from
the active server module.

Cache policy:

- Search results: 60 seconds.
- Audio URL metadata: at most 3 minutes because URLs may expire.
- Covers: 1 hour.
- Lyrics: 24 hours.

Transient network failures may be retried once with a bounded delay. Rate-limit,
validation, and authorization-style failures must not be retried.

## Renderer and UI

Update the renderer to use only `gdstudio` and `local` provider branches.

- Keep one unified music search mode; remove provider and podcast search tabs.
- Remove the user account button, login modal, login easter egg, startup login guide,
  cookie export, and platform logout controls.
- Replace account/personal recommendation wording with GD Studio discovery, weather
  radio, recent playback, local library, and unified search.
- Remove online playlist, favorites, comments, artist-detail, album-subscribe, and
  podcast actions. Keep the queue and expose the local library as the remaining shelf
  content.
- Keep the 3D shelf, but populate it with local-library/queue content rather than remote
  account playlists.
- Replace provider-specific quality controls with GD Studio bitrate choices: 128, 192,
  320, 740, and 999.
- Remove login/member advice from playback errors. Use GD-specific unavailable, retry,
  rate-limited, and source-fallback messages.
- Keep custom cover/lyric actions, queue operations, local beat analysis, and all visual
  and desktop integrations.

## Desktop Process and Data Cleanup

Remove active login IPC bridges and login-window code from `desktop/main.js` and
`desktop/preload.js`. Remove login-easter-egg initialization and provider credential
migration from the startup path.

Existing provider credential files and old localStorage entries are not deleted during
upgrade and are not read. Add a clearly labeled settings action that asks for confirmation
before deleting known legacy credential files. The action must report which files were
removed and must never delete unrelated files.

## Error and Security Boundaries

- Only the server adapter contacts GD Studio; the renderer never sends credentials to it.
- Do not log complete signed audio URLs.
- Validate source, id, bitrate, count, and page against bounded allowlists/ranges.
- Preserve audio Range handling through the existing `/api/audio` proxy.
- Treat GD Studio's source availability as dynamic and surface a retry/fallback message
  instead of presenting a provider-login prompt.
- Update README, privacy, third-party notices, and release-facing text to state the
  GD Studio CC BY-NC 4.0/non-commercial restriction, attribution requirement, and
  five-minute request limit.

## Testing and Acceptance

Add adapter tests for:

- Query construction and URL encoding.
- Search, URL, cover, and lyric response normalization.
- Malformed/empty responses, timeouts, rate limits, and bounded retries.
- Cache expiry and request-window enforcement.

Update renderer/server tests to verify:

- No active provider imports, login IPC calls, login routes, or provider search routes.
- Removed routes return `PLATFORM_REMOVED` without external calls.
- Unified search and playback use GD Studio metadata and `/api/audio`.
- Old provider playback records are skipped without network requests.
- Local music import/playback and visual/desktop features remain intact.
- Home and weather radio no longer call account providers.
- Legacy credential cleanup is explicit and scoped.

The full Node test suite must pass, and a final static scan must find no runtime references
from active files to the removed provider APIs.
