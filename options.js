const $ = (id) => document.getElementById(id);
const DEFAULTS = { apiUser: '', apiSecret: '', autoScan: true, dailyCap: 30, framesPerScan: 3 };

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  $('apiUser').value = s.apiUser;
  $('apiSecret').value = s.apiSecret;
  $('autoScan').checked = s.autoScan;
  $('dailyCap').value = s.dailyCap;
  $('framesPerScan').value = s.framesPerScan;
}

async function save() {
  const clampInt = (v, lo, hi, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  await chrome.storage.local.set({
    apiUser: $('apiUser').value.trim(),
    apiSecret: $('apiSecret').value.trim(),
    autoScan: $('autoScan').checked,
    dailyCap: clampInt($('dailyCap').value, 0, 1000, DEFAULTS.dailyCap),
    framesPerScan: clampInt($('framesPerScan').value, 1, 5, DEFAULTS.framesPerScan),
  });
  $('saved').textContent = 'Saved.';
  setTimeout(() => ($('saved').textContent = ''), 2000);
}

$('save').addEventListener('click', save);

$('test').addEventListener('click', async () => {
  await save();
  $('testResult').textContent = 'Testing…';
  const res = await chrome.runtime.sendMessage({ type: 'testKey' });
  $('testResult').textContent = res?.ok
    ? `Works. (Test image scored ${Math.round(res.score * 100)}% AI.)`
    : `Failed: ${res?.message || 'no response'}`;
});

load();
