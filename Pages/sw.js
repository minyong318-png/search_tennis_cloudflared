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
/*
self.addEventListener("push", event => {
  console.log("[SW] push fired", event);
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {console.log("[SW] payload parse fail", e);}
  

  const title = (data.title || "🎾 테니스 알림").trim();
  const body = data.body || "(test push: no payload)";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      //icon: "/icon.png",
      //badge: "/icon.png",
      //tag: "tennis-alert",
      //vibrate: [200, 100, 200],
      tag: `tennis-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
    }).then(() => console.log("[SW] showNotification OK"))
    .catch(err => console.error("[SW] showNotification FAILED", err))
  );
});
*/
self.addEventListener("push", (event) => {
  console.log("[SW] push fired", event);

  event.waitUntil((async () => {
    let title = "테스트 알림";
    let body = "";
    try {
      await fetch("https://yongin-tennis-worker.ccoo2000.workers.dev/api/push/debug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          t: Date.now(),
          hasData: !!event.data,
          text: event.data ? await event.data.text().catch(() => null) : null,
        }),
      });
    } catch (e) {}
    await self.registration.showNotification("DEBUG", { body: "push arrived" });
    
    if (event.data) {
      // 1) JSON이면 JSON으로
      try {
        const data = event.data.json();
        title = (data.title || title).trim();
        body = data.body || "";
      } catch (e) {
        // 2) JSON 아니면 text로
        body = await event.data.text();
      }
    } else {
      body = "(no payload)";
    }

    // ✅ 중복 억제 방지: tag를 매번 다르게
    await self.registration.showNotification(title, {
      body: body || "(empty)",
      tag: `debug-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
    });

    console.log("[SW] showNotification OK");
  })());
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
