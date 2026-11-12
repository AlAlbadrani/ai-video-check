import { detectFrame, summarize, DetectorError } from './detector.js';

export const DEFAULTS = {
  apiUser: '',
  apiSecret: '',
  autoScan: true,     // scan videos automatically when they start playing
  dailyCap: 30,       // max automatic scans per day (each scan = 1–3 API calls)
  framesPerScan: 3,
};

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Captured frames waiting to be analysed, keyed by id.
const frames = new Map();
let nextFrameId = 1;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(
    (result) => sendResponse({ ok: true, ...result }),
    (err) => sendResponse({ ok: false, code: err.code || 'ERROR', message: err.message || String(err) })
  );
  return true; // keep the channel open for the async response
});

async function handle(msg, sender) {
  switch (msg.type) {
    case 'capture':
      return { frameId: await captureFrame(msg, sender.tab) };
    case 'detect':
      return detectFrames(msg.frameIds);
    case 'reserveAutoScan':
      return reserveAutoScan();
    case 'usage':
      return getUsage();
    case 'testKey':
      return testKey();
    case 'openOptions':
      await chrome.runtime.openOptionsPage();
      return {};
    default:
      throw new DetectorError('UNKNOWN', `Unknown message: ${msg.type}`);
  }
}

// Screenshot the visible tab and crop it to the video's rectangle.
// Using a screenshot (not canvas.drawImage on the <video>) avoids
// cross-origin "tainted canvas" errors on sites like YouTube and TikTok.
async function captureFrame({ rect, viewportWidth }, tab) {
  if (!tab) throw new DetectorError('NO_TAB', 'No tab to capture.');
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 90 });
  } catch (e) {
    throw new DetectorError('CAPTURE', 'Could not capture the tab. Keep the video tab in front.');
  }
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = bitmap.width / viewportWidth;

  const sx = clamp(Math.round(rect.x * scale), 0, bitmap.width);
  const sy = clamp(Math.round(rect.y * scale), 0, bitmap.height);
  const sw = clamp(Math.round(rect.width * scale), 0, bitmap.width - sx);
  const sh = clamp(Math.round(rect.height * scale), 0, bitmap.height - sy);
  if (sw < 100 || sh < 100) {
    throw new DetectorError('NOT_VISIBLE', 'Scroll so the video is visible, then retry.');
  }

  const outW = Math.min(1024, sw);
  const outH = Math.round((sh * outW) / sw);
  const canvas = new OffscreenCanvas(outW, outH);
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });

  const id = nextFrameId++;
  frames.set(id, blob);
  // Don't let abandoned frames pile up.
  if (frames.size > 30) frames.delete(frames.keys().next().value);
  return id;
}

async function detectFrames(frameIds) {
  const settings = await getSettings();
  const blobs = frameIds.map((id) => frames.get(id)).filter(Boolean);
  frameIds.forEach((id) => frames.delete(id));

  const scores = [];
  for (const blob of blobs) {
    scores.push(await detectFrame(blob, settings)); // sequential: gentler on rate limits
  }
  await bumpUsage('apiCalls', scores.length);
  return { result: summarize(scores) };
}

async function reserveAutoScan() {
  const settings = await getSettings();
  if (!settings.autoScan) return { allowed: false, reason: 'off' };
  const usage = await getUsage();
  if (usage.autoScans >= settings.dailyCap) return { allowed: false, reason: 'cap' };
  await bumpUsage('autoScans', 1);
  return { allowed: true };
}

async function getUsage() {
  const { usage } = await chrome.storage.local.get('usage');
  if (!usage || usage.day !== todayKey()) return { day: todayKey(), autoScans: 0, apiCalls: 0 };
  return usage;
}

async function bumpUsage(field, n) {
  const usage = await getUsage();
  usage[field] = (usage[field] || 0) + n;
  await chrome.storage.local.set({ usage });
}

async function testKey() {
  const settings = await getSettings();
  const canvas = new OffscreenCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, '#3a7bd5');
  g.addColorStop(1, '#f4d03f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
  const score = await detectFrame(blob, settings);
  return { score };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
