// Service worker for Sõbrad -- audio-only offline caching.
//
// Scope, on purpose: this is NOT a full app-shell / offline-first service
// worker. It does not precache the JS/CSS bundles or the HTML, and it does
// not touch API requests -- login, the journal, and chat all need the
// FastAPI backend and are explicitly out of scope for offline use. Trying
// to make the whole app work offline would mean keeping a versioned
// precache list in sync with every build, which is more machinery than
// this small feature needs.
//
// What this DOES do: the Sleep feature (Insomnia.jsx) and the Breathing
// page loop ambient audio from /audio/insomnia-track.mp3,
// /audio/moss-on-glass.mp3, and /audio/sleep-sounds/*.mp3. Once a track has
// been fetched over the network (i.e. played once while online), we cache
// it so it can play again later with no connection. Cache-first: a cached
// track is served instantly and never re-fetched, which is fine here since
// these audio files are static and don't change after being added.
//
// If a track has never been played before while offline, the fetch below
// still fails (there's nothing to serve it from) -- that's expected, not a
// bug to work around.

const AUDIO_CACHE_NAME = 'sobrad-audio-v1';

self.addEventListener('install', (event) => {
  // No versioned app-shell precache to manage here, so just take over
  // as soon as possible instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Start controlling already-open pages immediately, without requiring
  // a reload, so audio caching kicks in right away.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/audio/')) {
    // Everything else -- API calls, navigation, JS/CSS -- passes through
    // untouched. Not calling respondWith() lets the browser handle it
    // exactly as if this service worker didn't exist.
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }

      // Not cached yet -- go to the network. If this rejects (offline and
      // never played before), let it surface as a normal failed fetch
      // rather than swallowing it into something harder to debug.
      const response = await fetch(request);
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })()
  );
});
