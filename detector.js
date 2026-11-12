// Detection provider. Kept free of browser-extension APIs so the same file
// can be reused later by a backend or a phone app (React Native / Expo).

const SIGHTENGINE_ENDPOINT = 'https://api.sightengine.com/1.0/check.json';

export class DetectorError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Score one image (a video frame) with Sightengine's "genai" model.
 * Returns a number 0..1 — higher means more likely AI-generated.
 */
export async function detectFrame(blob, { apiUser, apiSecret }, fetchImpl = fetch) {
  if (!apiUser || !apiSecret) {
    throw new DetectorError('NO_KEY', 'Add your Sightengine API keys in Settings.');
  }
  const form = new FormData();
  form.append('media', blob, 'frame.jpg');
  form.append('models', 'genai');
  form.append('api_user', apiUser);
  form.append('api_secret', apiSecret);

  let res;
  try {
    res = await fetchImpl(SIGHTENGINE_ENDPOINT, { method: 'POST', body: form });
  } catch (e) {
    throw new DetectorError('NETWORK', 'Could not reach the detection service.');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new DetectorError('BAD_RESPONSE', `Detection service returned HTTP ${res.status}.`);
  }

  if (data.status !== 'success') {
    const msg = data.error?.message || `Detection failed (HTTP ${res.status}).`;
    const code = /credential|api_user|api_secret|auth/i.test(msg) ? 'BAD_KEY' : 'API';
    throw new DetectorError(code, msg);
  }

  const score = data.type?.ai_generated;
  if (typeof score !== 'number') {
    throw new DetectorError('BAD_RESPONSE', 'Response had no ai_generated score.');
  }
  return score;
}

/**
 * Combine per-frame scores into one verdict.
 * Deliberately conservative: only says "ai" or "real" when frames agree.
 */
export function summarize(scores) {
  if (!scores.length) throw new DetectorError('NO_FRAMES', 'No frames were analysed.');
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const min = Math.min(...scores);

  let verdict = 'uncertain';
  if (mean >= 0.7 && min >= 0.4) verdict = 'ai';
  else if (mean <= 0.3 && max < 0.6) verdict = 'real';

  return { verdict, mean, max, min, frames: scores.length, scores };
}
