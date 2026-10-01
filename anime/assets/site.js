/* Drawn to Move — page behaviour. No dependencies. Everything degrades to a readable page. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (sel, el) { return (el || doc).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };
  var css = function (name, el) { return getComputedStyle(el || root).getPropertyValue(name).trim(); };

  /* ---------- theme toggle (standalone site only) ---------- */
  var themeBtn = $('[data-theme-toggle]');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store.set('dtm-theme', next);
    });
  }

  /* ---------- broken or missing images fall back to placeholders ---------- */
  function toPlaceholder(img) {
    if (img.classList.contains('bd')) { img.remove(); return; }
    var shot = img.closest('.shot');
    if (shot && shot.tagName === 'BUTTON') {
      var div = doc.createElement('div');
      div.className = shot.className + ' is-ph';
      div.setAttribute('aria-hidden', 'true');
      div.innerHTML = '<span class="ph"></span>';
      shot.replaceWith(div);
    } else {
      var fr = img.closest('.fr') || img;
      var ph = doc.createElement('div');
      ph.className = 'ph';
      ph.setAttribute('aria-hidden', 'true');
      ph.dataset.t = fr.dataset.t || '';
      if (fr.classList.contains('is-on')) ph.classList.add('is-on');
      fr.replaceWith(ph);
      refreshScenes();
    }
  }
  $$('img').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0 && img.src.indexOf('data:') !== 0) toPlaceholder(img);
    else img.addEventListener('error', function () { toPlaceholder(img); }, { once: true });
  });

  /* ---------- sections: masthead label, accent colour, scrub progress ---------- */
  var sections = $$('.hero, #start, .reel, .lab, .sec, .end').map(function (el) {
    var n, t;
    if (el.classList.contains('reel')) {
      n = 'Reel ' + el.dataset.reel;
      t = el.dataset.title + ' · ' + el.dataset.years;
    } else if (el.classList.contains('hero')) {
      n = 'Opening titles'; t = 'A history of anime, 1907–2026';
    } else if (el.id === 'start') {
      n = 'Prologue'; t = 'How this history works';
    } else if (el.classList.contains('end')) {
      n = 'End titles'; t = 'つづく · to be continued';
    } else {
      var lab = $('.label', el); var h = $('h2', el);
      n = lab ? lab.textContent.replace(/^Interlude · /, 'Interlude') : '';
      if (el.classList.contains('lab')) n = 'Interlude';
      t = h ? h.textContent : '';
    }
    var era = el.style.getPropertyValue('--era').trim() || css('--era', el);
    return { el: el, n: n, t: t, era: era };
  });
  var nowN = $('[data-now-n]'), nowT = $('[data-now-t]');
  var scrub = $$('[data-scrub]').map(function (a) { return { a: a, el: doc.getElementById(a.dataset.scrub) }; });
  var current = null;

  function setCurrent(s) {
    if (s === current) return;
    current = s;
    if (nowN) nowN.textContent = s.n;
    if (nowT) nowT.textContent = s.t;
    if (s.era) root.style.setProperty('--era', s.era);
  }

  /* ---------- scenes: frames change as you scroll through a reel's opener ---------- */
  var scenes = $$('.scene').map(function (el) {
    var frames = $$('.frames > *', el);
    var box = $('.frames', el);
    if (box) box.classList.add('is-live');
    return { el: el, frames: frames, cap: $('[data-frame-cap]', el), idx: -1 };
  });

  function setFrame(s, i) {
    if (i === s.idx) return;
    s.idx = i;
    s.frames.forEach(function (f, k) { f.classList.toggle('is-on', k === i); });
    var f = s.frames[i];
    if (s.cap && f) {
      var t = f.dataset.t || '', c = f.classList.contains('ph') ? '' : f.dataset.credit || '';
      s.cap.innerHTML = (t ? '<b>' + escapeHtml(t) + '</b>' : '') + (c ? '<br>' + escapeHtml(c) : '');
    }
  }
  scenes.forEach(function (s) { setFrame(s, 0); });

  // a frame that failed to load has been swapped for a placeholder: look the frames up again
  function refreshScenes() {
    if (!scenes) return;
    scenes.forEach(function (s) { s.frames = $$('.frames > *', s.el); });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var vh = window.innerHeight;
      var probe = vh * 0.38;
      for (var i = sections.length - 1; i >= 0; i--) {
        var r = sections[i].el.getBoundingClientRect();
        if (r.top <= probe) { setCurrent(sections[i]); break; }
      }
      scrub.forEach(function (s) {
        if (!s.el) return;
        var r = s.el.getBoundingClientRect();
        var p = clamp((vh * 0.5 - r.top) / r.height, 0, 1);
        s.a.style.setProperty('--p', p.toFixed(3));
      });
      scenes.forEach(function (s) {
        var r = s.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var total = Math.max(1, r.height - vh);
        var p = clamp(-r.top / total, 0, 0.9999);
        setFrame(s, Math.min(s.frames.length - 1, Math.floor(p * s.frames.length)));
        s.el.classList.toggle('is-reading', p > 0.035);
      });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- contents overlay ---------- */
  var toc = $('[data-toc]');
  var tocOpeners = $$('[data-toc-open]');
  var lastFocus = null;
  function openToc() {
    if (!toc) return;
    lastFocus = doc.activeElement;
    toc.hidden = false;
    tocOpeners.forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    var c = $('[data-toc-close]', toc); if (c) c.focus();
  }
  function closeToc(restore) {
    if (!toc || toc.hidden) return;
    toc.hidden = true;
    tocOpeners.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (restore && lastFocus) lastFocus.focus();
  }
  tocOpeners.forEach(function (b) { b.addEventListener('click', openToc); });
  if (toc) {
    $$('[data-toc-close]', toc).forEach(function (b) { b.addEventListener('click', function () { closeToc(true); }); });
    $$('[data-toc-link]', toc).forEach(function (a) { a.addEventListener('click', function () { closeToc(false); }); });
    toc.addEventListener('click', function (e) { if (e.target === toc) closeToc(true); });
  }

  /* ---------- film strips: buttons and drag to scroll ---------- */
  $$('[data-strip]').forEach(function (strip) {
    var track = $('.strip-track', strip);
    if (!track) return;
    var step = function () { return Math.max(240, track.clientWidth * 0.8); };
    var prev = $('[data-strip-prev]', strip), next = $('[data-strip-next]', strip);
    if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: reduce.matches ? 'auto' : 'smooth' }); });
    if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: reduce.matches ? 'auto' : 'smooth' }); });
    var down = false, moved = false, startX = 0, startLeft = 0;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) { moved = true; track.classList.add('is-drag'); }
      if (moved) track.scrollLeft = startLeft - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!down) return;
      down = false;
      track.classList.remove('is-drag');
    });
    track.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
  });

  /* ---------- lightbox ---------- */
  var lb = $('[data-lb-dialog]');
  var lbImg = $('[data-lb-img]'), lbCap = $('[data-lb-cap]');
  var lbItems = [], lbIndex = 0;
  function visibleShots() {
    return $$('[data-lb]').filter(function (b) { return b.offsetParent !== null || b.closest('.hero-reel'); })
      .filter(function (b) { return !b.closest('.hero-reel'); });
  }
  function showLb(i) {
    if (!lbItems.length) return;
    lbIndex = (i + lbItems.length) % lbItems.length;
    var b = lbItems[lbIndex], img = $('img', b);
    if (!img) return;
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt || '';
    var t = b.dataset.t, c = b.dataset.cap, cr = b.dataset.credit;
    lbCap.innerHTML = (t ? '<b>' + escapeHtml(t) + '</b> ' : '') + escapeHtml(c || '') + (cr ? '<small>' + escapeHtml(cr) + '</small>' : '');
  }
  if (lb && typeof lb.showModal === 'function') {
    doc.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lb]');
      if (!b) return;
      lbItems = visibleShots();
      var i = lbItems.indexOf(b);
      showLb(i < 0 ? 0 : i);
      lb.showModal();
    });
    $('[data-lb-close]', lb).addEventListener('click', function () { lb.close(); });
    $('[data-lb-prev]', lb).addEventListener('click', function () { showLb(lbIndex - 1); });
    $('[data-lb-next]', lb).addEventListener('click', function () { showLb(lbIndex + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-in') || e.target.classList.contains('lb-img')) lb.close(); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') showLb(lbIndex - 1);
      if (e.key === 'ArrowRight') showLb(lbIndex + 1);
    });
  }

  /* ---------- glossary popovers ---------- */
  var glData = {};
  try { glData = JSON.parse(($('#gl-data') || {}).textContent || '{}'); } catch (e) { glData = {}; }
  var pop = $('[data-gl-pop]');
  var popFor = null;
  function showGl(btn) {
    var d = glData[btn.dataset.gl];
    if (!d || !pop) return;
    pop.innerHTML = '<b>' + escapeHtml(d.term) + '<span lang="ja">' + escapeHtml(d.jp) + '</span></b>' + escapeHtml(d.def);
    pop.hidden = false;
    popFor = btn;
    btn.setAttribute('aria-describedby', 'gl-pop');
    var r = btn.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = clamp(r.left + r.width / 2 - pw / 2, 12, window.innerWidth - pw - 12);
    var top = r.bottom + 10;
    if (top + ph > window.innerHeight - 12) top = r.top - ph - 10;
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top = (top + window.scrollY) + 'px';
  }
  function hideGl() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (popFor) popFor.removeAttribute('aria-describedby');
    popFor = null;
  }
  doc.addEventListener('click', function (e) {
    var b = e.target.closest('.gl');
    if (b) { e.preventDefault(); if (popFor === b) hideGl(); else showGl(b); return; }
    if (pop && !pop.contains(e.target)) hideGl();
  });
  if (window.matchMedia('(hover: hover)').matches) {
    doc.addEventListener('mouseover', function (e) { var b = e.target.closest && e.target.closest('.gl'); if (b) showGl(b); });
    doc.addEventListener('mouseout', function (e) { var b = e.target.closest && e.target.closest('.gl'); if (b && !b.contains(e.relatedTarget)) hideGl(); });
  }
  window.addEventListener('scroll', function () { if (popFor) hideGl(); }, { passive: true });

  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { hideGl(); closeToc(true); }
  });

  /* ---------- myth cards ---------- */
  $$('.myth').forEach(function (b) {
    b.addEventListener('click', function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); });
  });

  /* ---------- canvas helper ---------- */
  function fitCanvas(cv) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }
  function whenVisible(el, cb) {
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(function (entries) { entries.forEach(function (en) { cb(en.isIntersecting); }); }, { rootMargin: '120px' }).observe(el);
  }
  var uiFont = function (size, weight) { return (weight || 700) + ' ' + size + 'px "Zen Kaku Gothic New", system-ui, sans-serif'; };

  /* ---------- the Frame Lab ---------- */
  (function frameLab() {
    var cv = $('[data-frame-lab]');
    if (!cv) return;
    var hold = 3, speed = 1, t = 0, last = 0, visible = false, raf = 0;
    var buttons = $$('[data-hold]');
    var speedIn = $('#fl-speed'), speedOut = $('[data-speed-out]');
    var ro = { dps: $('[data-ro="dps"]'), ep: $('[data-ro="ep"]'), hold: $('[data-ro="hold"]') };
    function updateReadout() {
      ro.dps.textContent = String(24 / hold);
      ro.ep.textContent = Math.round(22 * 60 * 24 / hold).toLocaleString('en-US');
      ro.hold.textContent = String(hold);
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        hold = +b.dataset.hold;
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        updateReadout();
        if (reduce.matches) draw();
      });
    });
    if (speedIn) speedIn.addEventListener('input', function () {
      speed = +speedIn.value;
      if (speedOut) speedOut.textContent = (Math.round(speed * 100) / 100) + '×';
    });
    updateReadout();

    var MOUTH = [0, 1, 2, 1, 0, 2, 1, 2, 0, 0, 1, 2, 2, 1, 0, 0];

    function draw() {
      var c = fitCanvas(cv), ctx = c.ctx, W = c.w, H = c.h;
      var era = css('--era', cv.closest('.lab')) || '#7fb2ff';
      var f = Math.floor(t * 24);
      var d = Math.floor(f / hold) * hold;
      var td = d / 24;
      var sheetH = Math.max(46, H * 0.2);
      var sceneH = H - sheetH;
      var faceW = W > 640 ? W * 0.28 : 0;
      var sceneW = W - faceW;

      // background pan: moves every frame, regardless of the hold
      ctx.fillStyle = '#121620'; ctx.fillRect(0, 0, W, H);
      var sky = ctx.createLinearGradient(0, 0, 0, sceneH);
      sky.addColorStop(0, '#1b2440'); sky.addColorStop(1, '#3b3550');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, sceneW, sceneH);
      var pan = (f / 24) * 90;
      ctx.fillStyle = '#2b2f45';
      ctx.beginPath(); ctx.moveTo(0, sceneH);
      for (var x = 0; x <= sceneW + 40; x += 40) {
        var hx = x + (pan * 0.35 % 160);
        ctx.lineTo(x, sceneH * 0.62 + Math.sin((x + pan * 0.35) / 90) * 18);
      }
      ctx.lineTo(sceneW, sceneH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0d1018';
      var gap = 170, off = pan % gap;
      for (var px = -off; px < sceneW + gap; px += gap) {
        ctx.fillRect(px, sceneH * 0.3, 6, sceneH * 0.7);
        ctx.fillRect(px - 16, sceneH * 0.34, 38, 4);
      }
      ctx.strokeStyle = 'rgba(13,16,24,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, sceneH * 0.36); ctx.lineTo(sceneW, sceneH * 0.36); ctx.stroke();
      var ground = sceneH - 18;
      ctx.fillStyle = '#0d1018'; ctx.fillRect(0, ground, sceneW, sceneH - ground);

      // the ball: drawn only at held drawing times
      function ballAt(tt) {
        var loop = 3.2;
        var bx = 40 + ((tt % loop) / loop) * (sceneW - 80);
        var phase = (tt * 1.6) % 1;
        var hgt = Math.sin(Math.PI * phase);
        var by = ground - 18 - hgt * (sceneH * 0.5);
        var vy = Math.cos(Math.PI * phase);
        var squash = hgt < 0.08 ? 0.7 : 1 + Math.abs(vy) * 0.18;
        return { x: bx, y: by + (hgt < 0.08 ? 5 : 0), sx: 1 / squash, sy: squash };
      }
      // onion skin: the previous five drawings
      for (var k = 5; k >= 1; k--) {
        var ot = (d - k * hold) / 24;
        if (ot < 0) continue;
        var o = ballAt(ot);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + 0.04 * (5 - k)) + ')';
        ctx.beginPath(); ctx.ellipse(o.x, o.y, 16 * o.sx, 16 * o.sy, 0, 0, Math.PI * 2); ctx.fill();
      }
      var b = ballAt(td);
      ctx.fillStyle = era;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 18 * b.sx, 18 * b.sy, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(b.x, ground + 4, 20 * (1 - (ground - b.y) / sceneH * 0.6), 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(244,241,234,.8)'; ctx.font = uiFont(12);
      ctx.fillText('Background pan: new position every frame', 12, 20);
      ctx.fillText('Ball: new drawing every ' + hold + (hold === 1 ? ' frame' : ' frames'), 12, 38);

      // the face: held, only the mouth layer changes
      if (faceW) {
        var fx = sceneW, cx = fx + faceW / 2, cy = sceneH * 0.5, rr = Math.min(faceW, sceneH) * 0.3;
        ctx.fillStyle = '#171b26'; ctx.fillRect(fx, 0, faceW, sceneH);
        ctx.fillStyle = '#f1e2cf';
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2f3d';
        ctx.beginPath(); ctx.arc(cx, cy - rr * 0.35, rr * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
        ctx.fillStyle = '#1a1d27';
        ctx.beginPath(); ctx.ellipse(cx - rr * 0.36, cy - rr * 0.05, rr * 0.11, rr * 0.17, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + rr * 0.36, cy - rr * 0.05, rr * 0.11, rr * 0.17, 0, 0, Math.PI * 2); ctx.fill();
        var m = MOUTH[Math.floor(td * 8) % MOUTH.length];
        ctx.fillStyle = '#7a2b2b';
        ctx.beginPath();
        if (m === 0) { ctx.fillRect(cx - rr * 0.16, cy + rr * 0.42, rr * 0.32, 3); }
        else { ctx.ellipse(cx, cy + rr * 0.45, rr * 0.16, rr * (m === 1 ? 0.07 : 0.16), 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = era; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.strokeRect(cx - rr * 0.3, cy + rr * 0.25, rr * 0.6, rr * 0.42);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(244,241,234,.8)'; ctx.font = uiFont(12);
        ctx.fillText('口パク: only the mouth cel changes', fx + 12, 20);
      }

      // timing sheet: 24 frames = one second
      var y0 = sceneH, cw = W / 24;
      ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, y0, W, sheetH);
      var secStart = Math.floor(f / 24) * 24;
      for (var i = 0; i < 24; i++) {
        var fr = secStart + i;
        var drawingNo = Math.floor(fr / hold) % 99 + 1;
        var isNew = fr % hold === 0;
        var xx = i * cw;
        ctx.fillStyle = isNew ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.03)';
        ctx.fillRect(xx + 1, y0 + 16, cw - 2, sheetH - 22);
        if (fr === f) { ctx.strokeStyle = era; ctx.lineWidth = 2; ctx.strokeRect(xx + 1, y0 + 16, cw - 2, sheetH - 22); }
        ctx.fillStyle = isNew ? '#f4f1ea' : 'rgba(244,241,234,.35)';
        ctx.font = uiFont(Math.min(13, cw * 0.45), isNew ? 700 : 500);
        ctx.textAlign = 'center';
        ctx.fillText(isNew ? String(drawingNo) : '|', xx + cw / 2, y0 + 16 + (sheetH - 22) / 2 + 4);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(244,241,234,.6)'; ctx.font = uiFont(10.5, 700);
      ctx.fillText(W < 560 ? 'TIMING SHEET · 24 FRAMES = 1 SECOND' : 'TIMING SHEET · ONE SECOND = 24 FRAMES · NUMBERS = NEW DRAWINGS', 8, y0 + 11);
    }

    function loop(now) {
      if (!visible) { raf = 0; return; }
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      t += dt * speed;
      draw();
      raf = requestAnimationFrame(loop);
    }
    whenVisible(cv, function (on) {
      visible = on;
      if (reduce.matches) { draw(); return; }
      if (on && !raf) { last = 0; raf = requestAnimationFrame(loop); }
    });
    window.addEventListener('resize', function () { if (reduce.matches || !visible) draw(); });
    t = 0.35; draw();
  })();

  /* ---------- the view from the train window ---------- */
  (function celStack() {
    var box = $('[data-cels]');
    if (!box) return;
    var stack = $('.cels-stack', box);
    var range = $('#cel-explode');
    $$('[data-depth]').forEach(function (b, _, all) {
      b.addEventListener('click', function () {
        stack.dataset.mode = b.dataset.depth;
        all.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      });
    });
    if (range) range.addEventListener('input', function () { stack.style.setProperty('--x', range.value); });
    whenVisible(box, function (on) { box.classList.toggle('is-playing', on); });
  })();

  /* ---------- the Itano Circus ---------- */
  (function itano() {
    var cv = $('[data-itano]');
    if (!cv) return;
    var missiles = [], blasts = [], stars = [], visible = false, raf = 0, last = 0, fired = false;
    for (var i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random() * 0.8, r: Math.random() * 1.2 + 0.2 });

    function salvo(tx, ty) {
      var c = fitCanvas(cv), W = c.w, H = c.h;
      tx = tx == null ? W * (0.55 + Math.random() * 0.35) : tx;
      ty = ty == null ? H * (0.2 + Math.random() * 0.4) : ty;
      var n = 16;
      for (var k = 0; k < n; k++) {
        var sx = W * 0.06 + Math.random() * W * 0.05, sy = H * 0.92;
        missiles.push({
          sx: sx, sy: sy, tx: tx + (Math.random() - 0.5) * 50, ty: ty + (Math.random() - 0.5) * 40,
          c1x: sx + (Math.random() * 0.6 + 0.1) * W * 0.5, c1y: sy - Math.random() * H * 0.9,
          c2x: tx - (Math.random() - 0.3) * W * 0.4, c2y: ty + (Math.random() - 0.5) * H * 0.8,
          amp: 14 + Math.random() * 26, freq: 3 + Math.random() * 4, ph: Math.random() * Math.PI * 2,
          dur: 1.3 + Math.random() * 0.9, delay: k * 0.05 + Math.random() * 0.25, age: 0, trail: [], done: false
        });
      }
    }
    function bez(a, b, c, d, t) { var u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }
    function step(dt) {
      missiles.forEach(function (m) {
        m.age += dt;
        var t = (m.age - m.delay) / m.dur;
        if (t < 0) return;
        if (t >= 1 && !m.done) {
          m.done = true;
          blasts.push({ x: m.tx, y: m.ty, age: 0, rot: Math.random() * Math.PI });
        }
        if (!m.done) {
          var x = bez(m.sx, m.c1x, m.c2x, m.tx, t), y = bez(m.sy, m.c1y, m.c2y, m.ty, t);
          var dx = bez(m.sx, m.c1x, m.c2x, m.tx, Math.min(1, t + 0.01)) - x;
          var dy = bez(m.sy, m.c1y, m.c2y, m.ty, Math.min(1, t + 0.01)) - y;
          var len = Math.hypot(dx, dy) || 1;
          var wob = Math.sin(t * m.freq * Math.PI * 2 + m.ph) * m.amp * (1 - t);
          x += (-dy / len) * wob; y += (dx / len) * wob;
          m.trail.push({ x: x, y: y, age: 0 });
        }
        m.trail.forEach(function (p) { p.age += dt; });
        m.trail = m.trail.filter(function (p) { return p.age < 1.6; });
      });
      missiles = missiles.filter(function (m) { return !m.done || m.trail.length; });
      blasts.forEach(function (b) { b.age += dt; });
      blasts = blasts.filter(function (b) { return b.age < 0.6; });
    }
    function draw() {
      var c = fitCanvas(cv), ctx = c.ctx, W = c.w, H = c.h;
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#060912'); g.addColorStop(1, '#1a1f3a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      stars.forEach(function (s) { ctx.fillRect(s.x * W, s.y * H, s.r, s.r); });
      ctx.fillStyle = '#0a0c14';
      ctx.fillRect(0, H * 0.94, W, H * 0.06);
      missiles.forEach(function (m) {
        m.trail.forEach(function (p) {
          var a = Math.max(0, 0.5 - p.age * 0.32);
          ctx.fillStyle = 'rgba(225,228,240,' + a + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + p.age * 7, 0, Math.PI * 2); ctx.fill();
        });
        if (!m.done && m.trail.length) {
          var h = m.trail[m.trail.length - 1];
          ctx.fillStyle = '#fff7d6';
          ctx.beginPath(); ctx.arc(h.x, h.y, 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,190,90,.6)';
          ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, Math.PI * 2); ctx.fill();
        }
      });
      blasts.forEach(function (b) {
        var k = b.age / 0.6, R = 10 + k * 46;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        [['#fff6d8', 1], ['#ffcf4a', 0.75], ['#f05a28', 0.5]].forEach(function (layer) {
          ctx.fillStyle = layer[0]; ctx.globalAlpha = Math.max(0, 1 - k);
          ctx.beginPath();
          for (var i = 0; i < 14; i++) {
            var ang = i / 14 * Math.PI * 2, rad = (i % 2 ? 0.38 : 1) * R * layer[1];
            if (i === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad); else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
          }
          ctx.closePath(); ctx.fill();
        });
        ctx.restore(); ctx.globalAlpha = 1;
      });
      if (!missiles.length && !blasts.length) {
        ctx.fillStyle = 'rgba(244,241,234,.55)'; ctx.font = uiFont(13); ctx.textAlign = 'center';
        ctx.fillText('Tap or click anywhere in the sky', W / 2, H / 2); ctx.textAlign = 'left';
      }
    }
    function loop(now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      step(dt); draw();
      if (visible && (missiles.length || blasts.length)) raf = requestAnimationFrame(loop);
      else { raf = 0; last = 0; }
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }
    function fire(x, y) {
      salvo(x, y);
      if (reduce.matches) {
        // no animation: settle the salvo and show the finished trails
        for (var i = 0; i < 160; i++) step(0.016);
        draw();
      } else kick();
    }
    cv.addEventListener('click', function (e) {
      var r = cv.getBoundingClientRect();
      fire(e.clientX - r.left, e.clientY - r.top);
    });
    var btn = $('[data-itano-fire]');
    if (btn) btn.addEventListener('click', function () { fire(); });
    whenVisible(cv, function (on) {
      visible = on;
      if (on && !fired) { fired = true; fire(); }
      else if (on) kick();
    });
    draw();
  })();

  /* ---------- world map ---------- */
  (function worldMap() {
    var panel = $('[data-map-panel]');
    if (!panel) return;
    var data = {};
    try { data = JSON.parse($('#map-data').textContent); } catch (e) { return; }
    var pins = $$('[data-pin]'), chips = $$('[data-pin-chip]');
    function select(id, focusChip) {
      var d = data[id];
      if (!d) return;
      panel.style.setProperty('--era', d.c);
      $('[data-f="place"]', panel).textContent = d.place;
      $('[data-f="title"]', panel).textContent = d.title;
      $('[data-f="when"]', panel).textContent = d.when;
      $('[data-f="text"]', panel).innerHTML = d.text;
      pins.forEach(function (p) { p.setAttribute('aria-pressed', p.dataset.pin === id ? 'true' : 'false'); });
      chips.forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.pinChip === id ? 'true' : 'false'); });
    }
    pins.forEach(function (p) {
      p.addEventListener('click', function () { select(p.dataset.pin); });
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.dataset.pin); } });
    });
    chips.forEach(function (c) { c.addEventListener('click', function () { select(c.dataset.pinChip); }); });
  })();

  /* ---------- watch guide filters ---------- */
  (function watch() {
    var grid = $('[data-watch]');
    if (!grid) return;
    var cards = $$('.w', grid);
    var moods = new Set(), fmt = 'all', startOnly = false;
    var count = $('[data-watch-count]');
    var moodBtns = $$('[data-mood]'), fmtBtns = $$('[data-fmt]'), startBtn = $('[data-start]');
    function apply() {
      var n = 0;
      cards.forEach(function (c) {
        var cm = c.dataset.moods.split(' ');
        var okMood = !moods.size || cm.some(function (m) { return moods.has(m); });
        var okFmt = fmt === 'all' || c.dataset.fmt === fmt;
        var okStart = !startOnly || c.dataset.start === '1';
        var show = okMood && okFmt && okStart;
        c.hidden = !show;
        if (show) n++;
      });
      if (count) count.textContent = n === cards.length ? 'Showing all ' + n + ' works, oldest first.' : (n ? 'Showing ' + n + ' of ' + cards.length + ' works, oldest first.' : 'Nothing matches every filter. Try removing one.');
    }
    moodBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var m = b.dataset.mood;
        if (moods.has(m)) moods.delete(m); else moods.add(m);
        b.setAttribute('aria-pressed', moods.has(m) ? 'true' : 'false');
        apply();
      });
    });
    fmtBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        fmt = b.dataset.fmt;
        fmtBtns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        apply();
      });
    });
    if (startBtn) startBtn.addEventListener('click', function () {
      startOnly = !startOnly;
      startBtn.setAttribute('aria-pressed', startOnly ? 'true' : 'false');
      apply();
    });
  })();

  /* ---------- quiz ---------- */
  (function quiz() {
    var box = $('[data-quiz]');
    if (!box) return;
    var qs = [];
    try { qs = JSON.parse($('#quiz-data').textContent); } catch (e) { return; }
    var body = $('[data-quiz-body]', box), countEl = $('[data-quiz-count]', box), bar = $('[data-quiz-bar]', box), scoreEl = $('[data-quiz-score]', box);
    var i = 0, score = 0, answered = false;
    var names = { r0: 'Reel 00', r1: 'Reel 01', r2: 'Reel 02', r3: 'Reel 03', r4: 'Reel 04', r5: 'Reel 05', r6: 'Reel 06', r7: 'Reel 07', r8: 'Reel 08', r9: 'Reel 09', 'lab-frames': 'the Frame Lab', 'lab-grammar': 'the grammar of anime', 'lab-numbers': 'the numbers' };
    function render() {
      answered = false;
      var q = qs[i];
      countEl.textContent = 'Question ' + (i + 1) + ' of ' + qs.length;
      bar.style.width = (i / qs.length * 100) + '%';
      scoreEl.textContent = 'Score ' + score;
      body.innerHTML = '<p class="quiz-q">' + escapeHtml(q.q) + '</p><div class="quiz-opts" role="group" aria-label="Answers">' +
        q.o.map(function (o, k) { return '<button type="button" data-k="' + k + '"><b>' + 'ABCD'[k] + '</b><span>' + escapeHtml(o) + '</span></button>'; }).join('') +
        '</div><div data-quiz-after></div>';
      $$('[data-k]', body).forEach(function (b) { b.addEventListener('click', function () { answer(+b.dataset.k); }); });
    }
    function answer(k) {
      if (answered) return;
      answered = true;
      var q = qs[i];
      var right = k === q.a;
      if (right) score++;
      $$('[data-k]', body).forEach(function (b) {
        var kk = +b.dataset.k;
        b.disabled = true;
        if (kk === q.a) b.classList.add('right');
        else if (kk === k) b.classList.add('wrong');
      });
      scoreEl.textContent = 'Score ' + score;
      var after = $('[data-quiz-after]', body);
      after.innerHTML = '<div class="quiz-why"><b>' + (right ? 'Right. ' : 'Not quite. ') + '</b>' + escapeHtml(q.why) +
        (q.go ? ' <a href="#' + q.go + '">Revisit ' + (names[q.go] || 'the section') + '</a>.' : '') + '</div>' +
        '<div class="quiz-nav"><button type="button" class="btn btn--solid" data-next>' + (i < qs.length - 1 ? 'Next question' : 'See your score') + '</button></div>';
      var nx = $('[data-next]', after);
      nx.addEventListener('click', function () { i++; if (i < qs.length) render(); else done(); });
      nx.focus({ preventScroll: true });
    }
    function done() {
      bar.style.width = '100%';
      countEl.textContent = 'Finished';
      var msg = score === qs.length ? 'A perfect reel.' : score >= 7 ? 'You know this history well.' : score >= 4 ? 'A good start. The reels above have the rest.' : 'Worth another pass through the reels.';
      body.innerHTML = '<div class="quiz-done"><p class="label">Your score</p><p class="score">' + score + ' / ' + qs.length + '</p><p>' + msg + '</p><div class="quiz-nav" style="justify-content:center"><button type="button" class="btn" data-again>Try again</button></div></div>';
      store.set('dtm-quiz-best', String(Math.max(score, +(store.get('dtm-quiz-best') || 0))));
      $('[data-again]', body).addEventListener('click', function () { i = 0; score = 0; render(); });
    }
    render();
  })();
})();
