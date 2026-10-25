// Vercel sunucu fonksiyonu: yöneticiye özel işler (duyuru bildirimi, hesap açma, şifre belirleme, hesap silme, hesap durumu).
// Gizli anahtar tarayıcıya hiç inmez. Vercel > Settings > Environment Variables içinde
// FIREBASE_SERVICE_ACCOUNT adıyla (Firebase'den indirilen JSON'un tamamı) tanımlanır.
const admin = require("firebase-admin");

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("NO_SA");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

const PERMS = ["ann", "sched", "info", "cal", "req", "mod", "topic"];
// Yöneticinin tanımladığı görev rolünü (config/roles) bulur; profile yazılacak alanları döndürür.
async function roleFields(db, roleId) {
  const id = String(roleId || "");
  if (!id) return {};
  const snap = await db.doc("config/roles").get();
  const r = snap.exists && snap.data().roles ? snap.data().roles[id] : null;
  if (!r) return null;
  return { roleId: id, roleName: String(r.name || "").slice(0, 30), perms: (Array.isArray(r.perms) ? r.perms : []).filter((x) => PERMS.indexOf(x) >= 0) };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEAD = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; }
}

async function announce(db, body, req) {
  if (!ID_RE.test(String(body.id || ""))) return [400, { error: "id" }];
  const ref = db.doc("announcements/" + body.id);
  const snap = await ref.get();
  if (!snap.exists) return [404, { error: "yok" }];
  const a = snap.data();
  if (a.pushedAt) return [200, { already: true, devices: 0, users: 0 }];

  const users = await db.collection("users").get();
  const owners = new Map(); // token -> kullanıcı kimliği
  const quiet = new Set(); // titreşimi kapatan kişilerin anahtarları
  users.forEach((d) => {
    const u = d.data();
    if (u.notify && u.notify.ann === false) return;
    (Array.isArray(u.tokens) ? u.tokens : []).forEach((t) => { if (t) { owners.set(t, d.id); if (u.notify && u.notify.vib === false) quiet.add(t); } });
  });
  // Titreşim isteyenler ve istemeyenler ayrı gruplar halinde gönderilir.
  const tokens = Array.from(owners.keys()).sort((a, b) => (quiet.has(a) ? 1 : 0) - (quiet.has(b) ? 1 : 0));

  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const site = (process.env.SITE_URL || (host ? "https://" + host : "")).replace(/\/$/, "");
  const title = (a.important ? "Önemli: " : "") + String(a.title || "Duyuru").slice(0, 80);
  const text = String(a.body || "").replace(/\s+/g, " ").slice(0, 140);
  const dead = new Map(); // kullanıcı -> ölü anahtarlar
  let ok = 0, fail = 0;

  const groups = [tokens.filter((t) => !quiet.has(t)), tokens.filter((t) => quiet.has(t))];
  const chunks = [];
  groups.forEach((g, gi) => { for (let i = 0; i < g.length; i += 500) chunks.push({ list: g.slice(i, i + 500), vib: gi === 0 }); });
  for (const ch of chunks) {
    const chunk = ch.list;
    const res = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title, body: text },
      webpush: {
        fcmOptions: site ? { link: site + "/#duyuru" } : undefined,
        notification: Object.assign(site ? { icon: site + "/icons/icon-192.png", badge: site + "/icons/icon-192.png" } : {}, ch.vib ? { vibrate: [200, 100, 200] } : {})
      }
    });
    ok += res.successCount; fail += res.failureCount;
    res.responses.forEach((r, k) => {
      if (!r.success && r.error && DEAD.includes(r.error.code)) {
        const uid = owners.get(chunk[k]);
        if (!dead.has(uid)) dead.set(uid, []);
        dead.get(uid).push(chunk[k]);
      }
    });
  }
  for (const [uid, list] of dead) {
    await db.doc("users/" + uid).update({ tokens: admin.firestore.FieldValue.arrayRemove(...list) }).catch(() => {});
  }
  await ref.update({ pushedAt: Date.now(), pushedDevices: ok });
  return [200, { devices: ok, failed: fail, users: new Set(owners.values()).size }];
}

async function setPassword(db, body, callerUid) {
  const uid = String(body.uid || ""), pass = String(body.password || "");
  if (!ID_RE.test(uid)) return [400, { error: "uid" }];
  if (pass.length < 6 || pass.length > 64 || /\s/.test(pass)) return [400, { error: "sifre" }];
  const prof = await db.doc("users/" + uid).get();
  if (!prof.exists) return [404, { error: "yok" }];
  await admin.auth().updateUser(uid, { password: pass });
  return [200, { ok: true }];
}

async function deleteUser(db, body, callerUid) {
  const uid = String(body.uid || "");
  if (!ID_RE.test(uid)) return [400, { error: "uid" }];
  if (uid === callerUid) return [400, { error: "kendin" }];
  try { await admin.auth().deleteUser(uid); }
  catch (e) { if (!e || e.code !== "auth/user-not-found") throw e; }
  await db.recursiveDelete(db.doc("users/" + uid));
  return [200, { ok: true }];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Giriş hesabını ve sınıf profilini tek adımda açar. Yarım kalmış hesap (giriş hesabı var, profil yok) varsa onarır.
async function createUser(db, body) {
  const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
  const pass = String(body.password || ""), role = body.role === "admin" ? "admin" : "student";
  const rf = role === "student" ? await roleFields(db, body.roleId) : {};
  if (rf === null) return [400, { error: "rol" }];
  if (!name || name.length > 40) return [400, { error: "ad" }];
  if (!EMAIL_RE.test(email) || email.length > 120) return [400, { error: "eposta" }];
  if (pass.length < 6 || pass.length > 64 || /\s/.test(pass)) return [400, { error: "sifre" }];

  let uid, repaired = false;
  try {
    uid = (await admin.auth().createUser({ email, password: pass, displayName: name })).uid;
  } catch (e) {
    if (e && e.code === "auth/email-already-exists") {
      const ex = await admin.auth().getUserByEmail(email);
      const prof = await db.doc("users/" + ex.uid).get();
      if (prof.exists) return [409, { error: "var" }];
      await admin.auth().updateUser(ex.uid, { password: pass, displayName: name, disabled: false });
      uid = ex.uid; repaired = true;
    } else if (e && (e.code === "auth/invalid-email" || e.code === "auth/invalid-password")) {
      return [400, { error: e.code === "auth/invalid-email" ? "eposta" : "sifre" }];
    } else throw e;
  }
  await db.doc("users/" + uid).set(Object.assign({
    name, email, role, createdAt: Date.now(), tokens: [], notify: { h17: true, h20: true, ann: true }
  }, rf));
  return [200, { uid, repaired }];
}

// Her profil için giriş hesabı var mı, en son ne zaman girmiş. Profili olmayan giriş hesaplarını da döndürür.
async function accountStatus(db) {
  const profs = await db.collection("users").get();
  const have = new Set(); profs.forEach((d) => have.add(d.id));
  const accounts = {}, orphans = [];
  let token;
  do {
    const page = await admin.auth().listUsers(1000, token);
    page.users.forEach((u) => {
      const last = u.metadata && u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : 0;
      if (have.has(u.uid)) accounts[u.uid] = { last: last || 0, disabled: !!u.disabled, email: u.email || "" };
      else orphans.push({ uid: u.uid, email: u.email || "", name: u.displayName || "", last: last || 0 });
    });
    token = page.pageToken;
  } while (token);
  return [200, { accounts, orphans }];
}

// Profili olmayan bir giriş hesabını sınıfa ekler.
async function adoptUser(db, body) {
  const uid = String(body.uid || "");
  if (!ID_RE.test(uid)) return [400, { error: "uid" }];
  const name = String(body.name || "").trim().slice(0, 40);
  let u;
  try { u = await admin.auth().getUser(uid); } catch (e) { return [404, { error: "yok" }]; }
  const exists = await db.doc("users/" + uid).get();
  if (exists.exists) return [409, { error: "var" }];
  const rf = await roleFields(db, body.roleId);
  if (rf === null) return [400, { error: "rol" }];
  const nm = name || u.displayName || String(u.email || "Öğrenci").split("@")[0].slice(0, 40);
  await db.doc("users/" + uid).set(Object.assign({
    name: nm, email: u.email || "", role: "student", createdAt: Date.now(), tokens: [], notify: { h17: true, h20: true, ann: true }
  }, rf));
  return [200, { uid }];
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const send = (code, obj) => res.status(code).json(obj);
  if (req.method !== "POST") return send(405, { error: "method" });
  try { init(); } catch (e) { return send(500, { error: "config" }); }

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return send(401, { error: "auth" });
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(m[1]); } catch (e) { return send(401, { error: "auth" }); }

  try {
    const db = admin.firestore();
    const me = await db.doc("users/" + decoded.uid).get();
    if (!me.exists) return send(403, { error: "forbidden" });
    const isAdm = me.data().role === "admin";
    const perms = Array.isArray(me.data().perms) ? me.data().perms : [];
    const body = readBody(req);
    // Duyuru bildirimi "duyuru" görevi olanlara da açıktır; diğer işlemler sadece yöneticiye.
    if (!isAdm && !(body.action === "announce" && perms.indexOf("ann") >= 0)) return send(403, { error: "forbidden" });
    let out;
    if (body.action === "announce") out = await announce(db, body, req);
    else if (body.action === "setPassword") out = await setPassword(db, body, decoded.uid);
    else if (body.action === "deleteUser") out = await deleteUser(db, body, decoded.uid);
    else if (body.action === "createUser") out = await createUser(db, body);
    else if (body.action === "accountStatus") out = await accountStatus(db);
    else if (body.action === "adoptUser") out = await adoptUser(db, body);
    else out = [400, { error: "action" }];
    return send(out[0], out[1]);
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    return send(500, { error: "server" });
  }
};
