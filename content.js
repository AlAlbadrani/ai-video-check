// Finds videos on the page, shows a badge on each, and scans them.
(() => {
  const MIN_W = 240;
  const MIN_H = 160;
  const FRAME_GAP_MS = 1500;
  const AUTO_DELAY_MS = 1200; // let the video play a moment before auto-scanning

  // Labels platforms put on AI content. Specific phrases only, to avoid
  // flagging videos that merely talk about AI.
  const LABEL_PATTERNS = [
    /altered or synthetic content/i,        // YouTube
    /creator labell?ed as ai-generated/i,   // TikTok
    /\bai-generated\b/i,                    // TikTok / others (checked only near the video)
    /\bmade with ai\b/i,                    // Meta (older label)
    /\bai info\b/i,                         // Meta (Instagram / Facebook)
  ];

  let settings = { autoScan: true, framesPerScan: 3 };
  const tracked = new Map(); // video element -> state
  const resultCache = new Map(); // content key -> result (lives for this page)

  // ---------- settings ----------
  chrome.storage.local.get(['autoScan', 'framesPerScan']).then((s) => {
    settings = { ...settings, ...s };
  });
  chrome.storage.onChanged.addListener((changes) => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
  });

  // ---------- badge layer ----------
  const root = document.createElement('div');
  root.id = 'aivc-root';
  document.documentElement.appendChild(root);

  // Keep badges visible in fullscreen by moving the layer into the fullscreen element.
  document.addEventListener('fullscreenchange', () => {
    (document.fullscreenElement || document.documentElement).appendChild(root);
  });

  function makeBadge(st) {
    const el = document.createElement('button');
    el.className = 'aivc-badge';
    el.type = 'button';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (st.status === 'nokey') {
        chrome.runtime.sendMessage({ type: 'openOptions' });
      } else if (!st.busy) {
        scan(st, false);
      }
    });
    root.appendChild(el);
    return el;
  }

  function setBadge(st, status, text, title = '') {
    st.status = status;
    st.badge.dataset.status = status;
    st.badge.textContent = text;
    st.badge.title = title || text;
  }

  // ---------- tracking ----------
  function contentKey(video) {
    return `${location.href}|${video.currentSrc || video.src || ''}`;
  }

  function isBigEnough(rect) {
    return rect.width >= MIN_W && rect.height >= MIN_H;
  }

  function visibleRect(video) {
    const r = video.getBoundingClientRect();
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    const w = Math.min(window.innerWidth, r.right) - x;
    const h = Math.min(window.innerHeight, r.bottom) - y;
    return { full: r, x, y, width: Math.max(0, w), height: Math.max(0, h) };
  }

  function refresh() {
    for (const video of document.querySelectorAll('video')) {
      if (!tracked.has(video)) {
        const st = { video, key: null, status: 'idle', busy: false, autoTimer: null };
        st.badge = makeBadge(st);
        tracked.set(video, st);
      }
    }

    for (const [video, st] of tracked) {
      if (!video.isConnected) {
        st.badge.remove();
        clearTimeout(st.autoTimer);
        tracked.delete(video);
        continue;
      }

      // New content in the same element (YouTube/TikTok reuse <video> elements).
      const key = contentKey(video);
      if (key !== st.key) {
        st.key = key;
        st.busy = false;
        clearTimeout(st.autoTimer);
        st.autoTimer = null;
        const cached = resultCache.get(key);
        if (cached) showResult(st, cached);
        else setBadge(st, 'idle', 'Check for AI');
      }

      // Position the badge on the video's top-left corner.
      const vr = visibleRect(video);
      const show = isBigEnough(vr.full) && vr.width > 60 && vr.height > 40;
      st.badge.style.display = show ? '' : 'none';
      if (show) {
        st.badge.style.left = `${vr.x + 8}px`;
        st.badge.style.top = `${vr.y + 8}px`;
      }

      // Auto-scan once per piece of content while it's playing.
      const playing = !video.paused && !video.ended && video.readyState >= 2;
      if (show && playing && settings.autoScan && st.status === 'idle' && !st.busy && !st.autoTimer &&
          document.visibilityState === 'visible') {
        st.autoTimer = setTimeout(() => {
          st.autoTimer = null;
          if (!video.paused && st.status === 'idle') scan(st, true);
        }, AUTO_DELAY_MS);
      }
    }
  }

  setInterval(refresh, 400);
  window.addEventListener('scroll', refresh, { passive: true, capture: true });
  window.addEventListener('resize', refresh, { passive: true });

  // ---------- platform labels ----------
  function findPlatformLabel(video) {
    // YouTube shows its label in the watch-page metadata area.
    const ytAreas = document.querySelectorAll('ytd-watch-metadata, #description, ytd-reel-video-renderer[is-active]');
    for (const area of ytAreas) {
      const t = area.innerText || '';
      if (LABEL_PATTERNS[0].test(t)) return 'YouTube: "Altered or synthetic content"';
    }
    // Elsewhere: look only at containers close to the video (feeds have many videos).
    let node = video.parentElement;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      const t = node.innerText || '';
      if (t.length > 4000) break; // reached a page-level container
      for (const p of LABEL_PATTERNS) {
        const m = t.match(p);
        if (m) return `Platform label: "${m[0]}"`;
      }
    }
    return null;
  }

  // ---------- scanning ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  async function send(msg) {
    const res = await chrome.runtime.sendMessage(msg);
    if (!res) throw Object.assign(new Error('Extension not responding'), { code: 'ERROR' });
    if (!res.ok) throw Object.assign(new Error(res.message), { code: res.code });
    return res;
  }

  async function scan(st, auto) {
    if (st.busy) return;
    st.busy = true;
    const key = st.key;
    const video = st.video;

    try {
      const label = findPlatformLabel(video);
      if (label) {
        finish(st, key, { verdict: 'labeled', label });
        return;
      }

      if (auto) {
        const r = await send({ type: 'reserveAutoScan' });
        if (!r.allowed) {
          setBadge(st, 'idle', 'Check for AI',
            r.reason === 'cap' ? 'Daily auto-scan limit reached. Click to scan manually.' : 'Click to scan');
          st.status = 'paused-auto'; // don't retry auto for this content
          return;
        }
      }

      // A paused video gives identical frames, so one is enough.
      const n = video.paused ? 1 : Math.max(1, Math.min(5, settings.framesPerScan || 3));
      const frameIds = [];
      for (let i = 0; i < n; i++) {
        if (st.key !== key) return; // content changed mid-scan
        setBadge(st, 'scanning', `Checking… ${i + 1}/${n}`);
        const rect = visibleRect(video);
        root.style.visibility = 'hidden'; // keep badges out of the screenshot
        await nextPaint();
        let r;
        try {
          r = await send({
            type: 'capture',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            viewportWidth: window.innerWidth,
          });
        } finally {
          root.style.visibility = '';
        }
        frameIds.push(r.frameId);
        if (i < n - 1) await sleep(FRAME_GAP_MS);
      }

      setBadge(st, 'scanning', 'Analysing…');
      const { result } = await send({ type: 'detect', frameIds });
      if (st.key !== key) return;
      finish(st, key, result);
    } catch (e) {
      if (st.key !== key) return;
      if (e.code === 'NO_KEY' || e.code === 'BAD_KEY') {
        setBadge(st, 'nokey', 'Set API key', `${e.message} Click to open settings.`);
      } else {
        setBadge(st, 'error', 'Retry check', e.message);
      }
    } finally {
      st.busy = false;
    }
  }

  function finish(st, key, result) {
    resultCache.set(key, result);
    showResult(st, result);
  }

  function showResult(st, r) {
    if (r.verdict === 'labeled') {
      setBadge(st, 'labeled', 'AI (labeled)', r.label);
      return;
    }
    const pct = Math.round(r.mean * 100);
    const detail = `AI likelihood ${pct}% (frames: ${r.scores.map((s) => Math.round(s * 100) + '%').join(', ')}). ` +
      'Detectors can be wrong, especially on compressed video. Click to re-check.';
    if (r.verdict === 'ai') setBadge(st, 'ai', `Likely AI · ${pct}%`, detail);
    else if (r.verdict === 'real') setBadge(st, 'real', `Likely real · ${pct}%`, detail);
    else setBadge(st, 'uncertain', `Uncertain · ${pct}%`, detail);
  }
})();
