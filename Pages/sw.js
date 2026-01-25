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
