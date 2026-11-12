# AI Video Check (Chrome extension, v0.1)

Puts a badge on videos you watch (YouTube, TikTok, X, Instagram, news sites…) saying whether they're likely AI-generated.

## How it works
1. **Platform labels first (free):** if YouTube shows "Altered or synthetic content", or TikTok/Meta show an "AI-generated" / "AI info" label near the video, the badge says **AI (labeled)** without calling any API.
2. **Frame check:** otherwise it screenshots the video area 3 times, 1.5 s apart, and sends each frame to Sightengine's `genai` model.
3. **Verdict:** average score ≥ 70% (and no frame below 40%) → **Likely AI**. Average ≤ 30% (and no frame above 60%) → **Likely real**. Anything else → **Uncertain**. Hover the badge to see each frame's score.

Auto mode scans each video once when it starts playing, up to a daily limit (default 30 scans). You can also click the badge to scan.

## Setup
1. Make a free account at sightengine.com and copy your **API user** and **API secret**.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick this folder.
3. Click the extension icon, then **Settings**. Paste the keys and click **Test keys**.
4. Open a video and watch for the badge in the top-left corner.

## Files
- `detector.js`: the detection provider and verdict logic. It doesn't use any extension APIs, so the phone app or a backend can reuse it.
- `background.js`: takes the screenshots, crops them to the video, calls the detector, and tracks daily usage.
- `content.js` / `content.css`: finds videos, draws the badges, checks platform labels, runs auto-scan.
- `popup.*`, `options.*`, `ui.css`: the extension popup and settings page.

## Known limits
- The video tab has to be in front, because Chrome only screenshots the visible tab.
- Streamed video is compressed, so the detector will often answer "uncertain". Treat it as a hint.
- The API keys are stored in the extension. That's fine for personal testing, but before you publish, move the calls to a small backend so the keys aren't shipped to users. The phone app needs that backend anyway.
- Content Credentials (C2PA) aren't checked yet. Streaming sites usually strip them, so they matter more for uploaded files (phone app share-sheet).
