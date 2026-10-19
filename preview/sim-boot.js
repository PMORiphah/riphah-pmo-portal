/* PMO Portal Simulation: boot script (live portal data). Owner: B2. Spec: contract §G.7.
 *
 * Loaded only by simulation.html (written by scripts/sim/make-sim-html.mjs), as a classic script
 * straight after the Content-Security-Policy meta, so it runs before any module code. It:
 *   (a) empties this tab's own sessionStorage (it could hold a copy of the portal's session) and
 *       removes the "pmo-sim:" keys an earlier build of the simulation left in localStorage;
 *   (b) reads the one-time hand-over nonce (#k=...) and strips it from the address bar;
 *   (c) replaces localStorage and sessionStorage with in-memory stores (nothing the page writes
 *       reaches the disk or the real portal's storage), and namespaces BroadcastChannel and Web
 *       Locks under "pmo-sim:" (except the hand-over channels), so the real portal's session
 *       (pmo_session, the 'pmo-session' channel) is never read and no real tab is disturbed;
 *   (d) turns off push, notifications, passkeys, the service worker, sendBeacon, share and WebRTC;
 *       speech may use on-device voices only;
 *   (f) guards links, window.open, navigation, downloads, printing (window.print, Ctrl+P) and Ctrl+S;
 *   (g) labels any print made from the browser menu ("Live portal data as of HH:MM PKT · not an
 *       official report") and names the file SIMULATION_...;
 *   (h) points the portal's Google Fonts link at the self-hosted copy in sim/fonts/;
 *   (i) publishes window.__PMO_SIM__ (frozen);
 *   (k) refuses frames, objects and embeds (an about:blank frame would have the browser's own APIs);
 *   (l) turns off IndexedDB, Cache Storage and cookies (they would persist on the portal's origin);
 *   (j) self-tests, and fails closed: on any failure the app is never loaded.
 * The clock is the computer's own (the data is live; its read time is shown on screen).
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
  var RDnow = Date.now;
  function now() { return RDnow.call(Date); }
  var fails = [];
  var checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || '' }); if (!ok) fails.push(name); }
  function attempt(name, fn) { try { fn(); } catch (e) { check(name, false, String(e && e.message || e)); } }

  // ── (a) the browser's own storage: this tab's session copy emptied, old simulation keys removed ─
  var SP = W.Storage && Storage.prototype;
  var N = SP ? { get: SP.getItem, set: SP.setItem, rem: SP.removeItem, key: SP.key,
    len: Object.getOwnPropertyDescriptor(SP, 'length').get } : null;
  var nativeGet = {};
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    var d = Object.getOwnPropertyDescriptor(W, name) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(W), name);
    nativeGet[name] = d && d.get ? d.get : null;
  });
  // The browser's own store (null if the browser refuses it, e.g. blocked site data).
  function nativeStore(name) { try { return nativeGet[name] ? nativeGet[name].call(W) : null; } catch (e) { return null; } }
  var NLS = nativeStore('localStorage'), NSS = nativeStore('sessionStorage');
  function rawKeys(st) {
    if (!st || !N) return [];
    var out = [], n = N.len.call(st);
    for (var i = 0; i < n; i++) { var k = N.key.call(st, i); if (k != null) out.push(k); }
    return out;
  }
  attempt('session-clean', function () {
    rawKeys(NSS).forEach(function (k) { N.rem.call(NSS, k); });
    rawKeys(NLS).forEach(function (k) { if (k.indexOf(P) === 0) N.rem.call(NLS, k); });
    check('session-clean', rawKeys(NSS).length === 0 && rawKeys(NLS).every(function (k) { return k.indexOf(P) !== 0; }));
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


  // ── (c) in-memory storage; namespaced channels and locks ──────────────────────────────────────
  // localStorage and sessionStorage become Map-backed stores with the Storage API (getItem, setItem,
  // removeItem, clear, key, length, and named access through a Proxy). Calls on the browser's own
  // Storage objects through Storage.prototype land in the same memory, so nothing the page does
  // reaches native storage. Each store dies with the page.
  var MEM = typeof WeakMap === 'function' ? new WeakMap() : null;   // proxy or native object → memory api
  var memProxies = [];
  function memoryStore() {
    var m = new Map();
    var api = {
      getItem: function getItem(k) { k = String(k); return m.has(k) ? m.get(k) : null; },
      setItem: function setItem(k, v) { m.set(String(k), String(v)); },
      removeItem: function removeItem(k) { m.delete(String(k)); },
      clear: function clear() { m.clear(); },
      key: function key(i) { var ks = Array.from(m.keys()); i = Number(i); return i >= 0 && i < ks.length && Math.floor(i) === i ? ks[i] : null; },
    };
    var target = Object.create(SP || Object.prototype);
    var isApi = function (k) { return Object.prototype.hasOwnProperty.call(api, k); };
    var p = new Proxy(target, {
      get: function (t, k) {
        if (typeof k === 'symbol') return Reflect.get(t, k);
        if (k === 'length') return m.size;
        if (isApi(k)) return api[k];
        return m.has(k) ? m.get(k) : undefined;
      },
      set: function (t, k, v) {
        if (typeof k === 'symbol' || k === 'length' || isApi(k)) return true;
        m.set(String(k), String(v));
        return true;
      },
      has: function (t, k) { if (typeof k === 'symbol') return k in t; return k === 'length' || isApi(k) || m.has(k); },
      deleteProperty: function (t, k) { if (typeof k !== 'symbol') m.delete(k); return true; },
      ownKeys: function () { return Array.from(m.keys()); },
      getOwnPropertyDescriptor: function (t, k) {
        if (typeof k === 'symbol' || !m.has(k)) return undefined;
        return { value: m.get(k), writable: true, enumerable: true, configurable: true };
      },
      defineProperty: function (t, k, d) { if (typeof k !== 'symbol' && d && 'value' in d) m.set(String(k), String(d.value)); return true; },
    });
    var store = { proxy: p, api: api, size: function () { return m.size; } };
    if (MEM) MEM.set(p, store);
    memProxies.push(p);
    return store;
  }
  var memLocal = null, memSession = null;
  attempt('storage', function () {
    memLocal = memoryStore();
    memSession = memoryStore();
    if (NLS && MEM) MEM.set(NLS, memLocal);
    if (NSS && MEM) MEM.set(NSS, memSession);
    var defineStore = function (name, store) {
      Object.defineProperty(W, name, { configurable: true, enumerable: true, get: function () { return store.proxy; } });
    };
    defineStore('localStorage', memLocal);
    defineStore('sessionStorage', memSession);
    if (SP) {
      var memOf = function (st) {
        var a = MEM && st && typeof st === 'object' ? MEM.get(st) : null;
        if (!a) throw new TypeError('Illegal invocation');
        return a;
      };
      SP.getItem = function getItem(k) { return memOf(this).api.getItem(k); };
      SP.setItem = function setItem(k, v) { return memOf(this).api.setItem(k, v); };
      SP.removeItem = function removeItem(k) { return memOf(this).api.removeItem(k); };
      SP.clear = function clear() { return memOf(this).api.clear(); };
      SP.key = function key(i) { return memOf(this).api.key(i); };
      Object.defineProperty(SP, 'length', { configurable: true, enumerable: true, get: function () { return memOf(this).size(); } });
    }
    // Storage events from other tabs carry the real portal's keys: the page never sees them.
    W.addEventListener('storage', function (e) { e.stopImmediatePropagation(); }, true);
    // Probe: the page's writes land in memory, and the browser's own key lists do not change.
    var beforeL = rawKeys(NLS).join('\u0001'), beforeS = rawKeys(NSS).join('\u0001');
    localStorage.setItem('__probe', '1');
    sessionStorage.__probe = '2';
    var ok = localStorage.getItem('__probe') === '1' && localStorage.__probe === '1' && sessionStorage.getItem('__probe') === '2'
      && Object.keys(localStorage).indexOf('__probe') >= 0 && localStorage.length === 1
      && (!NLS || N.get.call(NLS, '__probe') === null) && (!NSS || N.get.call(NSS, '__probe') === null)
      && localStorage.getItem('pmo_session') === null
      && (!NLS || Storage.prototype.getItem.call(NLS, '__probe') === '1');
    localStorage.removeItem('__probe');
    delete sessionStorage.__probe;
    ok = ok && localStorage.length === 0 && sessionStorage.length === 0
      && rawKeys(NLS).join('\u0001') === beforeL && rawKeys(NSS).join('\u0001') === beforeS;
    check('storage', ok);
  });
  var STORAGE = Object.freeze({
    kind: 'memory',
    isMemory: function (st) { return memProxies.indexOf(st) >= 0; },
    // Counts and presence only: the browser's own values are never read here.
    nativeCount: function () { return { local: rawKeys(NLS).length, session: rawKeys(NSS).length }; },
    nativeHas: function (k) { return rawKeys(NLS).indexOf(String(k)) >= 0 || rawKeys(NSS).indexOf(String(k)) >= 0; },
  });

  var HAND = nonce ? 'pmo-sim-' + nonce : null;
  // The hand-over channel and its refresh replies ('pmo-sim-<nonce>.<req>') keep their names.
  function handName(name) { return HAND !== null && (name === HAND || name.indexOf(HAND + '.') === 0); }
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
        return Reflect.construct(t, [handName(name) ? name : P + name], nt === SimBC ? t : nt);
      },
    });
    try { Object.defineProperty(NBC.prototype, 'constructor', { value: SimBC, writable: true, configurable: true, enumerable: false }); } catch (e) { /* checked below */ }
    W.BroadcastChannel = SimBC;
    var probe = new W.BroadcastChannel('probe');
    var probe2 = new W.BroadcastChannel('pmo-session');
    check('channels', probe.name === P + 'probe' && probe2.name === P + 'pmo-session' && W.BroadcastChannel.prototype.constructor === SimBC
      && Object.getPrototypeOf(W.BroadcastChannel) !== NBC);
    probe.close();
    probe2.close();
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


  // ── toast (shared by every guard) ─────────────────────────────────────────────────────────────
  var NA = 'Not available in the simulation';
  var EXPORTS = 'Exports are not available in the simulation';
  var PRINT_OFF = 'Printing is off in the presentation';
  var toastEl = null, toastTimer = 0, lastMsg = '', lastAt = 0;
  function toast(msg) {
    msg = String(msg || NA);
    var t = now();
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

  // ── (f) guards: links, window.open, navigation, downloads, printing, Ctrl+S ───────────────────
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
    if (u.pathname === location.pathname && !u.search) return 'self';
    return 'portal';
  }
  var LINK_OK = { self: 1, blob: 1 };
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
  // 'block' or 'allow' for activating an anchor (click, a.click(), dispatched click).
  function anchorVerdict(a) {
    var h = a.getAttribute('href');
    if (h == null) return 'allow';
    if (a.hasAttribute('data-sim-href')) { toast(NA); return 'block'; }
    var c = classify(a.href);
    var dl = a.hasAttribute('download');
    if (c === 'real-media') { toast(NA); return 'block'; }
    if (dl) { toast(EXPORTS); return 'block'; }
    if (!LINK_OK[c]) { toast(NA); return 'block'; }
    return 'allow';
  }
  var allowUnload = false, reloading = false, holdReload = false;
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
      if (c !== 'self' && c !== 'blob') { e.preventDefault(); toast(NA); }
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
      var mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); toast(NA); }
      // Ctrl/Cmd+P (and Ctrl+Shift+P): printing is off; the browser menu's Print is labelled, see (g).
      if (mod && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); e.stopImmediatePropagation(); toast(PRINT_OFF); }
      // A reload would drop the data read from the portal (it lives only in this page's memory). While
      // the simulation holds it (guard.holdReload, set by the director), F5 / Ctrl+R / Shift+F5, which
      // a presentation clicker can send by mistake, are refused with a toast. Otherwise a reload from
      // the keyboard goes ahead without the leave-page prompt (Chrome asks beforeunload before it
      // fires 'navigate' for a reload it starts itself).
      if (e.key === 'F5' || e.key === 'BrowserRefresh' || (mod && (e.key === 'r' || e.key === 'R'))) {
        if (holdReload && !allowUnload) { e.preventDefault(); e.stopImmediatePropagation(); toast('Reload is off during the presentation: it would drop the data read from the portal. Use Restart (Home) instead.'); }
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

  // window.print (Save as PDF, Print buttons): off, with a toast. Ctrl+P is swallowed above.
  var nativePrint = W.print;
  attempt('print-block', function () {
    Object.defineProperty(W, 'print', { configurable: false, writable: false, enumerable: true,
      value: function print() { toast(PRINT_OFF); } });
    check('print-block', W.print !== nativePrint);
  });

  // window.open: only non-protected blob: links of this page.
  var nativeOpen = W.open;
  function controlledWindow() {
    var w = {
      closed: false, opener: null, name: '',
      close: function () { w.closed = true; }, focus: function () {}, blur: function () {}, print: function () { toast(PRINT_OFF); },
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
          // drop the data: refused while the simulation holds it.
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

  // ── (g) print from the browser menu: a label on every page, SIMULATION_ file names ────────────
  // window.print and Ctrl+P are off (f); the browser menu's Print cannot be stopped, so every page it
  // prints says what it is. The read time is set once the data has arrived (__PMO_SIM__.setAsOf).
  var HHMM = (function () {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false }); }
    catch (e) { return null; }
  }());
  var asOfMs = null;
  function cssText(s) {
    // A CSS string: every character outside printable ASCII (and " and \) as a 6-digit escape. The
    // escape is closed by a space, which CSS consumes, so a space that follows it in the text stays.
    return '"' + String(s).replace(/[^ !#-[\]-~]/g, function (c) { return '\\' + ('000000' + c.charCodeAt(0).toString(16)).slice(-6) + ' '; }) + '"';
  }
  function printLabel() {
    return asOfMs !== null && HHMM ? 'Live portal data as of ' + HHMM.format(asOfMs) + ' PKT · not an official report'
      : 'Live portal data · not an official report';
  }
  function printCss() {
    var label = cssText(printLabel());
    return [
      '@page {',
      '  @top-center { content: ' + label + '; font: 600 7.5pt Inter, Arial, sans-serif; letter-spacing: .06em; color: #8A5A14; }',
      '  @bottom-right { content: counter(page); font: 500 7pt Inter, Arial, sans-serif; color: #4A5D70; }',
      '}',
      '@media print {',
      '  body::after { content: ' + label + '; position: fixed; top: 0; right: 0;',
      '    z-index: 2147483647; padding: 1.2mm 2.6mm; border-radius: 0 0 0 2mm; background: #FFF7E8; color: #8A5A14;',
      '    border: .3mm solid #D89840; border-top: 0; border-right: 0; font: 600 7pt Inter, Arial, sans-serif; letter-spacing: .04em;',
      '    -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  img[alt^="Riphah"] { display: none !important; }',
      '  [data-sim-ui] { display: none !important; }',
      '  .br-page { position: relative !important; }',
      '  .br-page::after { content: ' + cssText('Live portal data · not an official report') + '; position: absolute; left: 50%; top: 46%;',
      '    transform: translate(-50%, -50%) rotate(-30deg); font: 700 40px Inter, Arial, sans-serif; letter-spacing: .06em;',
      '    color: rgba(13, 25, 41, .075); white-space: nowrap; pointer-events: none; z-index: 50;',
      '    -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '}',
    ].join('\n');
  }
  var NAV_NAMES = { cmd: 'Capex_Dashboard', proj: 'Projects', camp: 'Campus_Sites', perf: 'Performance', risks: 'Risk_Register',
    cashflow: 'Project_Cashflows', schedule: 'Timeline_and_Schedule', past: 'Past_Projects', review: 'PMO_Review',
    reports: 'Monthly_Report', upd: 'Updates', photowall: 'Gallery', team: 'Team_and_About', users: 'User_Management',
    log: 'Activity_Log', set: 'Settings' };
  var MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
  function pktDay() { return new Date((asOfMs !== null ? asOfMs : now()) + 5 * 3600 * 1000).toISOString().slice(0, 10); }
  function printTitle() {
    var html = D.documentElement;
    if (html.classList.contains('br-printing')) {
      var root = D.querySelector('.br-print-root') || D.querySelector('[data-tour="report-viewer"]') || D.body;
      var m = new RegExp('(' + MONTHS + ')\\s+(20\\d\\d)').exec((root && root.textContent) || '');
      return 'SIMULATION_Monthly_Report' + (m ? '_' + m[1] + '_' + m[2] : '');
    }
    var active = D.querySelector('[data-nav][aria-current="page"]');
    var id = (active && active.getAttribute('data-nav')) || html.getAttribute('data-sim-page') || '';
    var page = NAV_NAMES[id] || (id ? id.replace(/[^A-Za-z0-9]+/g, '_') : 'Portal');
    return 'SIMULATION_' + page + '_' + pktDay();
  }
  var savedTitle = null, printingTitle = null, printStyle = null;
  attempt('print', function () {
    printStyle = D.createElement('style');
    printStyle.setAttribute('data-sim-print', '');
    printStyle.textContent = printCss();
    (D.head || D.documentElement).appendChild(printStyle);
    W.addEventListener('beforeprint', function () {
      savedTitle = D.title;
      printingTitle = printTitle();
      D.title = printingTitle;
    });
    W.addEventListener('afterprint', function () {
      if (savedTitle !== null && D.title === printingTitle) D.title = savedTitle;
      savedTitle = printingTitle = null;
    });
    check('print', /Live portal data/.test(printStyle.textContent));
  });
  // The read time of the data on screen (ms). It only moves forward (a Refresh reads later data),
  // and only to a time within a day before now (or a few minutes after it).
  function setAsOf(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return false;
    var t = now();
    if (ms < t - 24 * 3600 * 1000 || ms > t + 5 * 60 * 1000) return false;
    if (asOfMs !== null && ms < asOfMs) return false;
    asOfMs = ms;
    if (printStyle) printStyle.textContent = printCss();
    return true;
  }

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

  // ── (k) no frames: an about:blank frame (which the policy's frame-src does not stop) would have ─
  // the browser's own storage and window.open, outside every guard above. Creating or inserting a
  // frame, object or embed is refused (also through markup), one that still reaches the page is
  // removed at once, and their window and document read as null. The portal shows none on the
  // screens the simulation visits.
  var FRAME_TAG = /^(iframe|frame|object|embed|portal|fencedframe)$/i;
  var FRAME_SEL = 'iframe,frame,object,embed,portal,fencedframe';
  var FRAME_MARKUP = /<\s*(iframe|frame|object|embed|portal|fencedframe)\b/i;
  function refuseFrame() { throw new DOMException('Frames are not available in the simulation', 'NotSupportedError'); }
  function hasFrame(n) {
    if (!n || (n.nodeType !== 1 && n.nodeType !== 11)) return false;
    if (n.nodeType === 1 && FRAME_TAG.test(String(n.localName || n.tagName || ''))) return true;
    return !!(n.querySelector && n.querySelector(FRAME_SEL));
  }
  attempt('frames', function () {
    var DP = Document.prototype, NP = Node.prototype, EP = Element.prototype;
    var ce = DP.createElement, cens = DP.createElementNS;
    DP.createElement = function createElement(tag) { if (FRAME_TAG.test(String(tag))) refuseFrame(); return ce.apply(this, arguments); };
    DP.createElementNS = function createElementNS(ns, tag) { if (FRAME_TAG.test(String(tag).split(':').pop())) refuseFrame(); return cens.apply(this, arguments); };
    var ac = NP.appendChild, ib = NP.insertBefore, rc = NP.replaceChild;
    NP.appendChild = function appendChild(n) { if (hasFrame(n)) refuseFrame(); return ac.call(this, n); };
    NP.insertBefore = function insertBefore(n, r) { if (hasFrame(n)) refuseFrame(); return ib.call(this, n, r); };
    NP.replaceChild = function replaceChild(n, o) { if (hasFrame(n)) refuseFrame(); return rc.call(this, n, o); };
    [EP, W.DocumentFragment && DocumentFragment.prototype, DP, W.CharacterData && CharacterData.prototype].forEach(function (proto) {
      if (!proto) return;
      ['append', 'prepend', 'before', 'after', 'replaceWith', 'replaceChildren'].forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(proto, k) || typeof proto[k] !== 'function') return;
        var f = proto[k];
        proto[k] = function () { for (var i = 0; i < arguments.length; i++) if (hasFrame(arguments[i])) refuseFrame(); return f.apply(this, arguments); };
      });
    });
    // Markup: innerHTML, outerHTML, insertAdjacentHTML, setHTMLUnsafe, createContextualFragment, document.write.
    var markupOk = function (h) { if (FRAME_MARKUP.test(String(h))) refuseFrame(); };
    [[EP, 'innerHTML'], [EP, 'outerHTML'], [W.ShadowRoot && ShadowRoot.prototype, 'innerHTML']].forEach(function (pair) {
      var proto = pair[0], name = pair[1];
      var d = proto && Object.getOwnPropertyDescriptor(proto, name);
      if (!d || !d.set) return;
      Object.defineProperty(proto, name, { configurable: true, enumerable: d.enumerable, get: d.get,
        set: function (h) { markupOk(h); return d.set.call(this, h); } });
    });
    var iah = EP.insertAdjacentHTML;
    if (iah) EP.insertAdjacentHTML = function insertAdjacentHTML(pos, h) { markupOk(h); return iah.call(this, pos, h); };
    [EP, W.ShadowRoot && ShadowRoot.prototype].forEach(function (proto) {
      ['setHTMLUnsafe', 'setHTML'].forEach(function (k) {
        if (!proto || typeof proto[k] !== 'function') return;
        var f = proto[k];
        proto[k] = function (h) { markupOk(h); return f.apply(this, arguments); };
      });
    });
    if (W.Range && Range.prototype.createContextualFragment) {
      var ccf = Range.prototype.createContextualFragment;
      Range.prototype.createContextualFragment = function createContextualFragment(h) { markupOk(h); return ccf.call(this, h); };
    }
    ['write', 'writeln'].forEach(function (k) {
      var f = DP[k];
      if (typeof f === 'function') DP[k] = function () { for (var i = 0; i < arguments.length; i++) markupOk(arguments[i]); return f.apply(this, arguments); };
    });
    [W.HTMLIFrameElement, W.HTMLFrameElement, W.HTMLObjectElement, W.HTMLEmbedElement].forEach(function (C) {
      if (!C) return;
      ['contentWindow', 'contentDocument'].forEach(function (p) {
        if (p in C.prototype) Object.defineProperty(C.prototype, p, { configurable: true, enumerable: true, get: function () { return null; } });
      });
      if (typeof C.prototype.getSVGDocument === 'function') C.prototype.getSVGDocument = function () { return null; };
    });
    // Anything that still gets in (another path) is taken out as soon as it is seen.
    if (W.MutationObserver) {
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes || [], function (n) {
            if (n.nodeType !== 1) return;
            var found = FRAME_TAG.test(String(n.localName || '')) ? [n] : Array.prototype.slice.call(n.querySelectorAll ? n.querySelectorAll(FRAME_SEL) : []);
            found.forEach(function (f) { try { f.remove(); } catch (e) { /* ignore */ } });
          });
        });
      }).observe(D.documentElement, { childList: true, subtree: true });
    }
    // Probes: creating one, inserting one built elsewhere, and markup with one are all refused.
    var refused = function (fn) { try { fn(); return false; } catch (e) { return true; } };
    var tpl = ce.call(D, 'template');
    tpl.innerHTML = '';
    var inertFrame = (new DOMParser()).parseFromString('<iframe></iframe>', 'text/html').querySelector('iframe');
    check('frames', refused(function () { D.createElement('iframe'); }) && refused(function () { D.createElement('OBJECT'); })
      && refused(function () { D.createElementNS('http://www.w3.org/1999/xhtml', 'embed'); })
      && refused(function () { D.createDocumentFragment().appendChild(inertFrame); })
      && refused(function () { tpl.innerHTML = '<iframe></iframe>'; })
      && (!W.HTMLIFrameElement || inertFrame.contentWindow === null));
  });

  // ── (l) IndexedDB, Cache Storage and cookies: these would persist on the portal's own origin ──
  attempt('persist', function () {
    var off = function () { return new DOMException('Not available in the simulation', 'SecurityError'); };
    if (W.IDBFactory) {
      var IF = IDBFactory.prototype;
      ['open', 'deleteDatabase', 'cmp'].forEach(function (k) { if (typeof IF[k] === 'function') IF[k] = function () { throw off(); }; });
      if (typeof IF.databases === 'function') IF.databases = function () { return Promise.resolve([]); };
    }
    if (W.CacheStorage) {
      var CS = CacheStorage.prototype;
      ['open', 'match', 'has', 'keys', 'delete'].forEach(function (k) { if (typeof CS[k] === 'function') CS[k] = function () { return Promise.reject(off()); }; });
    }
    ['indexedDB', 'caches', 'cookieStore'].forEach(function (k) {
      try { Object.defineProperty(W, k, { configurable: true, enumerable: true, get: function () { return undefined; } }); } catch (e) { /* checked below */ }
    });
    var cd = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (cd) Object.defineProperty(Document.prototype, 'cookie', { configurable: true, enumerable: cd.enumerable, get: function () { return ''; }, set: function () {} });
    D.cookie = '__pmo_sim_probe=1';
    check('persist', D.cookie === '' && W.indexedDB === undefined && W.caches === undefined && W.cookieStore === undefined);
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
  var SIM = {
    ok: true,
    v: 2,
    nonce: nonce,
    base: BASE,
    csp: CSP,
    checks: Object.freeze(checks.map(function (c) { return Object.freeze(c); })),
    // Real time: the data is live and its read time is shown on screen.
    clock: Object.freeze({ now: function () { return now(); } }),
    storage: STORAGE,
    // The read time of the data (ms), for the print label and file names (see (g)).
    setAsOf: setAsOf,
    guard: Object.freeze({
      toast: toast,
      // Real media (handed-over blob: links): never opened, dragged or saved.
      protect: function (url) { if (/^blob:/.test(String(url))) protectedUrls.add(bare(url)); },
      unprotect: function (url) { protectedUrls.delete(bare(url)); },
      isProtected: isProtected,
      classify: classify,
      allowUnload: function () { allowUnload = true; },
      // On while the simulation holds the data (Begin screen, run, closing card): keyboard reloads
      // are refused, and a reload from the browser asks first.
      holdReload: function (on) { holdReload = !!on; if (on) reloading = false; },
      NOT_AVAILABLE: NA,
      EXPORTS_BLOCKED: EXPORTS,
      PRINT_OFF: PRINT_OFF,
    }),
  };
  Object.defineProperty(W, '__PMO_SIM__', { value: Object.freeze(SIM), writable: false, configurable: false, enumerable: false });

  // Every check passed: load the app (the same module index.html loads), as a parser-inserted
  // module script so it runs exactly when it would on the portal's own page.
  D.write('<script type="module" crossorigin src="' + esc(entry) + '"><\/script>');
})();
