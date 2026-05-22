const CACHE_NAME = "unlimited-void-trigger-v6";

const SAME_ORIGIN_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./guides/gojo-gesture-guide.svg",
  "./guides/gojo-manga-reference.svg",
  "./icons/icon-any.svg",
  "./icons/icon-maskable.svg",
];

const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SAME_ORIGIN_ASSETS);

      await Promise.all(
        CDN_ASSETS.map(async (url) => {
          try {
            const request = new Request(url, { mode: "no-cors", cache: "reload" });
            const response = await fetch(request);
            await cache.put(request, response);
          } catch (error) {
            return null;
          }
          return null;
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, { ignoreSearch: true });

      try {
        const fresh = await fetch(event.request);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch (error) {
        if (cached) {
          return cached;
        }

        if (event.request.mode === "navigate") {
          return cache.match("./index.html");
        }

        throw error;
      }
    })()
  );
});
