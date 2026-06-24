self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch {}

    const title = data.title || "🎾 예약 가능 알림";
    const body = data.body || "예약 가능한 시간이 생겼습니다.";
    const url = data.url || "/";

    await self.registration.showNotification(title, {
      body,
      tag: data.tag || "tennis-alert",
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification?.data?.url || "/";
    const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    for (const client of clientsArr) {
      try {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      } catch (_) {}
    }
    await self.clients.openWindow(url);
  })());
});
