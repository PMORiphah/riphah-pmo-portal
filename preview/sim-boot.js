/* PMO Portal Simulation: boot script.
 *
 * Loaded only by simulation.html (written by scripts/sim/make-sim-html.mjs), as a classic script
 * straight after the Content-Security-Policy meta, so it runs before any module code. It:
 *   (a) drops every sessionStorage key that is not the simulation's own;
 *   (b) reads the one-time hand-over nonce (#k=...) and strips it from the address bar;
 *   (c) namespaces localStorage, sessionStorage, BroadcastChannel and Web Locks under "pmo-sim:",
 *       so the real portal's session (pmo_session) is never read and no real tab is disturbed;
 *   (d) turns off push, notifications, passkeys, the service worker, sendBeacon, share and WebRTC;
 *   (e) runs the clock from Thu 15 Oct 2026 10:30 PKT at normal speed (performance.now untouched);
 *   (f) guards links, window.open, navigation, downloads and Ctrl+S;
 *   (g) labels every print ("SIMULATION ...") and names the file SIMULATION_...;
 *   (h) points the portal's Google Fonts link at the self-hosted copy in sim/fonts/;
 *   (i) publishes window.__PMO_SIM__ (frozen);
 *   (j) self-tests, and fails closed: on any failure the app is never loaded.
 * Only after every check passes does it write the app's module script into the page (its URL comes
 * from <meta name="pmo-sim-entry">). If this file fails to load or throws, the app never starts.
 *
 * The repo is public: this file holds no names, keys or tokens, and must never hold any.
 */
(function () {
  'use strict';
  var W = window, D = document;
  var P = 'pmo-sim:';
  var CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'self'"; // @sim-csp
  var fails = [];
  var checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || '' }); if (!ok) fails.push(name); }
  function attempt(name, fn) { try { fn(); } catch (e) { check(name, false, String(e && e.message || e)); } }

  // ── (a) sessionStorage: keep only the simulation's own keys ───────────────────────────────────
  var SP = W.Storage && Storage.prototype;
  var N = SP ? { get: SP.getItem, set: SP.setItem, rem: SP.removeItem, key: SP.key,
    len: Object.getOwnPropertyDescriptor(SP, 'length').get } : null;
  function rawKeys(st) {
    var out = [], n = N.len.call(st);
    for (var i = 0; i < n; i++) { var k = N.key.call(st, i); if (k != null) out.push(k); }
    return out;
  }
  function simKeys(st) { return rawKeys(st).filter(function (k) { return k.indexOf(P) === 0; }); }
  attempt('session-clean', function () {
    var ss = W.sessionStorage;
    rawKeys(ss).forEach(function (k) { if (k.indexOf(P) !== 0) N.rem.call(ss, k); });
    check('session-clean', rawKeys(ss).every(function (k) { return k.indexOf(P) === 0; }));
  });

  // ── (b) the hand-over nonce, then a clean address ─────────────────────────────────────────────
  var nonce = null;
  var hm = /^#k=([A-Za-z0-9_-]{16,128})$/.exec(location.hash || '');
  if (hm) nonce = hm[1];
  attempt('address', function () {
    history.replaceState(null, '', location.pathname);
    check('address', !location.hash && !location.search);
  });
  var BASE = location.pathname.replace(/simulation(\.html)?$/, '');
  check('page', /\/simulation(\.html)?$/.test(location.pathname) && /\/$/.test(BASE), location.pathname);
  var FILES = BASE + 'sim/files/';

  // ── (c) namespaced storage, channels and locks ────────────────────────────────────────────────
  var raw = {};
  attempt('storage', function () {
    SP.getItem = function (k) { return N.get.call(this, P + String(k)); };
    SP.setItem = function (k, v) { return N.set.call(this, P + String(k), v); };
    SP.removeItem = function (k) { return N.rem.call(this, P + String(k)); };
    SP.key = function (i) { var k = simKeys(this)[i]; return k === undefined ? null : k.slice(P.length); };
    SP.clear = function () { var self = this; simKeys(this).forEach(function (k) { N.rem.call(self, k); }); };
    Object.defineProperty(SP, 'length', { configurable: true, enumerable: true, get: function () { return simKeys(this).length; } });
    // Named access (localStorage.foo, Object.keys(localStorage)) goes through the same prefix.
    var proxied = typeof WeakMap === 'function' ? new WeakMap() : null;
    function proxy(st) {
      if (!proxied || !st) return st;
      var p = proxied.get(st);
      if (p) return p;
      p = new Proxy(st, {
        get: function (t, k) {
          if (typeof k === 'symbol') { var s = t[k]; return typeof s === 'function' ? s.bind(t) : s; }
          if (k === 'length') return simKeys(t).length;
          if (k in SP) { var f = SP[k]; return (typeof f === 'function' && k !== 'constructor') ? f.bind(t) : t[k]; }
          var v = N.get.call(t, P + k); return v === null ? undefined : v;
        },
        set: function (t, k, v) { if (typeof k === 'symbol') return false; N.set.call(t, P + k, v); return true; },
        has: function (t, k) { if (typeof k === 'symbol') return k in t; return (k in SP) || N.get.call(t, P + k) !== null; },
        deleteProperty: function (t, k) { if (typeof k !== 'symbol') N.rem.call(t, P + k); return true; },
        ownKeys: function (t) { return simKeys(t).map(function (k) { return k.slice(P.length); }); },
        getOwnPropertyDescriptor: function (t, k) {
          if (typeof k === 'symbol') return undefined;
          var v = N.get.call(t, P + k);
          return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
        },
        defineProperty: function (t, k, d) { if (typeof k !== 'symbol' && 'value' in d) N.set.call(t, P + k, d.value); return true; },
      });
      proxied.set(st, p);
      return p;
    }
    ['localStorage', 'sessionStorage'].forEach(function (name) {
      var d = Object.getOwnPropertyDescriptor(W, name) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(W), name);
      if (!d || !d.get) return;
      var g = d.get;
      raw[name] = function () { return g.call(W); };
      Object.defineProperty(W, name, { configurable: true, enumerable: true, get: function () { return proxy(g.call(W)); } });
    });
    // Storage events from other tabs carry the real portal's keys: never let the app see them.
    W.addEventListener('storage', function (e) {
      if (e.__pmoSim) return;
      e.stopImmediatePropagation();
      if (typeof e.key === 'string' && e.key.indexOf(P) === 0) {
        var f = new StorageEvent('storage', { key: e.key.slice(P.length), oldValue: e.oldValue, newValue: e.newValue, url: e.url });
        f.__pmoSim = true;
        W.dispatchEvent(f);
      }
    }, true);
    var ls = raw.localStorage ? raw.localStorage() : W.localStorage;
    localStorage.setItem('__probe', '1');
    var ok = N.get.call(ls, P + '__probe') === '1' && N.get.call(ls, '__probe') === null
      && localStorage.getItem('pmo_session') === N.get.call(ls, P + 'pmo_session')
      && localStorage.__probe === '1' && Object.keys(localStorage).every(function (k) { return k.indexOf(P) !== 0; });
    localStorage.removeItem('__probe');
    check('storage', ok && N.get.call(ls, P + '__probe') === null);
  });
  var HAND = nonce ? 'pmo-sim-' + nonce : null;
  attempt('channels', function () {
    var NBC = W.BroadcastChannel;
    if (!NBC) { check('channels', true, 'none'); return; }
    // A proxy, not a subclass: Object.getPrototypeOf(BroadcastChannel) and
    // BroadcastChannel.prototype.constructor never lead back to the native constructor (which
    // could open the real portal's 'pmo-session' channel).
    var SimBC = new Proxy(NBC, {
      apply: function () { throw new TypeError("Failed to construct 'BroadcastChannel': Please use the 'new' operator"); },
      construct: function (t, args, nt) {
        var name = String(args[0]);
        return Reflect.construct(t, [name === HAND ? name : P + name], nt === SimBC ? t : nt);
      },
    });
    try { Object.defineProperty(NBC.prototype, 'constructor', { value: SimBC, writable: true, configurable: true, enumerable: false }); } catch (e) { /* checked below */ }
    W.BroadcastChannel = SimBC;
    var probe = new W.BroadcastChannel('probe');
    check('channels', probe.name === P + 'probe' && W.BroadcastChannel.prototype.constructor === SimBC
      && Object.getPrototypeOf(W.BroadcastChannel) !== NBC);
    probe.close();
  });
  attempt('locks', function () {
    if (!W.LockManager || !LockManager.prototype.request) { check('locks', true, 'none'); return; }
    var LR = LockManager.prototype.request;
    LockManager.prototype.request = function (name) {
      var a = Array.prototype.slice.call(arguments); a[0] = P + String(name);
      return LR.apply(this, a);
    };
    check('locks', true);
  });

  // ── (d) push, notifications, passkeys, service worker, beacons, share, WebRTC ─────────────────
  function denied(msg) { return function () { return Promise.reject(new DOMException(msg || 'Not available in the simulation', 'NotAllowedError')); }; }
  attempt('device', function () {
    try { delete W.PushManager; } catch (e) { /* checked below */ }
    if (W.ServiceWorkerRegistration) {
      var SR = ServiceWorkerRegistration.prototype;
      Object.defineProperty(SR, 'pushManager', { configurable: true, get: function () { return undefined; } });
      SR.showNotification = denied();
      SR.getNotifications = function () { return Promise.resolve([]); };
    }
    var NN = W.Notification;
    var SimN = function Notification() { throw new TypeError('Notifications are turned off in the simulation'); };
    Object.defineProperty(SimN, 'permission', { get: function () { return 'denied'; } });
    Object.defineProperty(SimN, 'maxActions', { get: function () { return 0; } });
    SimN.requestPermission = function (cb) { try { if (typeof cb === 'function') cb('denied'); } catch (e) { /* ignore */ } return Promise.resolve('denied'); };
    if (NN) SimN.prototype = NN.prototype;
    W.Notification = SimN;
    try { delete W.PublicKeyCredential; } catch (e) { /* checked below */ }
    if (W.CredentialsContainer) {
      var CC = CredentialsContainer.prototype;
      CC.get = denied(); CC.create = denied(); CC.store = denied();
      CC.preventSilentAccess = function () { return Promise.resolve(); };
    }
    Object.defineProperty(Navigator.prototype, 'credentials', { configurable: true, get: function () { return undefined; } });
    if (W.ServiceWorkerContainer) {
      var SWC = ServiceWorkerContainer.prototype;
      SWC.register = function () { return Promise.reject(new DOMException('Turned off in the simulation', 'SecurityError')); };
      SWC.getRegistration = function () { return Promise.resolve(undefined); };
      SWC.getRegistrations = function () { return Promise.resolve([]); };
      Object.defineProperty(SWC, 'ready', { configurable: true, get: function () { return new Promise(function () {}); } });
      Object.defineProperty(SWC, 'controller', { configurable: true, get: function () { return null; } });
      SWC.startMessages = function () {};
      // Messages from the portal's worker (it controls this address too) never reach the app.
      if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) { e.stopImmediatePropagation(); }, true);
    }
    Navigator.prototype.sendBeacon = function () { return true; };
    if ('share' in Navigator.prototype) Navigator.prototype.share = function () { toast(NA); return Promise.reject(new DOMException('Not available in the simulation', 'NotAllowedError')); };
    if ('canShare' in Navigator.prototype) Navigator.prototype.canShare = function () { return false; };
    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel'].forEach(function (k) { try { delete W[k]; } catch (e) { /* ignore */ } });
    check('device', !('PushManager' in W) && !W.PublicKeyCredential && navigator.credentials === undefined
      && W.Notification.permission === 'denied');
  });

  // Speech: on-device voices only (PMO decision 2, 14 Oct 2026). A network voice (Chrome's
  // "Google ...", Edge's "... Online (Natural)") sends the spoken text to Google or Microsoft, outside
  // this page's policy. An utterance with no voice set could be given one by the browser, so it is
  // refused too. The director always sets an eligible voice; the assistant's Listen picks one in
  // src/speech.js, and anything else ends here with an error event and a toast.
  var NET_VOICE = /Google|Online/i;
  function voiceOk(v) { return !!v && v.localService === true && !NET_VOICE.test(String(v.name || '')); }
  attempt('speech', function () {
    if (!W.SpeechSynthesis || !SpeechSynthesis.prototype.speak) { check('speech', true, 'none'); return; }
    var SS = SpeechSynthesis.prototype, nativeSpeak = SS.speak;
    SS.speak = function speak(u) {
      var v = null;
      try { v = u && u.voice; } catch (e) { v = null; }
      if (voiceOk(v)) return nativeSpeak.call(this, u);
      toast('Only on-device voices are used in the simulation');
      setTimeout(function () {
        try { u.dispatchEvent(new SpeechSynthesisErrorEvent('error', { utterance: u, error: 'not-allowed' })); }
        catch (e) { try { if (u && typeof u.onerror === 'function') u.onerror({ type: 'error', error: 'not-allowed', utterance: u }); } catch (e2) { /* ignore */ } }
      }, 0);
    };
    check('speech', SS.speak !== nativeSpeak);
  });

  // ── (e) clock: Thu 15 Oct 2026 10:30 PKT (05:30Z), advancing normally ─────────────────────────
  var RD = Date, RDnow = Date.now;
  var START = RD.UTC(2026, 9, 15, 5, 30, 0);
  var OFFSET = START - RDnow.call(RD);
  function nowMs() { return RDnow.call(RD) + OFFSET; }
  attempt('clock', function () {
    var SimDate = function Date() {
      if (!new.target) return new RD(nowMs()).toString();
      var a = arguments.length === 0 ? [nowMs()] : Array.prototype.slice.call(arguments);
      return Reflect.construct(RD, a, new.target === SimDate ? RD : new.target);
    };
    Object.defineProperty(SimDate, 'length', { value: 7 });
    SimDate.prototype = RD.prototype;
    SimDate.now = nowMs;
    SimDate.parse = RD.parse;
    SimDate.UTC = RD.UTC;
    try { Object.defineProperty(RD.prototype, 'constructor', { value: SimDate, writable: true, configurable: true, enumerable: false }); } catch (e) { /* ignore */ }
    W.Date = SimDate;
    // Intl formatters given no date format "now": make that the simulation's now.
    var DTF = Intl.DateTimeFormat.prototype;
    var fd = Object.getOwnPropertyDescriptor(DTF, 'format');
    if (fd && fd.get) Object.defineProperty(DTF, 'format', { configurable: true, get: function () {
      var f = fd.get.call(this); return function (d) { return f(d === undefined ? nowMs() : d); };
    } });
    var ftp = DTF.formatToParts;
    if (ftp) DTF.formatToParts = function (d) { return ftp.call(this, d === undefined ? nowMs() : d); };
    check('clock', Math.abs(new W.Date().getTime() - START) < 10000 && W.Date.now() - START < 10000
      && new W.Date(0).getTime() === 0 && (new W.Date()) instanceof RD);
  });

  // ── toast (shared by every guard) ─────────────────────────────────────────────────────────────
  var NA = 'Not available in the simulation';
  var EXPORTS = 'Exports are not available in this preview of the simulation';
  var toastEl = null, toastTimer = 0, lastMsg = '', lastAt = 0;
  function toast(msg) {
    msg = String(msg || NA);
    var t = RDnow.call(RD);
    if (msg === lastMsg && t - lastAt < 800) return;
    lastMsg = msg; lastAt = t;
    if (!D.body) return;
    if (!toastEl) {
      toastEl = D.createElement('div');
      toastEl.setAttribute('data-sim-ui', 'toast');
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483646;'
        + 'max-width:min(560px,calc(100vw - 32px));padding:11px 16px 11px 14px;border-radius:10px;'
        + 'background:#0A1A2E;color:#fff;border-left:3px solid #D89840;box-shadow:0 10px 30px rgba(0,0,0,.35);'
        + "font:500 13px/1.4 Inter,'Segoe UI',Arial,sans-serif;pointer-events:none;opacity:0;transition:opacity .18s ease";
    }
    if (!toastEl.isConnected) D.body.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (toastEl) toastEl.style.opacity = '0'; }, 3200);
  }

  // ── (f) guards: links, window.open, navigation, downloads, Ctrl+S ─────────────────────────────
  var protectedUrls = new Set();
  function bare(u) { return String(u || '').split(/[?#]/)[0]; }
  function isProtected(u) { return protectedUrls.has(bare(u)); }
  function classify(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return 'bad'; }
    if (u.protocol === 'blob:') return isProtected(u.href) ? 'real-media' : (u.origin === location.origin ? 'blob' : 'external');
    if (u.protocol === 'data:') return 'data';
    if (u.protocol === 'javascript:') return 'script';
    if (u.origin !== location.origin) return 'external';
    if (u.pathname.indexOf(FILES) === 0) return 'sim-file';
    if (u.pathname === location.pathname && !u.search) return 'self';
    return 'portal';
  }
  var LINK_OK = { self: 1, 'sim-file': 1, blob: 1 };
  function fixLink(a) {
    var h = a.getAttribute('href');
    if (h == null) return;
    if (h === '#' && a.hasAttribute('data-sim-href')) return;
    if (LINK_OK[classify(h)]) { if (a.hasAttribute('data-sim-href')) a.removeAttribute('data-sim-href'); return; }
    a.setAttribute('data-sim-href', h);
    a.setAttribute('href', '#');
  }
  function fixMedia(v) {
    if (v.getAttribute('data-sim-media') === '1') return;
    v.setAttribute('data-sim-media', '1');
    var cl = (v.getAttribute('controlslist') || '').split(/\s+/).filter(Boolean);
    if (cl.indexOf('nodownload') < 0) cl.push('nodownload');
    if (cl.indexOf('noremoteplayback') < 0) cl.push('noremoteplayback');
    v.setAttribute('controlslist', cl.join(' '));
    if (v.tagName === 'VIDEO') { v.muted = true; v.defaultMuted = true; }
  }
  function fixNode(n) {
    if (!n || n.nodeType !== 1) return;
    var tag = n.tagName;
    if ((tag === 'A' || tag === 'AREA') && n.hasAttribute('href')) fixLink(n);
    else if (tag === 'VIDEO' || tag === 'AUDIO') fixMedia(n);
  }
  function scan(n) {
    if (!n || (n.nodeType !== 1 && n.nodeType !== 11)) return;
    fixNode(n);
    if (n.querySelectorAll) n.querySelectorAll('a[href],area[href],video,audio').forEach(fixNode);
  }
  attempt('links', function () {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') fixNode(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) scan(m.addedNodes[j]);
      }
    }).observe(D, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
    check('links', true);
  });

  var nativeClick = HTMLElement.prototype.click;
  function basename(s) { return String(s || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 120) || 'file'; }
  function simName(n) { n = basename(n); return /^SIMULATION_/.test(n) ? n : 'SIMULATION_' + n; }
  function downloadSimFile(u, name) {
    var a = D.createElement('a');
    a.href = u.origin + u.pathname;
    a.download = simName(name || decodeURIComponent(u.pathname.split('/').pop()));
    nativeClick.call(a);
  }
  // 'block' or 'allow' for activating an anchor (click, a.click(), dispatched click).
  function anchorVerdict(a) {
    var h = a.getAttribute('href');
    if (h == null) return 'allow';
    if (a.hasAttribute('data-sim-href')) { toast(NA); return 'block'; }
    var c = classify(a.href);
    var dl = a.hasAttribute('download');
    if (c === 'real-media') { toast(NA); return 'block'; }
    if (dl && (c === 'blob' || c === 'data')) { toast(EXPORTS); return 'block'; }
    if (dl && c === 'sim-file') { a.setAttribute('download', simName(a.getAttribute('download') || decodeURIComponent(new URL(a.href).pathname.split('/').pop()))); return 'allow'; }
    if (!LINK_OK[c]) { toast(NA); return 'block'; }
    return 'allow';
  }
  attempt('clicks', function () {
    function anchorOf(e) { var t = e.target; return t && t.closest ? t.closest('a[href],area[href]') : null; }
    W.addEventListener('click', function (e) {
      var a = anchorOf(e);
      if (a && anchorVerdict(a) === 'block') e.preventDefault();
    }, true);
    W.addEventListener('auxclick', function (e) {
      var a = anchorOf(e);
      if (!a) return;
      var c = a.hasAttribute('data-sim-href') ? 'blocked' : classify(a.href);
      if (c !== 'self' && c !== 'sim-file' && c !== 'blob') { e.preventDefault(); toast(NA); }
    }, true);
    function mediaSrc(t) {
      if (!t || !t.tagName) return '';
      if (t.tagName === 'IMG') return t.currentSrc || t.src;
      if (t.tagName === 'VIDEO' || t.tagName === 'AUDIO') return t.currentSrc || t.src;
      return '';
    }
    function realMedia(t) {
      if (!t) return false;
      if (isProtected(mediaSrc(t))) return true;
      var a = t.closest ? t.closest('a[href]') : null;
      return !!(a && (a.hasAttribute('data-sim-href') || classify(a.href) === 'real-media'));
    }
    W.addEventListener('dragstart', function (e) {
      var t = e.target && e.target.nodeType === 1 ? e.target : null;
      var a = t && t.closest ? t.closest('a[href]') : null;
      if (realMedia(t) || (a && a.hasAttribute('data-sim-href'))) e.preventDefault();
    }, true);
    W.addEventListener('contextmenu', function (e) {
      var t = e.target && e.target.nodeType === 1 ? e.target : null;
      if (realMedia(t)) { e.preventDefault(); toast(NA); }
    }, true);
    W.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); toast(NA); }
      // A reload would drop the names and photos (they live only in this page's memory). While the
      // simulation holds them (guard.holdReload, set by the director), F5 / Ctrl+R / Shift+F5, which a
      // presentation clicker can send by mistake, are refused with a toast. Otherwise a reload from the
      // keyboard goes ahead without the leave-page prompt (Chrome asks beforeunload before it fires
      // 'navigate' for a reload it starts itself).
      if (e.key === 'F5' || e.key === 'BrowserRefresh' || ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'r' || e.key === 'R'))) {
        if (holdReload && !allowUnload) { e.preventDefault(); e.stopImmediatePropagation(); toast('Reload is off during the simulation: it would lose the names. Use Restart (Home) instead.'); }
        else reloading = true;
      }
    }, true);
    // A form nothing else handled would leave the page (the policy refuses it anyway): stop it here.
    W.addEventListener('submit', function (e) { if (!e.defaultPrevented) { e.preventDefault(); toast(NA); } });
    // Anchors clicked while detached from the page never reach the listeners above.
    HTMLAnchorElement.prototype.click = function () {
      if (!this.isConnected && anchorVerdict(this) === 'block') return;
      return nativeClick.call(this);
    };
    var nativeDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (ev) {
      if (ev && ev.type === 'click' && (this instanceof HTMLAnchorElement || this instanceof HTMLAreaElement)
        && !this.isConnected && anchorVerdict(this) === 'block') return false;
      return nativeDispatch.call(this, ev);
    };
    check('clicks', true);
  });

  // SheetJS calls a global saveAs before it falls back to a link.
  attempt('exports', function () {
    Object.defineProperty(W, 'saveAs', { configurable: false, writable: false, enumerable: false,
      value: function saveAs() { toast(EXPORTS); } });
    check('exports', typeof W.saveAs === 'function');
  });

  // window.open: only the simulation's own files and non-protected blob: links.
  var nativeOpen = W.open;
  function controlledWindow() {
    var w = {
      closed: false, opener: null, name: '',
      close: function () { w.closed = true; }, focus: function () {}, blur: function () {}, print: function () {},
      postMessage: function () {}, addEventListener: function () {}, removeEventListener: function () {},
      location: { get href() { return 'about:blank'; }, set href(v) { openGuarded(v); w.closed = true; },
        assign: function (v) { openGuarded(v); w.closed = true; }, replace: function (v) { openGuarded(v); w.closed = true; },
        reload: function () {}, toString: function () { return 'about:blank'; } },
      document: { open: function () {}, write: function () { toast(NA); }, writeln: function () { toast(NA); }, close: function () {} },
    };
    return w;
  }
  function openGuarded(url) {
    var s = url == null ? '' : String(url);
    if (s === '' || s === 'about:blank') return controlledWindow();
    var c = classify(s);
    if (c === 'sim-file') {
      var u = new URL(s, location.href);
      var dl = u.searchParams.get('download');
      if (dl !== null) { downloadSimFile(u, dl); return null; }
      nativeOpen.call(W, u.origin + u.pathname, '_blank', 'noopener');
      return null;
    }
    if (c === 'blob') { nativeOpen.call(W, s, '_blank', 'noopener'); return null; }
    toast(NA);
    return null;
  }
  attempt('open', function () {
    W.open = function open(url) { return openGuarded(url); };
    check('open', W.open !== nativeOpen);
  });

  // Navigation: only reloads and same-document changes that keep this page's own path; everything
  // else stays on this page. A same-document change to another path (history.pushState /
  // replaceState to the portal's address) is refused too: a reload after it would load the real
  // portal in this tab.
  var allowUnload = false, reloading = false, holdReload = false;
  var SIM_PATH = location.pathname;
  function samePath(url) {
    try { return new URL(String(url), location.href).pathname === SIM_PATH && new URL(String(url), location.href).origin === location.origin; }
    catch (e) { return false; }
  }
  attempt('history', function () {
    var HP = History.prototype, push = HP.pushState, repl = HP.replaceState;
    HP.pushState = function (st, t, url) {
      if (url != null && !samePath(url)) { toast(NA); return; }
      return push.apply(this, arguments);
    };
    HP.replaceState = function (st, t, url) {
      if (url != null && !samePath(url)) { toast(NA); return; }
      return repl.apply(this, arguments);
    };
    check('history', HP.pushState !== push && HP.replaceState !== repl);
  });
  attempt('navigation', function () {
    var nav = W.navigation;
    if (nav && nav.addEventListener) {
      nav.addEventListener('navigate', function (e) {
        if (allowUnload) return;
        if (e.navigationType === 'reload') {
          // A reload started by code (the portal reloads once when a page chunk is missing) would
          // drop the names: refused while the simulation holds them.
          if (holdReload && e.cancelable) { e.preventDefault(); toast(NA); return; }
          reloading = true; return;
        }
        var dest = e.destination ? e.destination.url : '';
        if (e.hashChange || (e.destination && e.destination.sameDocument)) {
          if (samePath(dest)) return;
          if (e.cancelable) { e.preventDefault(); toast(NA); }
          return;
        }
        if (e.downloadRequest != null) {
          if (classify(dest) === 'sim-file') return;
          if (e.cancelable) { e.preventDefault(); toast(EXPORTS); }
          return;
        }
        if (e.cancelable) { e.preventDefault(); toast(NA); }
      });
    }
    W.addEventListener('beforeunload', function (e) {
      if (allowUnload || reloading) return;
      e.preventDefault();
      e.returnValue = '';
    });
    check('navigation', !!(nav && nav.addEventListener), nav ? '' : 'no Navigation API; beforeunload only');
  });

  // ── (g) print: a label on every page, SIMULATION_ file names ──────────────────────────────────
  var PRINT_CSS = [
    '@page {',
    '  @top-center { content: "SIMULATION \\00B7  FICTIONAL DATA"; font: 600 7.5pt Inter, Arial, sans-serif; letter-spacing: .14em; color: #8A5A14; }',
    '  @bottom-left { content: "Simulation: campus, manager and team names are real; projects, figures, dates and messages are invented"; font: 400 7pt Inter, Arial, sans-serif; color: #4A5D70; }',
    '  @bottom-right { content: counter(page); font: 500 7pt Inter, Arial, sans-serif; color: #4A5D70; }',
    '}',
    '@media print {',
    '  body::after { content: "SIMULATION \\00B7  real names, fictional projects and figures"; position: fixed; top: 0; right: 0;',
    '    z-index: 2147483647; padding: 1.2mm 2.6mm; border-radius: 0 0 0 2mm; background: #FFF7E8; color: #8A5A14;',
    '    border: .3mm solid #D89840; border-top: 0; border-right: 0; font: 600 7pt Inter, Arial, sans-serif; letter-spacing: .06em;',
    '    -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '  img[alt^="Riphah"] { display: none !important; }',
    '  [data-sim-ui] { display: none !important; }',
    '  [data-org] { font-size: 0 !important; letter-spacing: 0 !important; }',
    '  [data-org]::before { content: "Simulation \\00B7  real names, fictional figures"; font-size: var(--sim-org-fs, 9pt); letter-spacing: var(--sim-org-ls, normal); }',
    '  .br-page { position: relative !important; }',
    '  .br-page::after { content: "SIMULATION \\00B7  FICTIONAL DATA"; position: absolute; left: 50%; top: 46%;',
    '    transform: translate(-50%, -50%) rotate(-30deg); font: 700 46px Inter, Arial, sans-serif; letter-spacing: .08em;',
    '    color: rgba(13, 25, 41, .075); white-space: nowrap; pointer-events: none; z-index: 50;',
    '    -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '}',
  ].join('\n');
  var NAV_NAMES = { cmd: 'Capex_Dashboard', proj: 'Projects', camp: 'Campus_Sites', perf: 'Performance', risks: 'Risk_Register',
    cashflow: 'Project_Cashflows', schedule: 'Timeline_and_Schedule', past: 'Past_Projects', review: 'PMO_Review',
    reports: 'Board_Reports', upd: 'Updates', photowall: 'Gallery', team: 'Team_and_About', users: 'User_Management',
    log: 'Activity_Log', set: 'Settings' };
  var MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
  function simDay() { return new RD(nowMs() + 5 * 3600 * 1000).toISOString().slice(0, 10); }
  function printTitle() {
    var html = D.documentElement;
    if (html.classList.contains('br-printing')) {
      var root = D.querySelector('.br-print-root') || D.querySelector('[data-tour="report-viewer"]') || D.body;
      var m = new RegExp('(' + MONTHS + ')\\s+(20\\d\\d)').exec((root && root.textContent) || '');
      return 'SIMULATION_Board_Report_' + (m ? m[1] + '_' + m[2] : 'September_2026');
    }
    var active = D.querySelector('[data-nav][aria-current="page"]');
    var id = (active && active.getAttribute('data-nav')) || html.getAttribute('data-sim-page') || '';
    var page = NAV_NAMES[id] || (id ? id.replace(/[^A-Za-z0-9]+/g, '_') : 'Portal');
    return 'SIMULATION_' + page + '_' + simDay();
  }
  var savedTitle = null, printingTitle = null;
  attempt('print', function () {
    var st = D.createElement('style');
    st.setAttribute('data-sim-print', '');
    st.textContent = PRINT_CSS;
    (D.head || D.documentElement).appendChild(st);
    W.addEventListener('beforeprint', function () {
      savedTitle = D.title;
      printingTitle = printTitle();
      D.title = printingTitle;
      D.querySelectorAll('[data-org]').forEach(function (el) {
        var cs = getComputedStyle(el);
        el.style.setProperty('--sim-org-fs', cs.fontSize);
        el.style.setProperty('--sim-org-ls', cs.letterSpacing);
      });
    });
    W.addEventListener('afterprint', function () {
      if (savedTitle !== null && D.title === printingTitle) D.title = savedTitle;
      savedTitle = printingTitle = null;
    });
    check('print', true);
  });

  // ── (h) fonts: the portal's Google Fonts link becomes the self-hosted copy ────────────────────
  var FONTS_CSS = BASE + 'sim/fonts/fonts.css';
  function fixHeadLink(n) {
    if (!n || n.nodeType !== 1 || n.tagName !== 'LINK') return;
    var h = n.getAttribute('href');
    if (!h) return;
    var u;
    try { u = new URL(h, location.href); } catch (e) { return; }
    if (u.origin === location.origin || u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (/^fonts\.googleapis\.com$/i.test(u.hostname) && /stylesheet/i.test(n.rel || '')) { n.setAttribute('href', FONTS_CSS); return; }
    n.setAttribute('rel', 'x-sim-off');
    n.removeAttribute('href');
  }
  // A link is fixed before it is inserted; a subtree only when it joins the page (React builds
  // trees detached, so scanning there would repeat the work at every level).
  function fixInserted(parent, n) {
    if (!n) return;
    if (n.nodeType === 1 && n.tagName === 'LINK') { fixHeadLink(n); return; }
    if ((n.nodeType === 1 || n.nodeType === 11) && n.firstElementChild && (!parent || parent.isConnected)) n.querySelectorAll('link[href]').forEach(fixHeadLink);
  }
  attempt('fonts', function () {
    var NP = Node.prototype, EP = Element.prototype;
    var ac = NP.appendChild, ib = NP.insertBefore, rc = NP.replaceChild;
    NP.appendChild = function (n) { fixInserted(this, n); return ac.call(this, n); };
    NP.insertBefore = function (n, r) { fixInserted(this, n); return ib.call(this, n, r); };
    NP.replaceChild = function (n, o) { fixInserted(this, n); return rc.call(this, n, o); };
    ['append', 'prepend', 'before', 'after', 'replaceWith'].forEach(function (k) {
      var f = EP[k];
      if (typeof f !== 'function') return;
      EP[k] = function () { for (var i = 0; i < arguments.length; i++) fixInserted(null, arguments[i]); return f.apply(this, arguments); };
    });
    var probe = D.createElement('link');
    probe.rel = 'stylesheet';
    probe.href = 'https://fonts.googleapis.com/css2?family=Inter';
    fixInserted(null, probe);
    check('fonts', probe.getAttribute('href') === FONTS_CSS);
  });

  // ── (j) self-tests: the policy must be the first thing in <head>, and this the script running ─
  var head = D.head;
  var first = head && head.firstElementChild;
  check('csp', !!(first && first.tagName === 'META' && /^content-security-policy$/i.test(first.getAttribute('http-equiv') || '')
    && first.getAttribute('content') === CSP), first ? first.outerHTML.slice(0, 80) : 'no head');
  var me = D.currentScript;
  check('script', !!(me && me.src && new URL(me.src).pathname === BASE + 'sim-boot.js' && !me.async && !me.defer && me.type === ''));
  var framed = true;
  try { framed = W.top !== W; } catch (e) { framed = true; }
  check('top', !framed);
  try { if (W.opener) W.opener = null; } catch (e) { /* ignore */ }
  check('opener', !W.opener);
  var entryMeta = D.querySelector('meta[name="pmo-sim-entry"]');
  var entry = entryMeta ? entryMeta.getAttribute('content') || '' : '';
  check('entry', /^\/[A-Za-z0-9_\/.-]+\.js$/.test(entry) && entry.indexOf(BASE + 'assets/') === 0 && entry.indexOf('..') < 0, entry);

  // ── (i) the simulation global ─────────────────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  if (fails.length) {
    Object.defineProperty(W, '__PMO_SIM__', { value: Object.freeze({ ok: false, reason: fails.join(','), checks: Object.freeze(checks) }),
      writable: false, configurable: false, enumerable: false });
    // Fail closed: the rest of the page (and with it the app's module script) becomes inert text.
    try {
      D.write('<div role="alert" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;'
        + 'background:#0A1A2E;color:#fff;font:15px/1.6 Inter,Segoe UI,Arial,sans-serif;text-align:center">'
        + '<div style="max-width:520px"><div style="font-size:20px;font-weight:600;margin-bottom:10px">The simulation could not start safely</div>'
        + '<div style="opacity:.8">Nothing was loaded. Close this tab, then sign in to the PMO portal as PMO and press Simulation in the sidebar.</div>'
        + '<div style="opacity:.45;font-size:12px;margin-top:14px">Check failed: ' + esc(fails.join(', ')) + '</div></div></div>'
        + '<plaintext style="display:none">');
    } catch (e) { /* main.jsx shows the locked message instead */ }
    return;
  }
  var mode = 'cast', starters = null;
  var SIM = {
    ok: true,
    v: 1,
    nonce: nonce,
    base: BASE,
    files: FILES,
    clockStart: START,
    csp: CSP,
    checks: Object.freeze(checks.map(function (c) { return Object.freeze(c); })),
    clock: Object.freeze({
      start: START,
      now: nowMs,
      // Back to 10:30:00 (or ms): a restart reads the same time every run.
      reset: function (ms) { OFFSET = (typeof ms === 'number' && isFinite(ms) ? ms : START) - RDnow.call(RD); },
    }),
    guard: Object.freeze({
      toast: toast,
      // Real media (handed-over blob: links): never opened, dragged or saved.
      protect: function (url) { if (/^blob:/.test(String(url))) protectedUrls.add(bare(url)); },
      unprotect: function (url) { protectedUrls.delete(bare(url)); },
      isProtected: isProtected,
      classify: classify,
      allowUnload: function () { allowUnload = true; },
      // On while the simulation holds the names (Begin screen, run, closing card): keyboard reloads
      // are refused, and a reload from the browser asks first.
      holdReload: function (on) { holdReload = !!on; if (on) reloading = false; },
      NOT_AVAILABLE: NA,
      EXPORTS_BLOCKED: EXPORTS,
    }),
  };
  Object.defineProperty(SIM, 'mode', { enumerable: true, get: function () { return mode; },
    // One way only: the locked screen's "Run with sample names".
    set: function (v) { if (v === 'sample') mode = 'sample'; } });
  Object.defineProperty(SIM, 'starters', { enumerable: true, get: function () { return starters; },
    // Set once, by the simulation's own start-up, from the narration.
    set: function (v) {
      if (starters !== null || !Array.isArray(v)) return;
      starters = Object.freeze(v.filter(function (s) { return typeof s === 'string' && s.length > 0 && s.length <= 200; }).slice(0, 8));
    } });
  Object.defineProperty(W, '__PMO_SIM__', { value: Object.freeze(SIM), writable: false, configurable: false, enumerable: false });

  // Every check passed: load the app (the same module index.html loads), as a parser-inserted
  // module script so it runs exactly when it would on the portal's own page.
  D.write('<script type="module" crossorigin src="' + esc(entry) + '"><\/script>');
})();
