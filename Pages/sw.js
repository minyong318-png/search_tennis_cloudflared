/* =========================
   Service Worker 기본 수명주기
   ========================= */

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

/* =========================
   Push 알림 수신 (디버그용: 반드시 1개만!)
   ========================= */

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    // 1) payload 원문 확보 (JSON 실패해도 text로 남김)
    let rawText = "";
    if (event.data) {
      try {
        rawText = await event.data.text();
      } catch (e) {
        rawText = "(failed to read event.data.text())";
      }
    }

    // 2) title/body 추출 (JSON이면 JSON, 아니면 text)
    let title = "📩 PUSH RECEIVED (debug)";
    let body = `rawHead: ${rawText.slice(0, 160)}`;

    try {
      const data = rawText ? JSON.parse(rawText) : {};
      if (data?.title) title = String(data.title).trim();
      if (data?.body) body = `body: ${data.body}\n` + body;
    } catch (_) {
      // rawText가 JSON이 아니어도 그대로 진행
    }

    // 3) 서버에 "iPhone에서 push 받음" 핑 (best-effort)
    try {
      await fetch("/api/push/debug", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "sw",
        t: Date.now(),
        hasData: !!event.data,
        rawHead: rawText.slice(0, 200),
        }),
      });
    } catch (_) {}

    // 4) 알림 표시 (중복 억제 방지 위해 tag 유니크)
    await self.registration.showNotification(title, {
      body,
      tag: `debug-${Date.now()}`,
    });
  })());
});

/* =========================
   알림 클릭 처리 (1개만!)
   ========================= */

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification?.data?.url || "/";
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all && all.length) {
      // 열린 창 있으면 포커스 + 이동(가능한 경우)
      const client = all[0];
      if ("focus" in client) await client.focus();
      if ("navigate" in client) await client.navigate(url);
      return;
    }
    await self.clients.openWindow(url);
  })());
});
