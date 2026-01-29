self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  self.registration.showNotification(data.title || "🎾 알림", {
    body: data.body || "",
    icon: "/icon.png",
    vibrate: [200, 100, 200],
    tag: "tennis-alert"
  });
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      if (list && list.length) return list[0].focus();
      return clients.openWindow("/");
    })
  );
});

// 🔥 API 캐시 방지용 fetch 핸들러
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // API 요청은 Service Worker가 관여하지 않음
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 나머지 정적 리소스만 캐시 (선택)
  event.respondWith(
    caches.open("static-v1").then(cache =>
      cache.match(event.request).then(res =>
        res || fetch(event.request)
      )
    )
  );
});

