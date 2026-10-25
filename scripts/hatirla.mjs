// Zamanlanmış bildirimleri gönderir. GitHub Actions tarafından çalıştırılır.
// Turlar: h17 (17:00 hatırlatma), h20 (20:00 hatırlatma), week (pazar 19:00 haftalık özet), bd (08:00 doğum günü).
import admin from "firebase-admin";
import { buildMessages, buildWeekly, buildBirthdays, istanbulNow, slotFor } from "./hatirla-core.mjs";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error("FIREBASE_SERVICE_ACCOUNT tanımlı değil (README 7. adım)."); process.exit(1); }
let sa;
try { sa = JSON.parse(raw); } catch (e) { console.error("FIREBASE_SERVICE_ACCOUNT geçerli bir JSON değil."); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const SITE = (process.env.SITE_URL || "https://fen-b-odev.vercel.app").replace(/\/$/, "");

const { today, hour } = istanbulNow();
const forced = process.env.SLOT_OVERRIDE;
const slot = ["h17", "h20", "week", "bd"].includes(forced) ? forced : slotFor(hour);
console.log("Tarih:", today, "Saat:", hour, "Tur:", slot);

const needHw = slot === "h17" || slot === "h20" || slot === "week";
const [hwSnap, exSnap, userSnap, setSnap, bdSnap] = await Promise.all([
  needHw ? db.collection("homework").where("due", ">=", today).get() : null,
  needHw ? db.collection("exams").where("date", ">=", today).get() : null,
  db.collection("users").get(),
  db.doc("config/settings").get(),
  slot === "bd" ? db.collection("birthdays").get() : null
]);
const windowDays = setSnap.exists ? Number(setSnap.data().reminderDays) : undefined;
const homework = hwSnap ? hwSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
const exams = exSnap ? exSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
const birthdays = bdSnap ? bdSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

const users = [];
for (const d of userSnap.docs) {
  const data = d.data();
  if (!Array.isArray(data.tokens) || !data.tokens.length) continue;
  const done = needHw ? new Set((await db.collection("users").doc(d.id).collection("done").get()).docs.map((x) => x.id)) : new Set();
  users.push({ id: d.id, ...data, done });
}

const messages = slot === "week" ? buildWeekly({ users, homework, exams, today })
  : slot === "bd" ? buildBirthdays({ users, birthdays, today })
  : buildMessages({ users, homework, exams, today, slot, windowDays });
console.log("Bildirim alacak kişi:", messages.length);

let sent = 0, failed = 0;
for (const m of messages) {
  const res = await admin.messaging().sendEachForMulticast({
    tokens: m.tokens,
    notification: { title: m.title, body: m.body },
    webpush: {
      fcmOptions: { link: SITE + "/" },
      notification: Object.assign({ icon: SITE + "/icons/icon-192.png", badge: SITE + "/icons/icon-192.png" }, m.vib ? { vibrate: [200, 100, 200] } : {})
    }
  });
  sent += res.successCount; failed += res.failureCount;
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      console.log("Gönderilemedi:", m.userId, code);
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") dead.push(m.tokens[i]);
    }
  });
  if (dead.length) await db.collection("users").doc(m.userId).update({ tokens: admin.firestore.FieldValue.arrayRemove(...dead) });
}

// Yönetim ekranındaki "son hatırlatma" bilgisi sadece 17:00 ve 20:00 turlarını gösterir.
if (slot === "h17" || slot === "h20") {
  await db.collection("config").doc("lastReminder").set({
    at: Date.now(), slot, sent: messages.length, devices: sent, failed, undoneTotal: messages.reduce((a, m) => a + m.count, 0)
  });
}
console.log("Bitti. Gönderilen cihaz:", sent, "Başarısız:", failed);
