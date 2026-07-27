// ponytail: minimal offline cache, network-first. Two rules earn their keep here; everything else
// is still deliberately not Workbox.
//
// 1. THE CACHE NAME IS VERSIONED AND OLD ONES ARE PURGED ON ACTIVATE. `anomaly-v1` was never
//    cleaned, so it accumulated every build ever served — three bundle generations and 53 entries
//    by the time it was looked at.
// 2. A NAVIGATION IS NEVER SERVED STALE WHILE ONLINE. index.html is the only file whose staleness
//    is dangerous, because it is what pins the content-hashed asset names: a cached shell from two
//    releases ago names an old bundle, that bundle is in the same cache, and the fallback path then
//    boots a COMPLETE old version of the game with no error and nothing to see but "nothing
//    deployed". GitHub Pages serves HTML with max-age=600, and a plain fetch() honours the HTTP
//    cache, so the network-first path could hand back a stale shell without any request leaving the
//    device. `cache: 'no-store'` on navigations is what makes network-first actually mean it.
//
// The offline fallback is unchanged: if the network genuinely fails, the cached shell is still
// better than a dead tab — it is just no longer allowed to win a race it should lose.
const CACHE = 'anomaly-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return
  // A navigate-mode Request cannot be copied (`new Request(req, {...})` throws on it), so the
  // no-store refetch goes by URL. Hashed assets keep the plain request — a content hash cannot go
  // stale by construction, so their HTTP cache hits are free and correct.
  const fresh = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
    : fetch(req)
  e.respondWith(
    fresh
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      })
      .catch(() => caches.match(req)),
  )
})
