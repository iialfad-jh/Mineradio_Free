'use strict';

var GDSTUDIO_PROVIDER = 'gdstudio';
var GDSTUDIO_LOGIN_STATUS = { provider: GDSTUDIO_PROVIDER, loggedIn: false, configured: true, searchReady: true, publicCatalog: true, nickname: 'GD Studio' };

function bindModalBackdropClose() {
  [
    ['track-detail-modal', typeof closeTrackDetailModal === 'function' ? closeTrackDetailModal : function () {}],
    ['login-modal', closeLoginModal],
    ['user-modal', typeof closeUserModal === 'function' ? closeUserModal : function () {}],
    ['audio-output-workflow-modal', typeof closeAudioOutputWorkflowPanel === 'function' ? closeAudioOutputWorkflowPanel : function () {}],
    ['custom-lyric-modal', typeof closeCustomLyricModal === 'function' ? closeCustomLyricModal : function () {}],
    ['update-modal', typeof closeUpdatePanel === 'function' ? closeUpdatePanel : function () {}],
  ].forEach(function (pair) {
    var mask = document.getElementById(pair[0]);
    if (!mask || mask.__backdropCloseBound) return;
    mask.__backdropCloseBound = true;
    mask.addEventListener('click', function (event) { if (event.target === mask) pair[1](); });
  });
}

function platformMeta(provider) {
  return provider === GDSTUDIO_PROVIDER
    ? { provider: GDSTUDIO_PROVIDER, label: 'GD Studio', short: 'GD', dot: 'gdstudio' }
    : { provider: String(provider || GDSTUDIO_PROVIDER), label: 'GD Studio', short: 'GD', dot: 'gdstudio' };
}
function platformStatus(provider) {
  return provider === GDSTUDIO_PROVIDER ? GDSTUDIO_LOGIN_STATUS : GDSTUDIO_LOGIN_STATUS;
}
function platformProviderLabel(provider) { return platformMeta(provider).label; }
function hasPlatformLogin() { return false; }
function hasAnyPlatformLogin() { return false; }
function firstLoggedProvider() { return GDSTUDIO_PROVIDER; }
function accountProviderOrder() { return [GDSTUDIO_PROVIDER]; }
function providerVipLevel() { return 'none'; }
function hasProviderSvip() { return false; }
function openProviderLogin() { if (typeof showToast === 'function') showToast('GD Studio 无需登录'); return Promise.resolve({ ok: false, error: 'LOGIN_REMOVED' }); }
function showLoginModal() { return openProviderLogin(); }
function closeLoginModal() {}
function renderUserBtn() {
  var button = document.getElementById('user-btn');
  if (button) { button.hidden = true; button.setAttribute('aria-hidden', 'true'); }
}
function updateUserModalUi() {}
function refreshLoginStatus() { return Promise.resolve(GDSTUDIO_LOGIN_STATUS); }
function refreshQQLoginStatus() { return Promise.resolve(GDSTUDIO_LOGIN_STATUS); }
function refreshKugouLoginStatus() { return Promise.resolve(GDSTUDIO_LOGIN_STATUS); }
function refreshQishuiLoginStatus() { return Promise.resolve(GDSTUDIO_LOGIN_STATUS); }
function refreshSpotifyLoginStatus() { return Promise.resolve(GDSTUDIO_LOGIN_STATUS); }
function startQQLoginStatusAutoRefresh() {}
function startKugouLoginStatusAutoRefresh() {}
function startQishuiLoginStatusAutoRefresh() {}
function startSpotifyLoginStatusAutoRefresh() {}
function maybeRunStartupLoginGuide() { return false; }
function logoutActiveAccount() { return Promise.resolve({ ok: true }); }
function logoutAllAccountsAndResetEasterEgg() { return Promise.resolve({ ok: true }); }
function setActiveAccountProvider() {}
function enableDualAccountView() {}
function auditProviderVipState() {}
function qqPlaybackVipEvidenceApplies() { return false; }
function mergeQQPlaybackVipEvidence(status) { return status; }
