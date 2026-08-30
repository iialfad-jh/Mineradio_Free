'use strict';

var SOURCE_FALLBACK_DIRECT_PROVIDERS = ['gdstudio'];
var sourceFallbackBudgetTimeoutResult = {};
var activeSourceFallbackRecovery = null;

function playbackProviderLabel() { return 'GD Studio'; }
function playbackLoginProvider(song) { return typeof songProviderKey === 'function' ? songProviderKey(song) : 'gdstudio'; }
function playbackRestrictionCategory(song, data) { return data && (data.category || data.reason || data.error) || 'url_unavailable'; }
function playbackRestrictionNotice(song, data) {
  return { category: playbackRestrictionCategory(song, data), title: 'GD Studio 音源不可用', body: data && (data.message || data.error) || 'GD Studio 当前没有返回可播放音源', toast: 'GD Studio 音源不可用' };
}
function sourceFallbackRecoveryFromOptions(opts) { return opts && (opts.sourceFallbackRecovery || opts.playbackOpts && opts.playbackOpts.sourceFallbackRecovery) || null; }
function sourceFallbackRecoveryCanContinue(recovery) { return !!recovery && !recovery.cancelled && !recovery.terminal && (!recovery.deadlineAt || Date.now() < recovery.deadlineAt); }
function sourceFallbackRecoveryRemainingMs(recovery) { return Math.max(0, Number(recovery && recovery.deadlineAt || 0) - Date.now()); }
function ensureSourceFallbackRecovery(opts, song, idx, token) {
  var existing = sourceFallbackRecoveryFromOptions(opts);
  if (existing) return existing;
  var recovery = { serial: Date.now(), rootKey: typeof queueItemKey === 'function' ? queueItemKey(song) : '', rootIndex: idx, rootToken: token, deadlineAt: Date.now() + 20000, queueAdvances: 0, terminal: false, cancelled: false, silent: false };
  activeSourceFallbackRecovery = recovery;
  return recovery;
}
function beginSourceFallbackProviderAttempt() { return true; }
function sourceFallbackProviderTitle() { return 'GD Studio'; }
function sourceFallbackProviderReady(provider) { return provider === 'gdstudio'; }
function alternatePlaybackProviders() { return []; }
function alternatePlaybackProvider() { return ''; }
function beginSourceFallbackPlaybackInvocation() { return true; }
function completeSourceFallbackRecovery(recovery) { if (recovery) recovery.terminal = true; if (activeSourceFallbackRecovery === recovery) activeSourceFallbackRecovery = null; }
function sourceFallbackRecoveryFailureOptions(opts) { return opts || {}; }
function cancelSourceFallbackRecovery() { if (activeSourceFallbackRecovery) activeSourceFallbackRecovery.cancelled = true; activeSourceFallbackRecovery = null; }
function sourceFallbackSongKey(song) { return typeof queueItemKey === 'function' ? queueItemKey(song) : String(song && song.id || ''); }
function restoreSourceFallbackQueueItem() { return false; }
function sourceFallbackRecoveryIdentityActive(recovery) { return sourceFallbackRecoveryCanContinue(recovery); }
function settleSourceFallbackTerminal(idx, token, message, opts) {
  var recovery = sourceFallbackRecoveryFromOptions(opts);
  if (recovery) { recovery.terminal = true; recovery.terminalAt = Date.now(); }
  if (activeSourceFallbackRecovery === recovery) activeSourceFallbackRecovery = null;
  if (typeof hideLoading === 'function') hideLoading();
  if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
  return false;
}
function skipFailedQueueItem() { return false; }
function searchAlternatePlatformSong() { return Promise.resolve(null); }
function awaitSourceFallbackBudget(promise, recovery) {
  if (!recovery) return Promise.resolve(promise);
  var remaining = sourceFallbackRecoveryRemainingMs(recovery);
  if (remaining <= 0) return Promise.resolve(sourceFallbackBudgetTimeoutResult);
  return Promise.race([Promise.resolve(promise), new Promise(function (resolve) { setTimeout(function () { resolve(sourceFallbackBudgetTimeoutResult); }, remaining); })]);
}
async function tryAutoPlaybackFallback() { return null; }
function handlePlaybackUnavailable(song, data) {
  if (typeof hideLoading === 'function') hideLoading();
  if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
  var notice = playbackRestrictionNotice(song, data);
  if (typeof showToast === 'function') showToast(notice.toast);
  if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice(notice.title, notice.body);
}
