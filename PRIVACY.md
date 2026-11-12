# Privacy Policy – AI Video Check

_Last updated: 12 November 2026_

AI Video Check is a browser extension that estimates whether a video on a web page is AI-generated. This policy explains what data it handles.

## What the extension processes
- **Video frames.** When a video is scanned, automatically or because you clicked the badge, the extension takes a screenshot of the visible tab, crops it to the video, and sends up to 5 still images per scan to **Sightengine** (sightengine.com) for analysis. The images are not stored by the extension after the analysis.
- **Nearby page text.** To spot platform labels such as "Altered or synthetic content", the extension reads text near the video on the page. This happens only in your browser and is never sent anywhere.
- **Your settings.** Your Sightengine API keys, scan settings and a daily scan counter are stored locally in your browser (chrome.storage.local). They are never sent to the developer.

## What the extension does not do
- It does not collect, store or transmit your browsing history, personal information, or account details.
- It does not send any data to the developer of the extension. There is no developer server, analytics or tracking.
- It does not sell or share data with anyone, apart from sending frames to Sightengine for the single purpose of analysis.

## Third party
Frames are sent to Sightengine with **your own API account**. Sightengine's handling of that data is covered by its privacy policy: https://sightengine.com/policies/privacy

## Your control
- Turn off automatic scanning in Settings to scan only when you click.
- Remove the extension to delete all locally stored data.

## Contact
Questions: open an issue in this project's GitHub repository.
