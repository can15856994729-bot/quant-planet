// 量化星球 Service Worker v1.1
const CACHE_NAME = "qp-cache-v1.1";

// 预缓存的关键页面
const PRECACHE_URLS = [
  "/",
  "/watchlist",
  "/strategies",
  "/signals",
  "/sim-trading",
  "/backtest",
  "/profile",
];

// 安装时预缓存
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {/* 忽略单个失败 */});
    })
  );
});

// 激活时清理旧缓存
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：优先网络，失败时回退缓存
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API 请求不缓存（始终走网络）
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 非同源请求不处理
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 缓存成功的 GET 响应
        if (event.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // 网络失败时从缓存读取
        return caches.match(event.request).then((cached) => {
          return cached || new Response("离线模式，请检查网络连接", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        });
      })
  );
});
