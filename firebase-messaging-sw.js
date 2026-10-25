// Servis çalışanı: (1) site kapalıyken bildirim gösterir, (2) site dosyalarını önbelleğe alıp internet kesilince açılmasını sağlar.
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAQ3uXeJFOYwUKQ6U8jgrW607kI6hLuPTM",
  authDomain: "fen-b-odev-takip.firebaseapp.com",
  projectId: "fen-b-odev-takip",
  storageBucket: "fen-b-odev-takip.firebasestorage.app",
  messagingSenderId: "335970227317",
  appId: "1:335970227317:web:a047c90202299c64b4143c"
});

// "notification" içeren mesajları Firebase kendisi gösterir.
firebase.messaging();

/* ---- Çevrimdışı açılış ---- */
var CACHE = "sinif-kabuk-v2";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var own = url.origin === self.location.origin;
  var sdk = url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0;
  if (!own && !sdk) return;
  if (own && url.pathname.indexOf("/api/") === 0) return;

  if (sdk) {
    // Sürümü adında olan Firebase dosyaları değişmez: önce önbellek.
    event.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
          return res;
        });
      })
    );
    return;
  }
  // Site dosyaları: önce ağ (hep güncel), ağ yoksa önbellek.
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match("./index.html"); });
    })
  );
});

/* ---- Bildirime dokunma ---- */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && (event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.fcmOptions && event.notification.data.FCM_MSG.fcmOptions.link)) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ("focus" in c) {
          return c.focus().then(function (w) { if (w && "navigate" in w && url !== "./") return w.navigate(url); }).catch(function () {});
        }
      }
      return clients.openWindow(url);
    })
  );
});
