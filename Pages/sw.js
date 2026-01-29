/* =========================
   Service Worker 기본 수명주기
   ========================= */

self.addEventListener("install", event => {
  // 즉시 활성화 (iOS 중요)
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  // 모든 클라이언트 즉시 제어
  event.waitUntil(self.clients.claim());
});

/* =========================
   Push 알림 수신
   ========================= */

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const title = data.title || "🎾 테니스 알림";
  const body = data.body || "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: "tennis-alert",
      vibrate: [200, 100, 200],
      renotify: true
    })
  );
});

/* =========================
   알림 클릭 처리
   ========================= */

self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clientList => {
      // 이미 열린 창이 있으면 포커스
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      // 없으면 새 창 열기
      return self.clients.openWindow("/");
    })
  );
});
