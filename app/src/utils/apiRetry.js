// app/src/utils/apiRetry.js
// Wraps a read-only (GET) fetch() call with a single silent retry.
//
// Why: Cloud Run functions "cold start" after a period of inactivity — the
// first call can be slow enough to time out even though the function is
// perfectly healthy. This retries once, quietly, before surfacing any error
// to the user, so a cold start feels like "loaded a little slower" instead
// of a scary "Network error" dialog.
//
// IMPORTANT: only use this for GET / read calls. Never wrap POST, PUT, or
// DELETE calls with this — if the first attempt actually succeeded but the
// response was just slow, retrying could fire the write a second time.

export async function fetchWithRetry(url, options = {}, retryDelayMs = 2000) {
  try {
    return await fetch(url, options);
  } catch (firstError) {
    // Network-level failure (timeout, connection dropped) — likely a cold
    // start. Wait briefly, then try one more time.
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return await fetch(url, options); // if this also fails, let it throw normally
  }
}