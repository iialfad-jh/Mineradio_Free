'use strict';

var GDSTUDIO_PROVIDER = 'gdstudio';
var GDSTUDIO_LOGIN_STATUS = { provider: GDSTUDIO_PROVIDER, loggedIn: false, configured: true, searchReady: true, publicCatalog: true, nickname: 'GD Studio' };

function openGsapModal(mask) {
  if (!mask) return;
  var panel = mask.querySelector('.modal');
  mask.classList.add('show');
  if (window.gsap) {
    window.gsap.killTweensOf(mask);
    if (panel) window.gsap.killTweensOf(panel);
    window.gsap.set(mask, { display: 'flex', visibility: 'visible' });
    window.gsap.fromTo(mask,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.38, ease: 'power2.out', overwrite: true }
    );
    if (panel) {
      window.gsap.fromTo(panel,
        { autoAlpha: 0, y: 26, scale: 0.965, filter: 'blur(12px)' },
        { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.68, ease: 'expo.out', overwrite: true }
      );
    }
  } else {
    mask.style.display = 'flex';
    mask.style.visibility = 'visible';
    mask.style.opacity = '1';
  }
}

function closeGsapModal(mask, afterClose) {
  if (!mask || !mask.classList.contains('show')) {
    if (afterClose) afterClose();
    return;
  }
  var panel = mask.querySelector('.modal');
  function finish() {
    mask.classList.remove('show');
    if (window.gsap) {
      window.gsap.set(mask, { clearProps: 'display,visibility,opacity' });
      if (panel) window.gsap.set(panel, { clearProps: 'opacity,visibility,transform,filter' });
    } else {
      mask.style.display = '';
      mask.style.visibility = '';
      mask.style.opacity = '';
    }
    if (afterClose) afterClose();
  }
  if (window.gsap) {
    window.gsap.killTweensOf(mask);
    if (panel) {
      window.gsap.killTweensOf(panel);
      window.gsap.to(panel, { autoAlpha: 0, y: 18, scale: 0.976, filter: 'blur(8px)', duration: 0.28, ease: 'power2.in', overwrite: true });
    }
    window.gsap.to(mask, { autoAlpha: 0, duration: 0.34, ease: 'power2.inOut', overwrite: true, onComplete: finish });
  } else {
    finish();
  }
}

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
