# GD Studio Only Online Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make GD Studio the only online music source while preserving local music and Mineradio's visual/desktop playback experience.

**Architecture:** Add a small, dependency-free GD Studio adapter behind a new active local HTTP server entry (`server-gdstudio.js`). Reuse the existing `/api/search`, `/api/song/url`, and `/api/lyric` contracts with a normalized `gdstudio` song model, add a cover route, and make removed account/provider routes fail closed. Keep the old `server.js` and provider adapters as historical source only; the Electron startup path and package do not load them. Collapse the renderer's provider branches to `gdstudio`/`local`, then remove login UI/IPC from the active startup path.

**Tech Stack:** Node.js built-in `http`/`https`, Electron IPC/contextBridge, browser JavaScript modules, Node `node:test`.

## Global Constraints

- GD Studio is the only online music service; no old provider request may execute.
- Local music import/playback and visual, lyrics, queue, beat, desktop lyrics, Wallpaper Engine, and full desktop features remain available.
- Existing provider credential files are preserved and never read or migrated; explicit cleanup is scoped and user-confirmed.
- GD Studio requests use only bounded public parameters and never include cookies/tokens.
- Audio streaming continues through `/api/audio` and Range support.
- Do not log complete signed audio URLs.
- Use ASCII for new code and comments.
- Every production behavior change gets a failing test before implementation.

---

### Task 1: GD Studio adapter contract

**Files:**
- Create: `gdstudio-api.js`
- Test: `tests/gdstudio-api.test.js`

**Interfaces:**
- Produces `createGdStudioClient(options)`, `normalizeGdStudioSong`, `normalizeGdStudioSearch`, `normalizeGdStudioUrl`, `normalizeGdStudioLyric`, `GDSOURCES`, and typed error codes.
- Client methods: `search({ source, name, count, pages })`, `songUrl({ source, id, br })`, `cover({ source, id, size })`, `lyric({ source, id })`.

- [ ] Step 1: Write tests for source/bitrate bounds, encoded request construction, all four response mappings, malformed responses, one transient retry, no retry on rate-limit, and request-window refusal.
- [ ] Step 2: Run `node --test tests/gdstudio-api.test.js`; verify it fails because the adapter is absent.
- [ ] Step 3: Implement the adapter with injectable `requestJson`, TTL maps, a five-minute request ledger capped at 40 requests, and no credential headers.
- [ ] Step 4: Run the focused test and verify it passes.
- [ ] Step 5: Run `git diff --check`.

### Task 2: Server route switch and fail-closed provider routes

**Files:**
- Create: `server-gdstudio.js`
- Leave unchanged: `server.js` (historical provider server, not loaded or packaged)
- Test: `tests/gdstudio-server-routes.test.js`

**Interfaces:**
- `/api/search`, `/api/song/url`, `/api/lyric`, `/api/gdstudio/cover`, `/api/platform/capabilities` use the adapter.
- Removed online provider/login routes return `{ ok:false, error:'PLATFORM_REMOVED' }` with HTTP `410` and never call external adapters.

- [ ] Step 1: Add route-level tests using a stubbed HTTP server and source-spy assertions.
- [ ] Step 2: Run the focused test and verify failure against current provider behavior.
- [ ] Step 3: Import only `gdstudio-api.js` in the active server path, map renderer offsets to GD pages, proxy cover responses, and add a shared removed-route guard.
- [ ] Step 4: Replace account-based home/weather calls with bounded GD searches and local history fallback.
- [ ] Step 5: Run focused server tests and `node --check server.js`.

### Task 3: Renderer provider model and playback

**Files:**
- Modify: `public/js/modules/00-state/00-core-stores.js`
- Modify: `public/js/modules/05-playback/00-api-quality-output.js`
- Modify: `public/js/modules/05-playback/07-search.js`
- Modify: `public/js/modules/05-playback/11-provider-fallback.js`
- Modify: `public/js/modules/05-playback/13-playback-start-audio.js`
- Modify: `public/js/modules/06-lyrics/00-lyrics-fetch-parse.js`
- Modify: `public/js/modules/05-playback/01-cover-custom-map.js`
- Test: `tests/gdstudio-renderer-contract.test.js`

**Interfaces:**
- `normalizePlaybackProvider` accepts `gdstudio` and `local` only for online/local routing.
- `searchProviderUrl('gdstudio', ...)` returns `/api/search`.
- GD songs carry `provider/source: 'gdstudio'`, `gdstudioSource`, `picId`, and `lyricId`.

- [ ] Step 1: Add source-inspection tests proving one search mode, GD playback/lyric/cover routes, GD quality values, and no active provider URL branches.
- [ ] Step 2: Run the focused test and verify it fails.
- [ ] Step 3: Collapse search and playback routing to GD/local, map quality to 128/192/320/740/999, and preserve `/api/audio` proxying.
- [ ] Step 4: Update lyric and cover key helpers for GD metadata and skip old-provider records without network calls.
- [ ] Step 5: Run focused renderer tests and `node --check` against changed browser modules.

### Task 4: Home, weather, queue, and shelf data

**Files:**
- Modify: `public/js/modules/05-playback/03-home-discover-weather.js`
- Modify: `public/js/modules/05-playback/03a-home-dashboard.js`
- Modify: `public/js/modules/04-shelf/01-manager-core.js`
- Modify: `public/js/modules/04-shelf/03-content-list-manager.js`
- Modify: `public/js/modules/06-lyrics/01-playlist-panel-shell.js`
- Modify: `public/js/modules/06-lyrics/02-playlist-detail.js`
- Test: `tests/gdstudio-home-local-surface.test.js`

- [ ] Step 1: Add tests asserting Home/weather endpoints are GD-only, online playlist tabs are absent, and shelf content falls back to local library/queue.
- [ ] Step 2: Run the focused test and verify failure.
- [ ] Step 3: Replace account discovery with bounded GD searches, retain recent local listening, remove provider playlist fetches, and keep virtualized queue/local shelf behavior.
- [ ] Step 4: Run focused tests and inspect DOM strings for removed provider labels.

### Task 5: Remove login UI and active Electron login IPC

**Files:**
- Modify: `desktop/preload.js`
- Modify: `desktop/main.js`
- Modify: `public/index.html`
- Modify: `public/js/modules/00-state/00-core-stores.js`
- Modify: `public/js/modules/08-account/00-login-easter-egg.js`
- Modify: `public/js/modules/08-account/01-login-modal-utils.js`
- Modify: `public/js/modules/08-account/02-login-status.js`
- Modify: `public/js/modules/08-account/03-login-modal-flows.js`
- Modify: `public/js/modules/08-account/04-user-modal-logout.js`
- Modify: `public/js/modules/08-account/05-startup-login-guide.js`
- Test: `tests/gdstudio-login-removal.test.js`

- [ ] Step 1: Add tests asserting account controls, login IPC exposure, provider status polling, login routes, and login-easter-egg startup are absent.
- [ ] Step 2: Run the focused test and verify failure.
- [ ] Step 3: Remove active login controls and calls; leave inert compatibility no-ops only where old persisted UI state would otherwise crash.
- [ ] Step 4: Preserve old credential files by removing migration/reads, and add a narrowly scoped explicit cleanup IPC only if the existing settings surface can host it without restoring account UI.
- [ ] Step 5: Run focused tests and `node --check desktop/main.js desktop/preload.js`.

### Task 6: Documentation, packaging, and dependency boundary

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `PRIVACY.md`
- Modify: `SECURITY.md`
- Modify: `docs/THIRD_PARTY_PORTS.md`
- Modify: `public/js/index-loader.js`
- Test: `tests/gdstudio-packaging-docs.test.js`

- [ ] Step 1: Add tests asserting GD adapter/package inclusion, no active provider module loading, and required attribution/non-commercial wording.
- [ ] Step 2: Run the focused test and verify failure.
- [ ] Step 3: Remove unused provider dependencies from `package.json` only when no active import remains; exclude legacy provider files from packaged files; add GD adapter to build files and loader changes.
- [ ] Step 4: Update documentation and third-party notices with CC BY-NC 4.0, attribution, non-commercial use, and rate-limit statements.
- [ ] Step 5: Run focused tests and `npm install --package-lock-only` if dependency metadata changes.

### Task 7: Full verification and static residue audit

**Files:**
- Modify: any files required by failing regression tests only.

- [ ] Step 1: Run `node --test tests/*.test.js` and record all failures.
- [ ] Step 2: Fix regressions with test-first cycles; rerun affected tests.
- [ ] Step 3: Run `node --check` across all changed JavaScript files.
- [ ] Step 4: Run a static scan that excludes legacy source files and confirms active files contain no old provider routes/imports/login IPC calls.
- [ ] Step 5: Run `git diff --check` and report exact test/build status without claiming unrun checks.
