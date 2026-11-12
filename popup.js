const $ = (id) => document.getElementById(id);

async function init() {
  const s = await chrome.storage.local.get(['apiUser', 'apiSecret', 'autoScan', 'dailyCap']);
  $('autoScan').checked = s.autoScan !== false;
  $('keyWarning').hidden = Boolean(s.apiUser && s.apiSecret);

  const res = await chrome.runtime.sendMessage({ type: 'usage' });
  if (res?.ok) {
    $('usage').textContent =
      `Today: ${res.autoScans} of ${s.dailyCap ?? 30} auto-scans used · ${res.apiCalls} frames analysed`;
  }
}

$('autoScan').addEventListener('change', (e) => chrome.storage.local.set({ autoScan: e.target.checked }));
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('setupLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
