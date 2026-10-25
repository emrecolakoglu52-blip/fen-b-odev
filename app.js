import { firebaseConfig, vapidKey } from "./firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  createUserWithEmailAndPassword, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, arrayUnion, arrayRemove,
  query, where, orderBy, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

/* ---------- Yardımcılar ---------- */
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
// Ders renkleri: her cihazda kişinin kendi seçtiği renk tonu (0-360).
let hueOv = {};
try { const o = JSON.parse(lsGet("odev-hues") || "{}"); if (o && typeof o === "object") hueOv = o; } catch (e) { hueOv = {}; }

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DOW = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const DAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum"];
const DAY_LONG = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];
const SUBJECTS = [
  { n: "Fizik", h: 215 }, { n: "Kimya", h: 28 }, { n: "Biyoloji", h: 140 },
  { n: "Matematik", h: 275 }, { n: "Türkçe", h: 350 }, { n: "İngilizce", h: 190 },
  { n: "Tarih", h: 48 }, { n: "Coğrafya", h: 95 }, { n: "Din Kültürü", h: 320 },
  { n: "Beden Eğitimi", h: 165 }, { n: "Görsel Sanatlar", h: 245 }, { n: "Diğer", h: 0 }
];
const DEFAULT_PERIODS = [
  { start: "08:30", end: "09:10" }, { start: "09:20", end: "10:00" }, { start: "10:10", end: "10:50" },
  { start: "11:00", end: "11:40" }, { start: "11:50", end: "12:30" }, { start: "13:15", end: "13:55" },
  { start: "14:05", end: "14:45" }, { start: "14:55", end: "15:35" }
];
const PHOTO_LIMIT = 170000;
const KEEP_DAYS = 45; // Bitişi bundan eski ödev/sınavlar listeye yüklenmez (kota tasarrufu); Yönetim > Bakım ile silinir.

const MONTHS_LONG = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

// Telefonun saati yanlışsa sunucu saatine göre düzeltilir (ödev süreleri ve kayıt zamanı doğru olsun).
let skew = 0;
const nowMs = () => Date.now() + skew;
const nowD = () => new Date(nowMs());
const pad = (n) => (n < 10 ? "0" : "") + n;
const dateStr = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const todayStr = () => dateStr(nowD());
const cutoffStr = () => { const d = nowD(); d.setDate(d.getDate() - KEEP_DAYS); return dateStr(d); };
const parts = (s) => { const a = String(s).split("-").map(Number); return { y: a[0], m: a[1], d: a[2] }; };
const dueEnd = (s) => { const p = parts(s); return new Date(p.y, p.m - 1, p.d, 23, 59, 59); };
function dayDiff(s) {
  const p = parts(s), due = new Date(p.y, p.m - 1, p.d), now = nowD();
  return Math.round((due - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
const isExpired = (s) => nowMs() > dueEnd(s).getTime();
const toMin = (t) => { const a = String(t).split(":").map(Number); return a[0] * 60 + (a[1] || 0); };
const subHue = (name) => {
  if (Object.prototype.hasOwnProperty.call(hueOv, name) && isFinite(Number(hueOv[name]))) return Number(hueOv[name]);
  for (const s of SUBJECTS) if (s.n === name) return s.h;
  return 0;
};
const addDays = (s, n) => { const p = parts(s), d = new Date(p.y, p.m - 1, p.d + n); return dateStr(d); };
const TRIAL_SUBJECTS = ["Matematik", "Fizik", "Kimya", "Biyoloji", "Türkçe", "Tarih", "Coğrafya", "İngilizce", "Din Kültürü"];
const splitItems = (s) => String(s || "").split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean).slice(0, 30);
const stripId = (o) => { const c = { ...o }; delete c.id; return c; };
function download(name, text, type) {
  const blob = new Blob([text], { type: type || "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function fmtDate(s) { const p = parts(s); return p.d + " " + MONTHS[p.m - 1]; }
function relDay(s) {
  const d = dayDiff(s);
  if (d === 0) return "bugün";
  if (d === 1) return "yarın";
  if (d === -1) return "dün";
  return d > 0 ? d + " gün sonra" : -d + " gün önce";
}

let toastTimer = null;
function toast(t) {
  const b = $("toast"); b.textContent = t; b.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { b.hidden = true; }, 3500);
}
function setMsg(id, text, good) {
  const m = $(id); m.textContent = text || ""; m.hidden = !text;
  m.classList.toggle("good", !!good);
}
function subjectChip(name) {
  const n = name || "Diğer";
  const c = el("span", "chip sub" + (n === "Diğer" ? " other" : ""), n);
  c.style.setProperty("--h", String(subHue(n)));
  return c;
}
function emptyBox(title, sub, btnText, btnFn) {
  const e = el("div", "empty");
  e.appendChild(el("strong", "", title));
  if (sub) e.appendChild(el("span", "", sub));
  if (btnText) { const b = el("button", "btn btn-quiet btn-small", btnText); b.type = "button"; b.addEventListener("click", btnFn); e.appendChild(b); }
  return e;
}
function fillSubjectSelect(id, withBlank) {
  const s = $(id); s.textContent = "";
  if (withBlank) { const o = el("option", "", withBlank); o.value = ""; s.appendChild(o); }
  SUBJECTS.forEach((x) => { const o = el("option", "", x.n); o.value = x.n; s.appendChild(o); });
}
function authMsg(e) {
  const c = e && e.code;
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-login-credentials") return "E-posta ya da şifre yanlış.";
  if (c === "auth/invalid-email") return "E-posta adresi geçerli görünmüyor.";
  if (c === "auth/too-many-requests") return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.";
  if (c === "auth/network-request-failed") return "İnternet bağlantısı yok gibi görünüyor.";
  if (c === "auth/weak-password") return "Şifre en az 6 karakter olmalı.";
  if (c === "auth/operation-not-allowed") return "Firebase'de E-posta/Şifre girişi açık değil. README 2. adım.";
  if (c === "auth/email-already-in-use") return "Bu e-posta zaten kayıtlı.";
  return "Bir sorun oluştu. Biraz sonra tekrar dene.";
}

/* Yönetici işlemleri için Vercel fonksiyonu (/api/admin). Kimliği, giriş jetonuyla doğrular. */
async function api(action, payload) {
  const t = await auth.currentUser.getIdToken();
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
    body: JSON.stringify({ action, ...payload })
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error(j.error || "api"); e.status = r.status; e.code = j.error || "api"; throw e; }
  return j;
}
function apiMsg(e) {
  if (e && (e.status === 404 || e.status === 405)) return "Sunucu fonksiyonu kurulu değil (README 9. adım).";
  if (e && e.code === "config") return "Vercel'de FIREBASE_SERVICE_ACCOUNT tanımlı değil (README 9. adım).";
  if (e && (e.status === 401 || e.status === 403)) return "Bu işlem için yönetici girişi gerekli. Çıkıp tekrar gir.";
  if (e && e.status === 400) return "Girilen bilgi geçersiz.";
  return "Sunucuya ulaşılamadı. Biraz sonra tekrar dene.";
}

/* ---------- Durum ---------- */
const S = {
  user: null, profile: null, isAdmin: false,
  hw: [], ex: [], ann: [], annErr: "", annNew: 0, done: new Set(), users: [], last: null, pwFor: "", pwDraft: "", pwShown: null,
  grades: [], gErr: "", gTerm: "1", gOpen: new Set(), ev: [], evErr: "", notes: [], ntErr: "", ntShown: new Set(), ntF: { q: "", sub: "all" }, logs: [],
  calY: new Date().getFullYear(), calM: new Date().getMonth(), calSel: "", reminderDays: 3, canAdd: true,
  acct: null, acctErr: "", acctBusy: false, acctLoaded: false, orphans: [],
  sched: { periods: [], cells: {} }, draft: null, dirty: false, cellSel: null,
  view: "today", admTab: "users", schMode: "day", schDay: 1, schSel: "",
  hwTab: "active", exTab: "up", err: "",
  hwF: { q: "", sub: "all", undone: false, week: false, sort: "date" },
  exF: { sub: "all" },
  hwLoaded: false, exLoaded: false,
  // Yeni bölümler
  stepsDone: {}, prog: {}, topOpen: new Set(), study: {}, trials: [], trErr: "", trSub: "all",
  qa: [], qaErr: "", qaF: { sub: "all", open: false }, polls: [], pollErr: "", votes: {},
  bd: [], info: { rules: [], links: [], duty: [], dutyStart: "" }, infoDirty: false, trash: [],
  cm: {}, cmOpen: new Set(), drafts: {}, ntTop: false, cmp: null
};
let app = null, auth = null, db = null, messaging = null;
let profUnsub = null, dataUnsubs = [];
let editingHw = null, editingHwObj = null, editingEx = null, photoData = "", photoMode = "none", photoBusy = false;
const photoCache = new Map(); // ödev kimliği -> fotoğraf (bu oturumda bir kez indirilir)
const noteCache = new Map(); // ders notu kimliği -> fotoğraf listesi
let armedId = null, armTimer = null;
const live = new Map(); // dinamik dinleyiciler: yorumlar, yanıtlar, oylar (anahtar -> iptal işlevi)

/* Kişi bir kutuya yazarken liste yeniden çizilirse yazdığı kaybolmasın: çizim, kutudan çıkınca yapılır. */
const lateFns = {};
function typingIn(id) {
  const box = $(id), a = document.activeElement;
  // Sadece yazı yazılan kutular sayılır; onay kutusuna dokununca liste hemen güncellenmeli.
  const typed = a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|file)$/i.test(a.type)));
  return !!(box && a && box.contains(a) && typed);
}
function deferIfTyping(id, fn) { if (typingIn(id)) { lateFns[id] = fn; return true; } return false; }
document.addEventListener("focusout", () => {
  setTimeout(() => {
    Object.keys(lateFns).forEach((id) => { if (!typingIn(id)) { const f = lateFns[id]; delete lateFns[id]; f(); } });
  }, 60);
});

/* Kayıt geçmişi: her ekleme, düzenleme ve silme aynı toplu yazmaya bir satır ekler (sadece yönetici okur). */
function addLog(b, type, kind, title) {
  b.set(doc(collection(db, "logs")), { type, kind, title: String(title || "").slice(0, 80), by: S.profile.name, uid: S.user.uid, at: nowMs() });
}
async function checkClock() {
  try {
    const t0 = Date.now();
    const r = await fetch(location.pathname + "?_=" + t0, { method: "HEAD", cache: "no-store" });
    const t1 = Date.now(), d = r.headers.get("date"), srv = d ? Date.parse(d) : 0;
    if (!srv) return;
    const off = srv - (t0 + t1) / 2;
    skew = Math.abs(off) >= 120000 ? Math.round(off) : 0;
  } catch (e) { return; }
  const n = $("clock-note");
  if (skew) {
    const m = Math.max(1, Math.round(Math.abs(skew) / 60000));
    n.textContent = "Telefonunun saati yaklaşık " + (m >= 120 ? Math.round(m / 60) + " saat" : m + " dakika") + (skew > 0 ? " geride" : " ileride") + ". Ödev süreleri düzeltilmiş saate göre gösteriliyor. Telefonunda saati “otomatik” yapmanı öneririz.";
    n.hidden = false;
  } else n.hidden = true;
  if (S.profile) renderAll();
}

function show(screen) {
  ["boot", "login", "register", "pending", "noaccess", "maint", "app"].forEach((id) => { $(id).hidden = id !== screen; });
  $("nav").hidden = screen !== "app";
  if (screen !== "app" && $("welcome")) $("welcome").hidden = true;
  renderAiFab();
}
// Görev rolleri: yönetici her göreve sahiptir; diğerleri profilindeki "perms" listesine göre.
const myPerms = () => (S.profile && Array.isArray(S.profile.perms) ? S.profile.perms : []);
const can = (p) => !!S.isAdmin || myPerms().indexOf(p) >= 0;
const admAccess = () => can("sched") || can("cal") || can("req");
const canModify = (x) => can("mod") || (S.user && x.uid === S.user.uid);

/* ---------- Giriş / oturum ---------- */
function boot() {
  const bad = !firebaseConfig || !firebaseConfig.apiKey || String(firebaseConfig.apiKey).indexOf("BURAYA") === 0;
  if (bad) { $("boot-msg").textContent = "Firebase ayarı girilmemiş. README dosyasındaki adımları yap."; return; }
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Yerel önbellek: aynı veriyi tekrar tekrar indirmez (kota tasarrufu) ve internet kesilince son hali gösterir.
    try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
    catch (e) { db = getFirestore(app); }
  } catch (e) { $("boot-msg").textContent = "Başlatılamadı: " + (e && e.message ? e.message : e); return; }
  // Servis çalışanı: bildirimler ve çevrimdışı açılış için.
  try { if ("serviceWorker" in navigator) navigator.serviceWorker.register("./firebase-messaging-sw.js").catch(() => {}); } catch (e) {}
  onAuthStateChanged(auth, onAuth, () => { show("login"); });
  loadRegOpen();
  checkClock();
}

function stopData() {
  dataUnsubs.forEach((u) => { try { u(); } catch (e) {} }); dataUnsubs = [];
  live.forEach((u) => { try { u(); } catch (e) {} }); live.clear();
}
function resetState() {
  S.stepsDone = {}; S.prog = {}; S.topOpen = new Set(); S.study = {}; S.trials = []; S.trErr = ""; S.trSub = "all";
  S.qa = []; S.qaErr = ""; S.polls = []; S.pollErr = ""; S.votes = {}; S.bd = []; S.trash = []; S.asks = []; S.fb = []; S.misses = [];
  S.info = { rules: [], links: [], duty: [], dutyStart: "" }; S.infoDirty = false;
  S.cm = {}; S.cmOpen = new Set(); S.drafts = {};
  try { stReset(); } catch (e) {}
  S.hw = []; S.ex = []; S.ann = []; S.annErr = ""; S.done = new Set(); S.users = []; S.last = null; S.err = "";
  S.grades = []; S.gErr = ""; S.gOpen = new Set(); S.ev = []; S.evErr = ""; S.notes = []; S.ntErr = ""; S.ntShown = new Set(); S.logs = []; noteCache.clear();
  S.acct = null; S.acctErr = ""; S.acctBusy = false; S.acctLoaded = false; S.orphans = []; S.canAdd = true;
  S.pwFor = ""; S.pwDraft = ""; S.pwShown = null; photoCache.clear();
  S.sched = { periods: [], cells: {} }; S.draft = null; S.dirty = false; S.cellSel = null;
  S.hwLoaded = false; S.exLoaded = false; S.profile = null; S.isAdmin = false;
  S.reqs = []; S.myReq = null; S.regEdit = false;
  S.roles = {}; S.roleEdit = ""; S.reqRole = {}; S.permKey = ""; S.topics = {}; S.wrong = []; S.plan = {}; S.decks = []; S.qaDraft = {}; S.doneAt = {};
  S.qzList = []; S.qz = { phase: "setup", quiz: null, i: 0, picks: [], busy: false };
  S.gd = { msgs: [], busy: false, seen: {}, openLen: 0 };
  S.ai = { msgs: [], busy: false, img: "" }; try { $("ai-prev").hidden = true; $("gd-panel").hidden = true; $("gd-tip").hidden = true; $("nc-panel").hidden = true; S.nc = null; } catch (e) {}
  try { closeAi(); $("ai-log").textContent = ""; } catch (e) {}
}

async function onAuth(user) {
  if (profUnsub) { profUnsub(); profUnsub = null; }
  if (reqUnsub) { reqUnsub(); reqUnsub = null; }
  stopData(); resetState();
  if (!user) { S.user = null; show("login"); loadRegOpen(); return; }
  if (user.isAnonymous) { try { await signOut(auth); } catch (e) {} return; }
  S.user = user;
  show("boot"); $("boot-msg").textContent = "Hesabın kontrol ediliyor…";
  profUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) {
      stopData(); S.profile = null;
      watchMyReq(user);
      return;
    }
    if (reqUnsub) { reqUnsub(); reqUnsub = null; }
    const prof = snap.data();
    const wasAdmin = S.isAdmin, had = !!S.profile;
    const pk = (Array.isArray(prof.perms) ? prof.perms.slice().sort() : []).join(",");
    S.profile = prof; S.isAdmin = prof.role === "admin";
    const permChanged = had && pk !== S.permKey; S.permKey = pk;
    if (!had || wasAdmin !== S.isAdmin || permChanged) { stopData(); startData(); }
    show("app"); renderMaint();
    if (!had) setView(location.hash === "#duyuru" ? "ann" : "today");
    renderChrome(); renderAll();
    if (!had) { postLogin(); maybeWelcome(); }
  }, (e) => {
    $("na-msg").textContent = e && e.code === "permission-denied"
      ? "Profil okunamadı. Güvenlik kurallarının yayınlandığından emin ol (README 1. adım)."
      : "Bağlantı sorunu. Sayfayı yenile.";
    show("noaccess");
  });
}

function startData() {
  const uid = S.user.uid;
  const add = (u) => dataUnsubs.push(u);
  const cut = cutoffStr();
  add(onSnapshot(query(collection(db, "homework"), where("due", ">=", cut)), (s) => { S.hw = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.hwLoaded = true; S.err = ""; renderAll(); }, dataErr));
  add(onSnapshot(query(collection(db, "exams"), where("date", ">=", cut)), (s) => { S.ex = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.exLoaded = true; renderAll(); }, dataErr));
  // Duyuru okunamazsa (kurallar henüz güncellenmediyse) ödev listesi bozulmasın diye ayrı hata yönetimi.
  add(onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(40)), (s) => {
    S.ann = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.annErr = "";
    if (S.view === "ann") markAnnSeen();
    renderAnn(); renderBadges();
  }, (e) => {
    console.error(e);
    S.annErr = e && e.code === "permission-denied" ? "Duyurular okunamadı. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Bağlantı sorunu. Sayfayı yenile.";
    renderAnn();
  }));
  add(onSnapshot(query(collection(db, "users", uid, "quiz"), orderBy("at", "desc"), limit(60)), (s) => { S.qzList = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderQuizStats(); renderQuizSugg(); renderMobiSuggest(); }, () => {}));
  add(onSnapshot(collection(db, "users", uid, "done"), (s) => { S.done = new Set(s.docs.map((d) => d.id)); S.doneAt = {}; s.docs.forEach((d) => { S.doneAt[d.id] = Number(d.data().at) || 0; }); renderAll(); }, dataErr));
  // Yeni bölümler ayrı hata yönetimiyle: kurallar henüz güncellenmediyse ödev listesi bozulmasın.
  const soft = (key, label) => (e) => {
    console.error(e);
    S[key] = e && e.code === "permission-denied" ? label + " okunamadı. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Bağlantı sorunu. Sayfayı yenile.";
    renderAll();
  };
  // Etkinlikler uzun sürebilir (yaz tatili gibi): bu yüzden başlangıcı 400 güne kadar eski olanlar da yüklenir.
  const cutLong = dateStr(new Date(nowMs() - 400 * 86400000));
  add(onSnapshot(query(collection(db, "events"), where("date", ">=", cutLong)), (s) => { S.ev = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.evErr = ""; renderCal(); renderBadges(); renderToday(); }, soft("evErr", "Etkinlikler")));
  // Kişiye özel ilerleme kayıtları
  add(onSnapshot(collection(db, "users", uid, "steps"), (s) => { S.stepsDone = {}; s.docs.forEach((d) => { S.stepsDone[d.id] = Array.isArray(d.data().done) ? d.data().done : []; }); renderHw(); renderToday(); }, () => {}));
  add(onSnapshot(collection(db, "users", uid, "prog"), (s) => { S.prog = {}; s.docs.forEach((d) => { S.prog[d.id] = Array.isArray(d.data().done) ? d.data().done : []; }); renderEx(); }, () => {}));
  add(onSnapshot(query(collection(db, "users", uid, "study"), where("d", ">=", dateStr(new Date(nowMs() - 70 * 86400000)))), (s) => { S.study = {}; s.docs.forEach((d) => { const v = d.data(); S.study[d.id] = { min: Number(v.min) || 0, by: v.by && typeof v.by === "object" ? v.by : {} }; }); renderStudy(); renderToday(); }, () => {}));
  add(onSnapshot(collection(db, "users", uid, "trials"), (s) => { S.trials = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.trErr = ""; renderTrials(); }, soft("trErr", "Deneme sonuçların")));
  // Sınıf içi bölümler
  add(onSnapshot(query(collection(db, "qa"), orderBy("createdAt", "desc"), limit(40)), (s) => { S.qa = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.qaErr = ""; renderQa(); }, soft("qaErr", "Soru köşesi")));
  add(onSnapshot(query(collection(db, "polls"), orderBy("createdAt", "desc"), limit(15)), (s) => {
    S.polls = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.pollErr = "";
    syncVoteListeners(); renderPolls();
  }, soft("pollErr", "Anketler")));
  add(onSnapshot(collection(db, "birthdays"), (s) => { S.bd = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderInfo(); renderCal(); renderToday(); syncBirthday(); }, () => {}));
  add(onSnapshot(doc(db, "config", "info"), (s) => {
    const d = s.exists() ? s.data() : {};
    S.info = { rules: Array.isArray(d.rules) ? d.rules : [], links: Array.isArray(d.links) ? d.links : [], duty: Array.isArray(d.duty) ? d.duty : [], dutyStart: d.dutyStart || "" };
    renderInfo(); renderToday();
  }, () => {}));
  add(onSnapshot(query(collection(db, "notes"), orderBy("createdAt", "desc"), limit(60)), (s) => { S.notes = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.ntErr = ""; renderNotes(); }, soft("ntErr", "Ders notları")));
  add(onSnapshot(collection(db, "users", uid, "grades"), (s) => { S.grades = s.docs.map((d) => ({ ...d.data(), id: d.id })); S.gErr = ""; renderGrades(); renderEx(); }, soft("gErr", "Notların")));
  add(onSnapshot(doc(db, "config", "settings"), (s) => {
    const n = Number(s.exists() ? s.data().reminderDays : 3);
    S.reminderDays = [1, 2, 3, 5, 7].indexOf(n) >= 0 ? n : 3;
    $("rem-days").textContent = String(S.reminderDays); $("m-days").value = String(S.reminderDays);
    S.aiOn = !s.exists() || s.data().aiOn !== false; $("m-ai").checked = S.aiOn; renderAiFab();
    renderHw();
  }, () => {}));
  add(onSnapshot(query(collection(db, "users", uid, "wrong"), orderBy("due"), limit(100)), (s) => { S.wrong = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderWrongBox(); renderMobiSuggest(); renderWeek(); }, () => {}));
  add(onSnapshot(collection(db, "users", uid, "plan"), (s) => { S.plan = {}; s.docs.forEach((d) => { const v = d.data(); S.plan[d.id] = new Set(Array.isArray(v.done) ? v.done : []); }); renderMobiSuggest(); if (!$("pl-panel").hidden) renderPlan(); }, () => {}));
  add(onSnapshot(query(collection(db, "decks"), orderBy("createdAt", "desc"), limit(30)), (s) => { S.decks = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderDecks(); }, () => {}));
  add(onSnapshot(doc(db, "config", "topics"), (s) => { S.topics = s.exists() && s.data().topics ? s.data().topics : {}; renderTopics(); renderMobiSuggest(); }, () => {}));
  add(onSnapshot(doc(db, "config", "schedule"), (s) => {
    const d = s.exists() ? s.data() : {};
    S.sched = { periods: Array.isArray(d.periods) ? d.periods : [], cells: d.cells && typeof d.cells === "object" ? d.cells : {} };
    if (!S.dirty) S.draft = JSON.parse(JSON.stringify(S.sched));
    renderSch(); renderAdmSch(); renderGrades(); renderToday();
  }, dataErr));
  add(onSnapshot(doc(db, "config", "public"), (s) => { setMaint(s.exists() ? s.data() : {}); renderMaint(); }, () => {}));
  add(onSnapshot(query(collection(db, "asks"), orderBy("createdAt", "desc"), limit(60)), (s) => { S.asks = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderAsks(); }, () => {}));
  add(onSnapshot(query(collection(db, "users", uid, "misses"), orderBy("at", "desc"), limit(30)), (s) => { S.misses = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderMobiSuggest(); }, () => {}));
  if (can("req")) {
    add(onSnapshot(collection(db, "requests"), (s) => { S.reqs = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderReqs(); }, () => {}));
    add(onSnapshot(doc(db, "config", "public"), (s) => { S.regOpen = !s.exists() || s.data().regOpen !== false; renderReqs(); }, () => {}));
  }
  if (S.isAdmin) {
    add(onSnapshot(collection(db, "users"), (s) => { S.users = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderAdmUsers(); }, dataErr));
    add(onSnapshot(doc(db, "config", "roles"), (s) => { S.roles = s.exists() && s.data().roles ? s.data().roles : {}; renderRoles(); renderAdmUsers(); renderReqs(); }, () => {}));
    add(onSnapshot(doc(db, "config", "lastReminder"), (s) => { S.last = s.exists() ? s.data() : null; renderLast(); }, () => {}));
    add(onSnapshot(query(collection(db, "logs"), orderBy("at", "desc"), limit(100)), (s) => { S.logs = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderLogs(); }, () => {}));
    add(onSnapshot(query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(100)), (s) => { S.fb = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderFb(); }, () => {}));
    add(onSnapshot(query(collection(db, "trash"), orderBy("at", "desc"), limit(100)), (s) => { S.trash = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderTrash(); }, () => {}));
  }
}
function dataErr(e) {
  console.error(e);
  S.err = e && e.code === "permission-denied"
    ? "Okuma izni yok. Güvenlik kurallarının yayınlandığından emin ol."
    : "Bağlantı sorunu. Sayfayı yenile.";
  S.hwLoaded = true; S.exLoaded = true;
  renderAll();
}

$("login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("l-email").value.trim().toLowerCase(), pass = $("l-pass").value;
  if (!email || !pass) { setMsg("l-msg", "E-posta ve şifreyi yaz."); return; }
  setMsg("l-msg", ""); $("l-go").disabled = true; $("l-go").textContent = "Giriş yapılıyor…";
  try {
    try { await signInWithEmailAndPassword(auth, email, pass); }
    catch (e) {
      if (pass !== pass.trim() && e && String(e.code).indexOf("auth/invalid") === 0) await signInWithEmailAndPassword(auth, email, pass.trim());
      else throw e;
    }
  } catch (e) {
    const c = e && e.code;
    setMsg("l-msg", c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found"
      ? "E-posta ya da şifre yanlış. “Şifreyi göster”i işaretleyip kontrol et. Düzelmezse yöneticine yaz."
      : authMsg(e));
  }
  $("l-go").disabled = false; $("l-go").textContent = "Giriş yap";
});
$("l-show").addEventListener("change", function () { $("l-pass").type = this.checked ? "text" : "password"; });
$("l-forgot").addEventListener("click", async () => {
  const email = $("l-email").value.trim();
  if (!email) { setMsg("l-msg", "Önce e-posta adresini yaz, sonra tekrar bas."); return; }
  try { await sendPasswordResetEmail(auth, email); setMsg("l-msg", "Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelmezse yöneticine yaz.", true); }
  catch (e) { setMsg("l-msg", authMsg(e)); }
});
const doLogout = async () => {
  // Çıkarken bu cihazın bildirim anahtarını hesaptan kaldır; yoksa aynı telefonu kullanan bir sonraki kişi
  // önceki kişinin bildirimlerini görmeye devam eder.
  const t = lsGet("odev-fcm");
  if (t && S.user && db) {
    try { await Promise.race([updateDoc(doc(db, "users", S.user.uid), { tokens: arrayRemove(t) }), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
    try { await Promise.race([deleteToken(messaging || getMessaging(app)), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
    lsSet("odev-fcm", null);
  }
  try { await signOut(auth); } catch (e) {}
};
$("logout").addEventListener("click", doLogout);
$("logout-top").addEventListener("click", doLogout);
$("na-out").addEventListener("click", doLogout);


/* ---------- Kayıt başvurusu ---------- */
let reqUnsub = null;
S.regOpen = true; S.regBusy = false; // oturum değişince sıfırlanmaz: kayıt sırasında ara ekran görünmesin
function fillDM(dId, mId) {
  const d = $(dId), m = $(mId);
  [d, m].forEach((x) => { x.textContent = ""; const o = el("option", "", "Seç"); o.value = ""; x.appendChild(o); });
  for (let i = 1; i <= 31; i++) { const o = el("option", "", String(i)); o.value = String(i); d.appendChild(o); }
  MONTHS_LONG.forEach((t, i) => { const o = el("option", "", t); o.value = String(i + 1); m.appendChild(o); });
}
fillDM("r-bd", "r-bm");
const bdText = (r) => (r && r.bd && r.bm ? r.bd + " " + MONTHS_LONG[r.bm - 1] : "—");

// Giriş ekranı açılınca başvurular açık mı diye bakılır (giriş yapmadan okunabilen tek belge).
async function loadRegOpen() {
  try { const s = await getDoc(doc(db, "config", "public")); S.regOpen = !s.exists() || s.data().regOpen !== false; setMaint(s.exists() ? s.data() : {}); }
  catch (e) { S.regOpen = true; }
  $("l-maint").hidden = !S.maint.on; $("l-maint").textContent = S.maint.on ? "Şu an bakım yapılıyor. " + S.maint.msg + " (Yönetici girişi çalışır.)" : "";
  $("l-regrow").hidden = S.regOpen === false;
}
function openRegister(signedIn) {
  const u = S.user;
  $("r-passf").hidden = !!signedIn; $("r-emailf").hidden = !!signedIn;
  $("r-title").textContent = signedIn ? "Başvurunu tamamla" : "Kayıt ol";
  $("r-lead").textContent = signedIn
    ? "Hesabın (" + ((u && u.email) || "") + ") hazır ama sınıfa eklenmemiş. Bilgilerini doldur, yöneticiye gitsin."
    : "Bilgilerini doldur. Başvurun yöneticiye gider; kabul edilince giriş yapabilirsin.";
  $("r-back").textContent = signedIn ? "Çıkış yap" : "Vazgeç";
  const r = S.myReq;
  if (signedIn && r) {
    $("r-name").value = r.name || ""; $("r-no").value = r.no || ""; $("r-phone").value = r.phone || ""; $("r-note").value = r.note || "";
    $("r-bd").value = String(r.bd || ""); $("r-bm").value = String(r.bm || "");
  }
  setMsg("r-msg", ""); $("r-go").disabled = false; $("r-go").textContent = "Başvuruyu gönder";
  show("register");
}
function readRegForm(emailFallback) {
  const name = $("r-name").value.replace(/\s+/g, " ").trim();
  const email = ($("r-email").value || emailFallback || "").trim().toLowerCase();
  const bd = Number($("r-bd").value), bm = Number($("r-bm").value);
  const no = $("r-no").value.trim(), phone = $("r-phone").value.trim(), note = $("r-note").value.trim();
  let err = "";
  if (!name || name.length < 3 || name.indexOf(" ") < 0) err = "Ad ve soyadını birlikte yaz.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) err = "E-posta adresi geçerli görünmüyor.";
  else if (!bd || !bm || new Date(2024, bm - 1, bd).getMonth() !== bm - 1) err = "Doğum günün için gün ve ayı seç.";
  else if (!/^[0-9]{1,8}$/.test(no)) err = "Okul numaranı yaz (sadece rakam).";
  else if (phone && !/^[0-9+() -]{7,20}$/.test(phone)) err = "Telefon numarası geçerli görünmüyor.";
  return { err, data: { name, email, bd, bm, no, phone, note } };
}
async function writeReq(uid, d) {
  await setDoc(doc(db, "requests", uid), { ...d, uid, status: "pending", createdAt: nowMs() });
}
function renderMyReq() {
  const user = S.user, r = S.myReq;
  if (!user || S.profile) return;
  if (!r) { if (S.regOpen === false) showNoAccess("Bu hesap (" + (user.email || "") + ") sınıf paneline eklenmemiş ve yeni başvurular kapalı. Yöneticine haber ver."); else openRegister(true); return; }
  if (S.regEdit && r.status === "rejected") { openRegister(true); return; }
  S.regEdit = false;
  const rej = r.status === "rejected";
  $("p-title").textContent = rej ? "Başvurun kabul edilmedi" : "Başvurun alındı";
  $("p-msg").textContent = rej
    ? "Yönetici başvurunu kabul etmedi." + (r.reason ? " Not: " + r.reason : "") + " Bilgilerini düzeltip tekrar başvurabilirsin."
    : "Yönetici başvurunu inceleyecek. Kabul edilince bu ekran kendiliğinden açılır; sayfayı açık tutmana gerek yok, daha sonra giriş yapabilirsin.";
  const sum = $("p-sum"); sum.textContent = "";
  [["Ad Soyad", r.name], ["E-posta", r.email], ["Doğum günü", bdText(r)], ["Okul no", r.no], ["Telefon", r.phone || "—"]].forEach((x) => {
    const p = el("div"); p.appendChild(el("b", "", x[0] + ": ")); p.appendChild(document.createTextNode(x[1] || "—")); sum.appendChild(p);
  });
  $("p-edit").hidden = !rej;
  show("pending");
}
function watchMyReq(user) {
  if (reqUnsub) { reqUnsub(); reqUnsub = null; }
  reqUnsub = onSnapshot(doc(db, "requests", user.uid), (s) => {
    S.myReq = s.exists() ? s.data() : null;
    if (S.regBusy) return;
    renderMyReq();
  }, (e) => {
    // Kurallar henüz güncellenmediyse eski "erişim yok" ekranına düşer.
    showNoAccess(e && e.code === "permission-denied"
      ? "Bu hesap (" + (user.email || "") + ") sınıf paneline eklenmemiş. Yöneticine haber ver. (Kayıt başvurusu için güvenlik kurallarının yayınlanması gerekir.)"
      : "Bağlantı sorunu. Sayfayı yenile.");
  });
}
function showNoAccess(t) { $("na-msg").textContent = t; show("noaccess"); }

$("l-reg").addEventListener("click", () => { S.user = null; openRegister(false); });
$("r-show").addEventListener("change", function () { const t = this.checked ? "text" : "password"; $("r-pass").type = t; $("r-pass2").type = t; });
$("r-back").addEventListener("click", () => { if (S.user) doLogout(); else show("login"); });
$("reg-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const signedIn = !!S.user;
  const f = readRegForm(signedIn ? S.user.email : "");
  if (f.err) { setMsg("r-msg", f.err); return; }
  let pass = "";
  if (!signedIn) {
    pass = $("r-pass").value;
    if (pass.length < 6 || pass.length > 64 || /\s/.test(pass)) { setMsg("r-msg", "Şifre en az 6 karakter olmalı ve boşluk içermemeli."); return; }
    if (pass !== $("r-pass2").value) { setMsg("r-msg", "İki şifre aynı değil."); return; }
  }
  setMsg("r-msg", ""); $("r-go").disabled = true; $("r-go").textContent = "Gönderiliyor…";
  S.regBusy = true;
  try {
    let uid;
    if (signedIn) uid = S.user.uid;
    else {
      // Kapalıysa hesap hiç açılmasın.
      await loadRegOpen();
      if (S.regOpen === false) { setMsg("r-msg", "Yeni başvurular şu an kapalı. Yöneticine yaz."); S.regBusy = false; $("r-go").disabled = false; $("r-go").textContent = "Başvuruyu gönder"; return; }
      const cred = await createUserWithEmailAndPassword(auth, f.data.email, pass);
      uid = cred.user.uid;
    }
    await writeReq(uid, f.data);
    S.regBusy = false; S.regEdit = false;
    S.myReq = S.myReq && S.myReq.status ? S.myReq : { ...f.data, uid, status: "pending" };
    S.myReq = { ...S.myReq, ...f.data, status: "pending", reason: "" };
    renderMyReq();
  } catch (e) {
    S.regBusy = false;
    console.error(e);
    const exists = e && e.code === "auth/email-already-in-use";
    setMsg("r-msg", exists ? "Bu e-posta zaten kayıtlı. Giriş ekranından giriş yapmayı dene; şifreni bilmiyorsan “Şifremi unuttum”a bas."
      : e && e.code === "permission-denied" ? "Başvuru kaydedilemedi. Yeni başvurular kapalı olabilir ya da güvenlik kuralları yayınlanmamış."
      : authMsg(e));
    $("r-go").disabled = false; $("r-go").textContent = "Başvuruyu gönder";
  }
});
$("p-out").addEventListener("click", doLogout);
$("p-edit").addEventListener("click", () => { S.regEdit = true; openRegister(true); });
$("p-cancel").addEventListener("click", async () => {
  if (!S.user) return;
  try { await deleteDoc(doc(db, "requests", S.user.uid)); } catch (e) { toast("Geri çekilemedi."); }
});

// Yönetici: başvuru listesi, kabul ve ret.
function renderReqs() {
  if (!can("req")) return;
  const pend = S.reqs.filter((r) => r.status !== "rejected");
  $("n-req").textContent = String(pend.length);
  const note = $("req-note");
  note.hidden = pend.length === 0;
  $("req-note-t").textContent = pend.length + " yeni kayıt başvurusu bekliyor.";
  $("reg-open").checked = S.regOpen !== false; $("reg-open").disabled = !S.isAdmin;
  const box = $("req-list"); box.textContent = "";
  const all = S.reqs.slice().sort((a, b) => (a.status === "rejected" ? 1 : 0) - (b.status === "rejected" ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0));
  if (!all.length) { box.appendChild(emptyBox("Bekleyen başvuru yok", "Biri kayıt olunca burada görünür.")); return; }
  all.forEach((r) => {
    const row = el("div", "rrow");
    const top = el("div", "r-top");
    top.appendChild(el("span", "r-name", r.name || "(adsız)"));
    top.appendChild(el("span", "chip " + (r.status === "rejected" ? "crit-solid" : "good"), r.status === "rejected" ? "Reddedildi" : "Bekliyor"));
    if (r.createdAt) top.appendChild(el("span", "chip plain", agoText(r.createdAt)));
    row.appendChild(top);
    row.appendChild(el("div", "r-info", (r.email || "") + " · Okul no: " + (r.no || "—") + " · Doğum günü: " + bdText(r) + (r.phone ? " · Tel: " + r.phone : "")));
    if (r.note) row.appendChild(el("div", "r-info", "Not: " + r.note));
    const act = el("div", "r-act");
    if (S.isAdmin && Object.keys(S.roles).length) {
      const sel = roleSelect(S.reqRole[r.id] || "", (v) => { S.reqRole[r.id] = v; }); act.appendChild(sel);
    }
    const ok = el("button", "btn btn-primary btn-small", "Kabul et"); ok.type = "button";
    ok.addEventListener("click", () => approveReq(r, ok));
    act.appendChild(ok);
    if (r.status !== "rejected") {
      const no = el("button", "btn btn-quiet btn-small", "Reddet"); no.type = "button";
      no.addEventListener("click", () => rejectReq(r));
      act.appendChild(no);
    }
    const del = el("button", "lnk", "Başvuruyu sil"); del.type = "button";
    del.addEventListener("click", async () => { try { await deleteDoc(doc(db, "requests", r.id)); } catch (e) { toast("Silinemedi."); } });
    act.appendChild(del);
    row.appendChild(act);
    box.appendChild(row);
  });
}
async function approveReq(r, btn) {
  btn.disabled = true; btn.textContent = "Ekleniyor…";
  try {
    const b = writeBatch(db);
    const prof = { name: r.name, email: r.email, role: "student", createdAt: nowMs(), tokens: [], notify: { h17: true, h20: true, ann: true }, no: r.no || "" };
    if (r.phone) prof.phone = r.phone;
    const rid = S.isAdmin ? S.reqRole[r.id] : "";
    if (rid && S.roles[rid]) Object.assign(prof, roleFieldsOf(rid));
    b.set(doc(db, "users", r.id), prof);
    if (r.bd && r.bm) b.set(doc(db, "birthdays", r.id), { name: r.name, md: pad(r.bm) + "-" + pad(r.bd) });
    b.delete(doc(db, "requests", r.id));
    await b.commit();
    toast(r.name + " sınıfa eklendi.");
  } catch (e) {
    console.error(e); btn.disabled = false; btn.textContent = "Kabul et";
    toast(e && e.code === "permission-denied" ? "Eklenemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Eklenemedi. Tekrar dene.");
  }
}
async function rejectReq(r) {
  const reason = (window.prompt("İstersen kısa bir sebep yaz (başvuran görecek). Boş bırakabilirsin.", "") || "").trim().slice(0, 100);
  try { await updateDoc(doc(db, "requests", r.id), { status: "rejected", reason, decidedAt: nowMs() }); }
  catch (e) { toast("Reddedilemedi."); }
}
$("reg-open").addEventListener("change", async function () {
  const open = this.checked;
  try { await setDoc(doc(db, "config", "public"), { regOpen: open, updatedAt: nowMs() }, { merge: true }); setMsg("reg-msg", open ? "Başvurular açık." : "Başvurular kapatıldı.", true); }
  catch (e) { this.checked = !open; setMsg("reg-msg", "Kaydedilemedi."); }
});
$("req-note-go").addEventListener("click", () => { setView("adm"); setAdmTab("req"); });


/* ---------- Mobi AI (öğrenci yardımcısı) ---------- */
S.aiOn = true; S.ai = { msgs: [], busy: false, img: "" }; S.gd = { msgs: [], busy: false, seen: {}, openLen: 0 };
const AI_VIEW = { ask: "Hocaya sorulacaklar", fun: "Eğlence köşesi", today: "Bugün", hw: "Ödevler", ex: "Sınavlar", cal: "Takvim", sch: "Ders programı", ann: "Duyurular", more: "Menü", grd: "Notlarım", nts: "Ders notları", tr: "Deneme sınavları", study: "Çalışma süresi", qa: "Soru köşesi", poll: "Anketler", info: "Sınıf bilgisi", set: "Ayarlar", adm: "Yönetim" };
const AI_CHIPS = {
  today: ["Bugün neye çalışmalıyım?", "Bu hafta için plan yap"],
  hw: ["Ödevlerimi nasıl sıraya koyayım?", "Takıldığım bir ödev var"],
  ex: ["Sınava nasıl çalışmalıyım?", "Bana mini test hazırla"],
  sch: ["Bugünkü derslere nasıl hazırlanayım?"],
  study: ["Verimli çalışma tekniği öner", "25 dakikalık bir çalışma planı yap"],
  qa: ["Bir konuyu basitçe anlat"],
  tr: ["Yanlışlarımı nasıl azaltırım?"]
};
function renderAiFab() {
  const on = !!S.profile && S.aiOn !== false && !$("app").hidden;
  $("ai-fab").hidden = !on;
  if (!on && !$("ai-panel").hidden) closeAi();
  const g = on && isGuide(); $("gd-fab").hidden = !g;
  if (!g) { $("gd-panel").hidden = true; $("gd-tip").hidden = true; }
}
function aiContext(focus) {
  const byDue = (a, b) => String(a.due || a.date).localeCompare(String(b.due || b.date));
  const hw = S.hw.filter((h) => h.due && !isExpired(h.due) && !S.done.has(h.id)).sort(byDue).slice(0, 8)
    .map((h) => (h.subject || "") + ": " + (h.title || "") + " (son gün " + h.due + ")");
  const ex = S.ex.filter((x) => x.date && dayDiff(x.date) >= 0).sort(byDue).slice(0, 6)
    .map((x) => (x.subject || "") + ": " + (x.title || "") + " (" + x.date + ")" + (x.topics ? " konular: " + String(x.topics).replace(/\s+/g, " ").slice(0, 70) : ""));
  const lessons = [];
  const rt = realToday();
  if (rt) S.sched.periods.forEach((p, i) => { const c = lessonOf(rt, i); if (c && c.subject) lessons.push((i + 1) + ". ders " + c.subject); });
  const n = nowD();
  return { view: AI_VIEW[S.view] || S.view, today: DAY_NAMES[n.getDay()] + " " + n.getDate() + " " + MONTHS_LONG[n.getMonth()], hw, ex, lessons, focus: focus || "" };
}
function aiBubble(cls, text) {
  const b = el("div", "ai-msg " + cls);
  String(text).split(/\n{2,}/).forEach((para) => {
    const p = el("p");
    para.split(/(\*\*[^*]+\*\*)/).forEach((seg) => {
      if (/^\*\*[^*]+\*\*$/.test(seg)) p.appendChild(el("strong", "", seg.slice(2, -2))); else if (seg) p.appendChild(document.createTextNode(seg));
    });
    b.appendChild(p);
  });
  return b;
}
function renderAiLog(extra) {
  const log = $("ai-log"); log.textContent = "";
  const first = (S.profile && S.profile.name ? S.profile.name.split(" ")[0] : "") || "";
  log.appendChild(aiBubble("bot", "Merhaba" + (first ? " " + first : "") + "! Ben Mobi, çalışma arkadaşınım. Ödevlerinde, sınavlarına hazırlanırken ya da anlamadığın bir konuda yardım edebilirim. Ne çalışıyoruz?"));
  S.ai.msgs.forEach((m) => log.appendChild(aiBubble(m.role === "user" ? "me" : "bot", (m.img ? "[Fotoğraflı soru] " : "") + m.content)));
  if (extra) log.appendChild(extra);
  log.scrollTop = log.scrollHeight;
}
function renderAiChips() {
  const box = $("ai-chips"); if (!box) return; box.textContent = "";
  if (S.ai.msgs.length > 1) return;
  (AI_CHIPS[S.view] || ["Bir konuyu basitçe anlat", "Çalışmaya nasıl başlarım?"]).forEach((t) => {
    const b = el("button", "", t); b.type = "button";
    b.addEventListener("click", () => aiSend(t, ""));
    box.appendChild(b);
  });
}
function openAi(prompt, focus) {
  $("gd-panel").hidden = true; $("gd-tip").hidden = true; S.ai.openLen = S.ai.msgs.length;
  $("ai-panel").hidden = false; renderAiLog(); renderAiChips(); $("ai-back").hidden = !isGuide();
  if (prompt) aiSend(prompt, focus || ""); else setTimeout(() => $("ai-in").focus(), 50);
}
function closeAi() { $("ai-panel").hidden = true; }
function aiErr(status, code, limit) {
  if (status === 400) return "Fotoğraf ya da mesaj gönderilemedi. Başka bir fotoğraf dene.";
  if (status === 429) return "Bugünlük soru hakkın doldu (günde " + (limit || 30) + "). Yarın tekrar yardım edebilirim.";
  if (status === 403 && code === "off") return "Mobi şu an yönetici tarafından kapatılmış.";
  if (status === 401 || status === 403) return "Giriş süren dolmuş olabilir. Çıkıp tekrar gir.";
  if (status === 404 || status === 405) return "Mobi henüz kurulmamış. Yöneticine haber ver (README 10. adım).";
  if (status === 500 && (code === "noKey" || code === "config")) return "Mobi'nin anahtarı sunucuda tanımlı değil. Yöneticine haber ver (README 10. adım).";
  if (status === 502 || status === 503) return "Mobi şu an meşgul. Biraz sonra tekrar dene.";
  return "Mobi'ye ulaşılamadı. İnternetini kontrol edip tekrar dene.";
}
async function aiSend(text, focus) {
  text = String(text || "").trim();
  const img = S.ai.img || "";
  if (img && !text) text = "Bu fotoğraftaki soruyu çöz ve adım adım anlat.";
  if (!text || S.ai.busy || !auth.currentUser) return;
  S.ai.busy = true; $("ai-send").disabled = true;
  S.ai.msgs.push({ role: "user", content: text.slice(0, 600), img: !!img });
  $("ai-in").value = ""; S.ai.img = ""; $("ai-prev").hidden = true;
  const wait = aiBubble("bot wait", "Mobi düşünüyor…");
  renderAiLog(wait); renderAiChips();
  let status = 0, code = "", limit = 0, reply = "";
  try {
    const t = await auth.currentUser.getIdToken();
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ messages: S.ai.msgs.slice(-12).map((m) => ({ role: m.role, content: m.content })), context: aiContext(focus), image: img || undefined, style: (S.profile && S.profile.mstyle) || undefined })
    });
    status = r.status;
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.ok && j.text) reply = j.text; else { code = j.error || ""; limit = j.limit || 0; }
  } catch (e) { status = 0; }
  S.ai.busy = false; $("ai-send").disabled = false;
  if (reply) { S.ai.msgs.push({ role: "assistant", content: reply }); renderAiLog(); }
  else { S.ai.msgs.pop(); renderAiLog(aiBubble("err", aiErr(status, code, limit))); $("ai-in").value = text; if (img) { S.ai.img = img; $("ai-prev").hidden = false; } }
  renderAiChips();
}
$("ai-fab").addEventListener("click", () => openAi());
$("ai-close").addEventListener("click", () => { closeAi(); gdAfterMobi(); });
$("ai-clear").addEventListener("click", () => { if (S.ai.busy) return; S.ai.msgs = []; renderAiLog(); renderAiChips(); });
$("ai-form").addEventListener("submit", (ev) => { ev.preventDefault(); aiSend($("ai-in").value, ""); });
$("ai-in").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); aiSend($("ai-in").value, ""); } });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("ai-panel").hidden) { closeAi(); gdAfterMobi(); } else if (ev.key === "Escape" && !$("gd-panel").hidden) $("gd-panel").hidden = true; });
$("m-ai").addEventListener("change", async function () {
  const on = this.checked;
  try { await setDoc(doc(db, "config", "settings"), { aiOn: on, updatedAt: nowMs() }, { merge: true }); setMsg("m-ai-msg", on ? "Mobi AI açık." : "Mobi AI kapatıldı.", true); }
  catch (e) { this.checked = !on; setMsg("m-ai-msg", "Kaydedilemedi."); }
});


/* ---------- Sınav provası (Mobi'nin hazırladığı mini test) ---------- */
S.qzList = []; S.qz = { phase: "setup", quiz: null, i: 0, picks: [], busy: false };
fillSubjectSelect("qz-sub");
const LETTERS = ["A", "B", "C", "D"];
function quizPrefill(subject, topic) {
  if (SUBJECTS.some((x) => x.n === subject)) $("qz-sub").value = subject;
  $("qz-topic").value = String(topic || "").slice(0, 100);
  S.qz.phase = "setup"; renderQuiz();
}
function renderQuizSugg() {
  const box = $("qz-sugg"); if (!box) return; box.textContent = "";
  const seen = new Set();
  S.ex.filter((x) => x.date && dayDiff(x.date) >= 0).sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((x) => {
    const items = splitItems(x.topics); if (!items.length && x.title) items.push(x.title);
    items.forEach((t) => {
      const k = (x.subject || "") + "|" + t.toLowerCase(); if (seen.has(k) || seen.size >= 8) return; seen.add(k);
      const b = el("button", "pill", (x.subject ? x.subject + ": " : "") + t.slice(0, 40)); b.type = "button";
      b.addEventListener("click", () => quizPrefill(x.subject, t));
      box.appendChild(b);
    });
  });
}
function renderQuiz() {
  const ph = S.qz.phase;
  renderWrongBox();
  $("qz-setup").hidden = ph !== "setup"; $("qz-run").hidden = ph !== "run"; $("qz-res").hidden = ph !== "res";
  $("qz-stats").hidden = ph === "run";
  renderQuizSugg();
  if (ph === "run") renderQuizQ();
  renderQuizStats();
}
function renderQuizQ() {
  const q = S.qz.quiz, i = S.qz.i, item = q.questions[i], picked = S.qz.picks[i];
  $("qz-pos").textContent = "Soru " + (i + 1) + " / " + q.questions.length;
  $("qz-topic-l").textContent = q.subject + " · " + q.topic;
  $("qz-bar").style.width = Math.round((100 * i) / q.questions.length) + "%";
  $("qz-q").textContent = item.q;
  const box = $("qz-opts"); box.textContent = "";
  item.options.forEach((t, k) => {
    const b = el("button", "qz-opt"); b.type = "button";
    b.appendChild(el("b", "", LETTERS[k])); b.appendChild(el("span", "", t));
    if (picked != null) {
      b.disabled = true;
      if (k === item.answer) b.classList.add("right"); else if (k === picked) b.classList.add("wrong");
    } else b.addEventListener("click", () => quizPick(k));
    box.appendChild(b);
  });
  const why = $("qz-why");
  if (picked != null) {
    why.textContent = (picked === item.answer ? "Doğru! " : "Doğru cevap " + LETTERS[item.answer] + ". ") + (item.why || ""); why.hidden = false;
  } else why.hidden = true;
  const nx = $("qz-next"); nx.hidden = picked == null; nx.textContent = i + 1 >= q.questions.length ? "Sonucu gör" : "Sonraki";
}
function quizPick(k) {
  if (S.qz.picks[S.qz.i] != null) return;
  S.qz.picks[S.qz.i] = k; renderQuizQ();
}
async function quizFinish() {
  const q = S.qz.quiz, score = q.questions.filter((x, i) => S.qz.picks[i] === x.answer).length;
  S.qz.phase = "res"; S.qz.score = score;
  let mastered = 0;
  if (S.qz.review) {
    try { mastered = await reviewApply(); } catch (e) { toast("Tekrar sonucu kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
  } else {
    try { await addDoc(collection(db, "users", S.user.uid, "quiz"), { subject: q.subject.slice(0, 30), topic: q.topic.slice(0, 120), score, total: q.questions.length, at: nowMs() }); }
    catch (e) { toast("Sonucun kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
    try { await saveWrongs(q, S.qz.picks); } catch (e) {}
  }
  const n = q.questions.length, r = score / n;
  $("qz-score").textContent = score + " / " + n + " doğru";
  $("qz-msg2").textContent = S.qz.review ? (mastered ? mastered + " soru kalıcı öğrenildi, defterden çıktı. " : "") + "Doğrularını daha seyrek, yanlışlarını yarın yine soracağım." : r === 1 ? "Mükemmel, bu konuyu iyi biliyorsun!" : r >= 0.8 ? "Çok iyi! Yanlışına bir göz at, tamamdır." : r >= 0.5 ? "İyi gidiyorsun. Yanlışlarını tekrar edip yeni bir prova çözebilirsin." : "Bu konu biraz çalışma ister. Mobi'ye sorup konuyu tekrar et, sonra yeniden dene.";
  const w = $("qz-wrong"); w.textContent = "";
  q.questions.forEach((x, i) => {
    if (S.qz.picks[i] === x.answer) return;
    const d = el("div", "qz-wr");
    d.appendChild(el("b", "", (i + 1) + ". " + x.q)); d.appendChild(el("div", "", "Senin cevabın: " + (S.qz.picks[i] == null ? "—" : x.options[S.qz.picks[i]])));
    d.appendChild(el("div", "", "Doğrusu: " + x.options[x.answer] + (x.why ? ". " + x.why : "")));
    w.appendChild(d);
  });
  $("qz-ask").hidden = !w.children.length;
  renderQuiz();
  if (S.qz.review ? mastered > 0 : score === n && n >= 3) celebrate(S.qz.review ? "mastered" : "quiz", mastered);
  if (isGuide()) gdAfterQuiz(S.qz.review ? "Yanlış defteri" : q.topic, score, n, !!S.qz.review);
}
async function quizStart() {
  if (S.qz.busy) return;
  const topic = $("qz-topic").value.replace(/\s+/g, " ").trim(), subject = $("qz-sub").value;
  if (topic.length < 2) { setMsg("qz-msg", "Önce bir konu yaz ya da yukarıdan seç."); return; }
  setMsg("qz-msg", ""); S.qz.busy = true; $("qz-go").disabled = true; $("qz-go").textContent = "Mobi hazırlıyor…";
  let status = 0, code = "", limit = 0, quiz = null;
  try {
    const t = await auth.currentUser.getIdToken();
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ mode: "quiz", subject, topic, n: 5 }) });
    status = r.status; let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.ok && j.quiz && Array.isArray(j.quiz.questions) && j.quiz.questions.length) quiz = j.quiz; else { code = j.error || ""; limit = j.limit || 0; }
  } catch (e) { status = 0; }
  S.qz.busy = false; $("qz-go").disabled = false; $("qz-go").textContent = "Prova hazırla";
  if (!quiz) { setMsg("qz-msg", status === 400 ? "Konu çok kısa ya da uygun değil. Biraz daha açık yaz." : status === 502 ? "Mobi bu konudan test hazırlayamadı. Konuyu biraz daha açık yazıp tekrar dene." : aiErr(status, code, limit)); return; }
  S.qz = { phase: "run", quiz, i: 0, picks: [], busy: false }; renderQuiz();
}
function quizNext() {
  if (S.qz.picks[S.qz.i] == null) return;
  if (S.qz.i + 1 >= S.qz.quiz.questions.length) { quizFinish(); return; }
  S.qz.i++; renderQuiz();
}
// Zayıf konular: aynı konunun son 3 provasının ortalaması %60'ın altındaysa.
function weakTopics() {
  const by = new Map(), weak = [];
  S.qzList.forEach((x) => { const key = (x.subject || "") + "|" + String(x.topic).toLowerCase(); if (!by.has(key)) by.set(key, []); by.get(key).push(x); });
  by.forEach((arr) => { const last = arr.slice(0, 3), pc = Math.round((100 * last.reduce((a, x) => a + x.score, 0)) / last.reduce((a, x) => a + x.total, 0)); if (pc < 60) weak.push({ x: arr[0], pc }); });
  return weak.sort((a, b) => a.pc - b.pc);
}
function renderQuizStats() {
  const list = S.qzList, k = $("qz-kpis"); if (!k) return;
  k.textContent = ""; $("qz-weak").textContent = ""; $("qz-hist").textContent = "";
  if (!list.length) { k.appendChild(el("p", "muted", "Henüz prova çözmedin. İlk provandan sonra serin, ortalaman ve zayıf konuların burada görünür.")); return; }
  const days = new Set(list.map((x) => dateStr(new Date(x.at))));
  let streak = 0; const d = nowD(); if (!days.has(dateStr(d))) d.setDate(d.getDate() - 1);
  while (days.has(dateStr(d))) { streak++; d.setDate(d.getDate() - 1); }
  const avg = Math.round((100 * list.reduce((a, x) => a + x.score, 0)) / Math.max(1, list.reduce((a, x) => a + x.total, 0)));
  [[streak + " gün", "Üst üste çalışma"], [String(list.length), "Çözülen prova"], ["%" + avg, "Ortalama"]].forEach((x) => {
    const c = el("div", "qz-kpi"); c.appendChild(el("b", "", x[0])); c.appendChild(el("span", "", x[1])); k.appendChild(c);
  });
  const weak = weakTopics();
  if (weak.length) {
    $("qz-weak").appendChild(el("h4", "", "Biraz daha çalışılacak konular"));
    const box = el("div", "qz-weak");
    weak.slice(0, 4).forEach((w) => {
      const r = el("div", "row1"); r.appendChild(el("span", "", w.x.subject + ": " + w.x.topic + " (%" + w.pc + ")"));
      const b = el("button", "btn btn-quiet btn-small", "Tekrar çöz"); b.type = "button"; b.addEventListener("click", () => quizPrefill(w.x.subject, w.x.topic));
      r.appendChild(b); box.appendChild(r);
    });
    $("qz-weak").appendChild(box);
  }
  const h = $("qz-hist");
  list.slice(0, 8).forEach((x) => {
    const r = el("div", "qz-hrow"); r.appendChild(el("span", "", x.subject + " · " + x.topic + " · " + agoText(x.at))); r.appendChild(el("b", "", x.score + "/" + x.total)); h.appendChild(r);
  });
}
$("qz-go").addEventListener("click", quizStart);
$("qz-topic").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); quizStart(); } });
$("qz-next").addEventListener("click", quizNext);
$("qz-quit").addEventListener("click", () => { S.qz.phase = "setup"; renderQuiz(); });
$("qz-new").addEventListener("click", () => { S.qz.phase = "setup"; renderQuiz(); });
$("qz-again").addEventListener("click", () => { S.qz.phase = "setup"; quizStart(); });
$("qz-ask").addEventListener("click", () => {
  const q = S.qz.quiz; if (!q) return;
  const wrong = q.questions.filter((x, i) => S.qz.picks[i] !== x.answer).map((x) => x.q.slice(0, 90));
  openAi(("“" + q.topic + "” provasında şu soruları yanlış yaptım: " + wrong.join(" | ") + ". Konuyu bana basitçe anlatır mısın?").slice(0, 590), q.subject + ": " + q.topic);
});


/* ---------- Roller (yönetici adlandırır, görevleri seçer) ---------- */
S.roles = {}; S.roleEdit = ""; S.reqRole = {}; S.permKey = "";
const PERM_DEFS = [
  ["ann", "Duyuru", "Duyuru yazar, siler ve bildirim gönderir."],
  ["sched", "Ders programı", "Ders programını düzenler."],
  ["info", "Sınıf bilgisi", "Sınıf kurallarını, bağlantıları ve nöbetçi sırasını düzenler."],
  ["cal", "Takvim", "Tatilleri ve takvim etkinliklerini toplu yükler."],
  ["req", "Kayıt başvuruları", "Kayıt başvurularını kabul eder ya da reddeder."],
  ["topic", "İşlenen konular", "Derslerde bu hafta işlenen konuları girer. Mobi önerileri buna göre çıkar."],
  ["mod", "İçerik düzenleme", "Başkalarının ödev, sınav, not, soru ve etkinliklerini düzenler ve siler."]
];
const permLabel = (p) => (PERM_DEFS.find((x) => x[0] === p) || [p, p])[1];
const roleList = () => Object.keys(S.roles).map((id) => ({ id, name: S.roles[id].name || "", perms: Array.isArray(S.roles[id].perms) ? S.roles[id].perms : [] }))
  .sort((a, b) => a.name.localeCompare(b.name, "tr"));
function roleFieldsOf(id) { const r = S.roles[id]; return { roleId: id, roleName: String(r.name || "").slice(0, 30), perms: (Array.isArray(r.perms) ? r.perms : []).filter((p) => PERM_DEFS.some((x) => x[0] === p)) }; }
function roleSelect(cur, onChange) {
  const sel = el("select", "rsel"); sel.setAttribute("aria-label", "Görev rolü");
  const o0 = el("option", "", "Görev rolü yok"); o0.value = ""; sel.appendChild(o0);
  roleList().forEach((r) => { const o = el("option", "", r.name); o.value = r.id; sel.appendChild(o); });
  sel.value = S.roles[cur] ? cur : "";
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}
async function assignRole(u, rid) {
  const f = rid && S.roles[rid] ? roleFieldsOf(rid) : { roleId: "", roleName: "", perms: [] };
  try { await updateDoc(doc(db, "users", u.id), f); toast(rid ? u.name + " için rol: " + f.roleName : u.name + " için rol kaldırıldı."); }
  catch (e) { toast("Rol verilemedi."); }
}
function fillRoleSelects() {
  const sel = $("u-roleid"); if (!sel) return; const cur = sel.value; sel.textContent = "";
  const o0 = el("option", "", "Görev rolü yok"); o0.value = ""; sel.appendChild(o0);
  roleList().forEach((r) => { const o = el("option", "", r.name); o.value = r.id; sel.appendChild(o); });
  sel.value = S.roles[cur] ? cur : "";
}
function buildPermBoxes() {
  const box = $("rl-perms"); PERM_DEFS.forEach((d) => {
    const lb = el("label", "perm"), cb = document.createElement("input"); cb.type = "checkbox"; cb.value = d[0];
    lb.appendChild(cb); const sp = el("span"); sp.appendChild(el("b", "", d[1])); sp.appendChild(el("small", "", d[2])); lb.appendChild(sp); box.appendChild(lb);
  });
}
buildPermBoxes();
function renderRoles() {
  fillRoleSelects();
  const list = $("rl-list"); if (!list) return; list.textContent = "";
  const rs = roleList();
  if (!rs.length) { list.appendChild(emptyBox("Henüz rol yok", "Yukarıdan ilk rolü oluştur.")); return; }
  rs.forEach((r) => {
    const row = el("div", "rrole"), top = el("div", "r-top");
    top.appendChild(el("span", "r-name", r.name));
    const n = S.users.filter((u) => u.roleId === r.id).length;
    top.appendChild(el("span", "chip plain", n + " kişi"));
    row.appendChild(top);
    row.appendChild(el("div", "r-info", r.perms.length ? "Görevler: " + r.perms.map(permLabel).join(", ") : "Görev seçilmemiş (sadece ad / unvan)"));
    const act = el("div", "r-act");
    const ed = el("button", "btn btn-quiet btn-small", "Düzenle"); ed.type = "button"; ed.addEventListener("click", () => editRole(r.id)); act.appendChild(ed);
    const key = "rl:" + r.id;
    const dl = el("button", "lnk", armedId === key ? "Silmek için tekrar dokun" : "Sil"); dl.type = "button"; dl.dataset.armed = armedId === key ? "1" : "0";
    dl.addEventListener("click", () => {
      if (armedId !== key) { armedId = key; clearTimeout(armTimer); armTimer = setTimeout(() => { armedId = null; renderRoles(); }, 4000); renderRoles(); return; }
      armedId = null; deleteRole(r.id);
    });
    act.appendChild(dl); row.appendChild(act); list.appendChild(row);
  });
}
function editRole(id) {
  S.roleEdit = id; const r = S.roles[id] || { name: "", perms: [] };
  $("rl-name").value = r.name || ""; $("rl-title").textContent = id ? "Rolü düzenle" : "Yeni rol"; $("rl-cancel").hidden = !id;
  document.querySelectorAll("#rl-perms input").forEach((cb) => { cb.checked = (r.perms || []).indexOf(cb.value) >= 0; });
  setMsg("rl-msg", "");
}
async function saveRolesDoc(next) { await setDoc(doc(db, "config", "roles"), { roles: next, updatedAt: nowMs() }); }
$("rl-form").addEventListener("submit", async (ev) => {
  ev.preventDefault(); if (!S.isAdmin) return;
  const name = $("rl-name").value.replace(/\s+/g, " ").trim();
  const perms = Array.from(document.querySelectorAll("#rl-perms input:checked")).map((cb) => cb.value);
  if (name.length < 2) { setMsg("rl-msg", "Rol adını yaz (en az 2 harf)."); return; }
  if (roleList().some((r) => r.id !== S.roleEdit && r.name.toLowerCase() === name.toLowerCase())) { setMsg("rl-msg", "Bu isimde bir rol zaten var."); return; }
  const id = S.roleEdit || "r" + Date.now().toString(36);
  const next = { ...S.roles, [id]: { name, perms } };
  $("rl-go").disabled = true;
  try {
    await saveRolesDoc(next);
    // Rolün görevleri kişilerin profiline kopyalanır; rol değişince onlara da yansır.
    const members = S.users.filter((u) => u.roleId === id && u.role !== "admin");
    for (let i = 0; i < members.length; i += 400) {
      const b = writeBatch(db); members.slice(i, i + 400).forEach((u) => b.update(doc(db, "users", u.id), { roleName: name, perms })); await b.commit();
    }
    toast("Rol kaydedildi."); S.roleEdit = ""; editRole("");
  } catch (e) { console.error(e); setMsg("rl-msg", "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
  $("rl-go").disabled = false;
});
$("rl-cancel").addEventListener("click", () => editRole(""));
async function deleteRole(id) {
  try {
    const next = { ...S.roles }; delete next[id];
    const members = S.users.filter((u) => u.roleId === id);
    for (let i = 0; i < members.length; i += 400) {
      const b = writeBatch(db); members.slice(i, i + 400).forEach((u) => b.update(doc(db, "users", u.id), { roleId: "", roleName: "", perms: [] })); await b.commit();
    }
    await saveRolesDoc(next); toast("Rol silindi.");
    if (S.roleEdit === id) editRole("");
  } catch (e) { toast("Silinemedi."); }
}
$("u-role").addEventListener("change", () => { $("u-roleid-f").hidden = $("u-role").value === "admin"; });


/* ---------- Mobi önerileri: işlenen konu + eksik konular ---------- */
S.topics = {};
fillSubjectSelect("tp-sub");
function lessonSubjects() {
  const periods = S.sched.periods; if (!periods.length || !Object.keys(S.sched.cells).length) return null;
  const d = realToday() || 1, days = [d, d === 5 ? 1 : d + 1], set = new Set();
  days.forEach((day) => periods.forEach((p, i) => { const c = lessonOf(day, i); if (c && c.subject) set.add(c.subject); }));
  return set.size ? set : null;
}
function recentGood(subject, topic) {
  const t = nowMs() - 3 * 864e5;
  return S.qzList.some((x) => x.at >= t && x.subject === subject && String(x.topic).toLowerCase() === String(topic).toLowerCase() && x.score / x.total >= 0.8);
}
function planToday() {
  const out = [], today = dateStr(nowD());
  S.ex.filter((x) => x.date && dayDiff(x.date) >= 1 && dayDiff(x.date) <= 7).sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((x) => {
    const done = S.plan[x.id] || new Set();
    planFor(x).filter((d) => d.date === today).forEach((d) => d.tasks.forEach((t) => { if (!done.has(t.key)) out.push({ x, t }); }));
  });
  return out;
}
function renderMobiSuggest() {
  const card = $("td-mobi"); if (!card) return;
  const box = $("td-mobi-list"); box.textContent = "";
  const items = [];
  const dw = dueWrong().length;
  if (dw) items.push({ kind: "wrong", n: dw });
  planToday().slice(0, 2).forEach((p) => items.push({ kind: "plan", x: p.x, t: p.t }));
  recentMisses().slice(0, 2).forEach((m) => items.push({ kind: "miss", subject: m.subject, topic: m.topic, reason: m.reason }));
  weakTopics().slice(0, 2).forEach((w) => items.push({ kind: "weak", subject: w.x.subject, topic: w.x.topic, pc: w.pc }));
  const ls = lessonSubjects();
  Object.keys(S.topics).forEach((sub) => {
    const topic = S.topics[sub] && S.topics[sub].t; if (!topic || (ls && !ls.has(sub))) return;
    if (items.some((i) => i.subject === sub && String(i.topic).toLowerCase() === topic.toLowerCase())) return;
    items.push({ kind: "cur", subject: sub, topic, done: recentGood(sub, topic) });
  });
  const shown = items.slice(0, 6);
  card.hidden = !shown.length && !can("topic");
  if (!shown.length) { box.appendChild(el("p", "muted", "Henüz öneri yok. Bu haftanın konuları girilince ve prova çözdükçe Mobi sana ne çalışacağını önerir.")); if (can("topic")) { const b = el("button", "lnk", "Bu haftanın konularını gir ›"); b.type = "button"; b.addEventListener("click", () => setView("info")); box.appendChild(b); } return; }
  shown.forEach((it) => {
    const row = el("div", "ms"), act = el("div", "ms-act");
    const btn = (label, cls, fn) => { const b = el("button", "btn " + cls + " btn-small", label); b.type = "button"; b.addEventListener("click", fn); act.appendChild(b); };
    if (it.kind === "wrong") {
      row.appendChild(el("p", "", "Yanlış defterinde " + it.n + " sorunun tekrar zamanı geldi. Kısa bir tekrar kalıcı öğrenmeyi sağlar."));
      btn("Tekrar et", "btn-primary", wrongStart);
    } else if (it.kind === "plan") {
      row.appendChild(el("p", "", "Bugünkü plan · " + (it.x.subject || "Sınav") + " (" + dayDiff(it.x.date) + " gün kaldı): " + it.t.text));
      btn("Yaptım", "btn-primary", () => planToggle(it.x.id, it.t.key));
      btn("Planı aç", "btn-quiet", () => openPlan(it.x));
    } else {
      const msg = it.kind === "miss" ? it.subject + " · " + it.topic + ": sınavda \"" + (MISS_LBL[it.reason] || "zorlandım") + "\" demiştin. Kısa bir tekrar iyi gelir." : it.kind === "weak" ? it.subject + " · " + it.topic + ": son provalarında %" + it.pc + ". Bu konu biraz daha çalışma ister."
        : it.subject + " dersinde bu hafta “" + it.topic + "” işleniyor." + (it.done ? " Son günlerde bu konudan iyi bir prova çözdün." : " Bugün bir göz at.");
      row.appendChild(el("p", "", msg));
      btn("Konuyu anlat", "btn-quiet", () => openAi("“" + it.topic + "” konusunu bana basitçe anlatır mısın?" + (it.kind === "weak" ? " Son provamda %" + it.pc + " aldım, eksiklerimi tamamlamak istiyorum." : ""), it.subject + ": " + it.topic));
      btn("Tekerleme", "btn-quiet", () => openRhyme({ title: it.topic, subject: it.subject, form: "tekerleme" }));
      btn(it.done ? "Bir prova daha" : "Soru çöz", "btn-primary", () => { setView("quiz"); quizPrefill(it.subject, it.topic); quizStart(); });
    }
    row.appendChild(act); box.appendChild(row);
  });
}
function renderTopics() {
  const box = $("in-topics"); if (!box) return; box.textContent = "";
  $("tp-admin").hidden = !can("topic");
  const keys = Object.keys(S.topics).filter((k) => S.topics[k] && S.topics[k].t).sort(subjOrder);
  if (!keys.length) { box.appendChild(el("p", "muted", "Henüz konu girilmemiş.")); return; }
  keys.forEach((k) => {
    const r = el("div", "qz-hrow"); const l = el("span"); l.appendChild(subjectChip(k)); l.appendChild(document.createTextNode(" " + S.topics[k].t)); r.appendChild(l);
    if (can("topic")) { const x = el("button", "lnk", "Kaldır"); x.type = "button"; x.addEventListener("click", () => saveTopics(k, "")); r.appendChild(x); }
    box.appendChild(r);
  });
}
async function saveTopics(sub, topic) {
  const next = { ...S.topics };
  if (topic) next[sub] = { t: topic, at: nowMs() }; else delete next[sub];
  await setDoc(doc(db, "config", "topics"), { topics: next, updatedAt: nowMs() });
}
$("tp-form").addEventListener("submit", async (ev) => {
  ev.preventDefault(); if (!can("topic")) return;
  const sub = $("tp-sub").value, t = $("tp-t").value.replace(/\s+/g, " ").trim();
  if (t.length < 2) { setMsg("tp-msg", "Konuyu yaz."); return; }
  $("tp-go").disabled = true;
  try { await saveTopics(sub, t); $("tp-t").value = ""; setMsg("tp-msg", sub + " için konu kaydedildi.", true); }
  catch (e) { setMsg("tp-msg", "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
  $("tp-go").disabled = false;
});

/* ---------- Mobi: soru fotoğrafı ---------- */
function compressImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)), out = "";
      for (let i = 0; i < 4; i++) {
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        for (let q = 0.72; q >= 0.4; q -= 0.12) { out = c.toDataURL("image/jpeg", q); if (out.length <= 420000) return res(out); }
        scale *= 0.7;
      }
      rej(new Error("big"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad")); };
    img.src = url;
  });
}
$("ai-photo").addEventListener("click", () => $("ai-file").click());
$("ai-file").addEventListener("change", async function () {
  const f = this.files && this.files[0]; this.value = "";
  if (!f) return;
  try { S.ai.img = await compressImage(f); $("ai-prev").hidden = false; if (!$("ai-in").value.trim()) $("ai-in").focus(); }
  catch (e) { toast("Fotoğraf işlenemedi. Başka bir fotoğraf dene."); }
});
$("ai-prev-x").addEventListener("click", () => { S.ai.img = ""; $("ai-prev").hidden = true; });

/* ---------- Ders notundan özet ve ezber kartları ---------- */
S.nc = null;
function ncRender() {
  const box = $("nc-body"); box.textContent = ""; const st = S.nc; if (!st) return;
  if (st.err) { box.appendChild(aiBubble("err", st.err)); return; }
  if (st.loading) { box.appendChild(aiBubble("bot wait", "Mobi notu okuyor…")); return; }
  if (st.rhyme) {
    const row = el("div", "nc-acts");
    [["tekerleme", "Tekerleme"], ["rap", "Rap"], ["mani", "Mani"]].forEach((f) => {
      const b = el("button", "btn btn-small " + (st.req.form === f[0] ? "btn-primary" : "btn-quiet"), f[1]); b.type = "button";
      b.addEventListener("click", () => openRhyme({ ...st.req, form: f[0] })); row.appendChild(b);
    });
    box.appendChild(row);
    box.appendChild(el("div", "nc-rhyme", st.text));
    const act = el("div", "nc-acts");
    const cp = el("button", "btn btn-quiet", "Kopyala"); cp.type = "button";
    cp.addEventListener("click", async () => { try { await navigator.clipboard.writeText(st.text); toast("Kopyalandı."); } catch (e) { toast("Kopyalanamadı. Metne uzun basıp seçebilirsin."); } });
    const again = el("button", "btn btn-quiet", "Başka bir tane yaz"); again.type = "button"; again.addEventListener("click", () => openRhyme(st.req));
    act.appendChild(cp); act.appendChild(again); box.appendChild(act);
    box.appendChild(el("small", "muted", "Mobi'nin yazdığı eğlence metni. Önemli bilgileri kitabından kontrol et."));
    return;
  }
  if (st.summary) box.appendChild(el("div", "nc-sum", st.summary));
  if (st.share && S.canAdd) { const sb = el("button", "btn btn-quiet btn-small nc-share", "Sınıfla paylaş"); sb.type = "button"; sb.addEventListener("click", shareDeck); box.appendChild(sb); }
  if (st.pos >= st.order.length) {
    const n = st.cards.length, k = st.known.size;
    box.appendChild(el("h3", "", k + " / " + n + " kartı bildin"));
    const act = el("div", "nc-acts");
    if (k < n) { const b = el("button", "btn btn-primary", "Bilmediklerimi tekrar et"); b.type = "button"; b.addEventListener("click", () => { st.order = st.cards.map((_, i) => i).filter((i) => !st.known.has(i)); st.pos = 0; st.flip = false; ncRender(); }); act.appendChild(b); }
    const a = el("button", "btn btn-quiet", "Baştan başla"); a.type = "button"; a.addEventListener("click", () => { st.order = st.cards.map((_, i) => i); st.known = new Set(); st.pos = 0; st.flip = false; ncRender(); }); act.appendChild(a);
    box.appendChild(act); return;
  }
  const idx = st.order[st.pos], c = st.cards[idx];
  box.appendChild(el("b", "", "Kart " + (st.pos + 1) + " / " + st.order.length));
  const card = el("button", "nc-card" + (st.flip ? " back" : "")); card.type = "button";
  card.appendChild(el("span", "", st.flip ? c.back : c.front)); card.appendChild(el("small", "", st.flip ? "Cevap" : "Cevabı görmek için dokun"));
  card.addEventListener("click", () => { st.flip = !st.flip; ncRender(); });
  box.appendChild(card);
  if (st.flip) {
    const act = el("div", "nc-acts");
    const k = el("button", "btn btn-primary", "Bildim"); k.type = "button"; k.addEventListener("click", () => { st.known.add(idx); st.pos++; st.flip = false; ncRender(); });
    const t = el("button", "btn btn-quiet", "Tekrar"); t.type = "button"; t.addEventListener("click", () => { st.known.delete(idx); st.pos++; st.flip = false; ncRender(); });
    act.appendChild(k); act.appendChild(t); box.appendChild(act);
  }
}
async function openNoteCards(n) {
  $("nc-panel").hidden = false; $("nc-title").textContent = (n.title || "Not").slice(0, 40);
  S.nc = { loading: true };
  ncRender();
  let status = 0, code = "", limit = 0, res = null;
  try {
    const t = await auth.currentUser.getIdToken();
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ mode: "notecards", title: n.title || "", subject: n.subject || "", text: String(n.body || "").slice(0, 3500) }) });
    status = r.status; let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.ok && Array.isArray(j.cards) && j.cards.length) res = j; else { code = j.error || ""; limit = j.limit || 0; }
  } catch (e) { status = 0; }
  if ($("nc-panel").hidden) return;
  if (!res) { S.nc = { err: status === 400 ? "Bu not kart çıkarmak için çok kısa." : status === 502 ? "Mobi bu nottan kart çıkaramadı. Not daha açık yazılırsa tekrar dene." : aiErr(status, code, limit) }; ncRender(); return; }
  S.nc = { summary: res.summary, cards: res.cards, order: res.cards.map((_, i) => i), known: new Set(), pos: 0, flip: false, share: { title: n.title || "", subject: n.subject || "" } };
  ncRender();
}
$("nc-close").addEventListener("click", () => { const had = S.nc && S.nc.cards; $("nc-panel").hidden = true; S.nc = null; if (had && isGuide()) { S.gd.after = null; } if (had && isGuide()) gdReturn("Kartlar hazırdı. Bir kez bütün kartlara bakmak konuyu pekiştirir. Şimdi ne yapalım?", ["cards"]); });

/* ---------- Karşılama turu (ilk girişte) ---------- */
function welcomeSlides() {
  const L = (b, t) => [b, t];
  const slides = [
    { i: "👋", t: "Hoş geldin, " + String((S.profile && S.profile.name) || "").trim().split(/\s+/)[0] + "!", p: "9 Fen B Sınıf Paneli sınıfın ortak köşesi. Ödevler, sınavlar, notlar ve çalışma araçları hep burada. Kısa bir turla her şeyi göstereyim.", l: [] },
    { i: "📅", t: "Bugün ekranı", p: "Açılışta gününün özeti seni karşılar.", l: [L("Ödevler ve sınavlar", "yaklaşanlar tek bakışta"), L("Bugünün dersleri", "ve sonraki okul günü"), L("Mobi'nin önerileri", "ne çalışman gerektiğini söyler")] },
    { i: "📚", t: "Ödev ve sınavlar", p: "Ödevleri ve sınavları sınıfça birlikte tutarız.", l: [L("Ödev ekle", "arkadaşların da görür"), L("Yaptım işareti", "yalnız sana özel"), L("Hatırlatma", "bildirimi açarsan ödev yaklaşınca haber gelir")] },
    { i: "🗓️", t: "Takvim ve ders programı", p: "Haftalık program, sınav ve ödev tarihleri tek takvimde görünür. Hangi derse ne zaman girdiğini buradan bakarsın." , l: [] },
    { i: "📣", t: "Duyurular ve sınıf bilgisi", p: "Yönetimden gelen duyurular bildirimle ulaşır. Sınıf bilgisi ekranında öğretmenler, sınıf kuralları ve bu haftanın işlenen konuları durur.", l: [] },
    { i: "📝", t: "Notlar ve fotoğraflı not", p: "Ders notlarını paylaş, arkadaşlarınınkini oku, beğen.", l: [L("Özet ve kartlar", "uzun bir notu Mobi özetler ve ezber kartı yapar"), L("Fotoğraf ekle", "tahta ve defter fotoğrafını paylaşabilirsin")] },
    { i: "🎯", t: "Notlarım ve denemeler", p: "Yazılı notlarını gir, ortalamanı gör.", l: [L("Hedef puan", "kalan sınavlarda kaç alman gerektiğini hesaplar"), L("Gidişat", "notların düşüyorsa uyarır"), L("Deneme sonuçları", "ilerlemeni grafikle izle")] },
    { i: "⏱️", t: "Çalışma sayacı", p: "Çalışma süreni başlat, bitince kaydet. Hangi derse ne kadar çalıştığını ve serini görürsün.", l: [] },
    { i: "💬", t: "Soru-cevap, anket, doğum günleri", p: "Takıldığın soruyu sınıfa sor, arkadaşlar cevaplasın. Anketlerde oy ver. Doğum günleri gelince herkese hatırlatılır.", l: [L("Hocaya sorulacaklar", "derste sorulacak soruları topla, \"Ben de\" de"), L("Öneri kutusu", "Ayarlar'da isimsiz öneri yazabilirsin")] },
    { i: "🤖", t: "Mobi AI: yapay zeka arkadaşın", p: "Sağ alttaki Mobi düğmesi her ekranda seninle.", l: [L("Konu anlatır", "sade ve adım adım"), L("Fotoğraftan soru çözer", "kamera düğmesiyle sorunu gönder"), L("Sorusu bitmez", "ama günlük bir hakkı var"), L("Yanılabilir", "önemli şeyleri kitabından kontrol et")] },
    { i: "🧪", t: "Sınav Provası", p: "Mobi seçtiğin dersten ve konudan kısa bir prova hazırlar. Sonuçlar kaydedilir, zayıf konuların Bugün ekranında önerilir.", l: [] },
    { i: "🎭", t: "Eğlence köşesi", p: "Ders arası keyfi için Daha fazla menüsünde bir köşe var.", l: [L("Günün fen şakası", "Bugün ekranında da çıkar"), L("Neden oyunu", "saçma soru sor, Mobi hem güldürsün hem öğretsin"), L("Tekerleme atölyesi", "konuyu tekerleme, rap ya da maniye çevirir"), L("Konfeti", "tam puan ve biten ödevlerde kutlama. Ayarlar'dan kapatılır")] },
    { i: "🔔", t: "Bildirimler ve gizlilik", p: "Ayarlar'dan bildirimleri açıp kapatabilirsin. Notların, çalışma süren ve provaların yalnız sana özeldir, kimse göremez.", l: [] },
  ];
  const names = [];
  if (S.isAdmin) names.push("yönetici");
  if (!S.isAdmin && myPerms().length) names.push("görevli");
  if (names.length) {
    const ls = [];
    if (can("ann")) ls.push(L("Duyuru gönder", "bildirimle herkese ulaşır"));
    if (can("req")) ls.push(L("Kayıt başvuruları", "yeni arkadaşları onayla"));
    if (can("sched")) ls.push(L("Ders programı", "düzenle"));
    if (can("topic")) ls.push(L("İşlenen konular", "Mobi önerileri buna göre çıkar"));
    if (can("info") || can("cal")) ls.push(L("Sınıf bilgisi ve takvim", "güncel tut"));
    if (S.isAdmin) ls.push(L("Roller ve kullanıcılar", "kişilere görev ver"));
    if (ls.length) slides.splice(slides.length - 1, 0, { i: "🛠️", t: "Senin görevlerin", p: "Bu hesabın öğrenci özelliklerinin yanında ekstra yetkileri var. Hepsi “Daha fazla › Yönetim” altında.", l: ls });
  }
  slides.push({ i: "🎉", t: "Hazırsın!", p: "Turu istediğin zaman Ayarlar'dan yeniden izleyebilirsin. Başarılar!", l: [] });
  return slides;
}
const wl = { i: 0, slides: [] };
function wlKey() { return "odev-welcome-" + (S.user ? S.user.uid : ""); }
function wlRender() {
  const s = wl.slides[wl.i], n = wl.slides.length;
  $("wl-ico").textContent = s.i; $("wl-title").textContent = s.t; $("wl-text").textContent = s.p;
  const ul = $("wl-list"); ul.textContent = "";
  s.l.forEach((x) => { const li = document.createElement("li"); const b = document.createElement("b"); b.textContent = x[0]; li.appendChild(b); li.appendChild(document.createTextNode(": " + x[1])); ul.appendChild(li); });
  const d = $("wl-dots"); d.textContent = "";
  for (let k = 0; k < n; k++) { const sp = document.createElement("span"); if (k === wl.i) sp.className = "on"; d.appendChild(sp); }
  $("wl-back").style.visibility = wl.i ? "visible" : "hidden";
  $("wl-next").textContent = wl.i === n - 1 ? "Başla" : "İleri";
  $("wl-skip").hidden = wl.i === n - 1;
}
function openWelcome() { wl.slides = welcomeSlides(); wl.i = 0; $("welcome").hidden = false; wlRender(); $("wl-next").focus(); }
function closeWelcome() { $("welcome").hidden = true; if (S.user) lsSet(wlKey(), "1"); }
function maybeWelcome() { if (S.user && S.profile && !lsGet(wlKey())) openWelcome(); }
$("wl-next").addEventListener("click", () => { if (wl.i >= wl.slides.length - 1) closeWelcome(); else { wl.i++; wlRender(); } });
$("wl-back").addEventListener("click", () => { if (wl.i > 0) { wl.i--; wlRender(); } });
$("wl-skip").addEventListener("click", closeWelcome);
$("wl-again").addEventListener("click", openWelcome);

/* ---------- Yanlış defteri: yanlış yapılan sorular 1, 3 ve 7 gün sonra tekrar sorulur ---------- */
const WRONG_STEPS = [1, 3, 7];
function qHash(t) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
async function saveWrongs(quiz, picks) {
  const b = writeBatch(db); let n = 0;
  quiz.questions.forEach((x, i) => {
    if (picks[i] === x.answer) return;
    const id = qHash(quiz.subject + "|" + String(quiz.topic).toLowerCase() + "|" + x.q);
    b.set(doc(db, "users", S.user.uid, "wrong", id), { subject: quiz.subject.slice(0, 30), topic: quiz.topic.slice(0, 120), q: String(x.q).slice(0, 300), options: x.options.map((o) => String(o).slice(0, 150)), answer: x.answer, why: String(x.why || "").slice(0, 300), step: 0, due: nowMs() + 864e5, at: nowMs() });
    n++;
  });
  if (n) await b.commit();
}
const dueWrong = () => S.wrong.filter((w) => w.due <= nowMs()).sort((a, b) => a.due - b.due);
function wrongStart() {
  const due = dueWrong().slice(0, 5); if (!due.length) return;
  S.qz = { phase: "run", quiz: { subject: "Yanlış defteri", topic: "Tekrar", questions: due.map((w) => ({ q: w.q, options: w.options, answer: w.answer, why: w.why })) }, i: 0, picks: [], busy: false, review: due };
  setView("quiz"); renderQuiz();
}
async function reviewApply() {
  const b = writeBatch(db); let mastered = 0;
  S.qz.review.forEach((w, i) => {
    const ref = doc(db, "users", S.user.uid, "wrong", w.id);
    if (S.qz.picks[i] === S.qz.quiz.questions[i].answer) {
      const st = (w.step || 0) + 1;
      if (st >= WRONG_STEPS.length) { b.delete(ref); mastered++; } else b.update(ref, { step: st, due: nowMs() + WRONG_STEPS[st] * 864e5 });
    } else b.update(ref, { step: 0, due: nowMs() + 864e5 });
  });
  await b.commit(); return mastered;
}
function renderWrongBox() {
  const b = $("qz-wb"); if (!b) return; b.textContent = "";
  b.hidden = S.qz.phase !== "setup" || !S.wrong.length; if (b.hidden) return;
  const d = dueWrong().length;
  b.appendChild(el("b", "", "Yanlış defterin: " + S.wrong.length + " soru"));
  b.appendChild(el("p", "muted", d ? d + " sorunun tekrar zamanı geldi." : "Şimdilik tekrar zamanı gelen soru yok. Yanlışlarını 1, 3 ve 7 gün sonra yeniden sorarım."));
  if (d) { const g = el("button", "btn btn-primary btn-small", "Şimdi tekrar et (" + Math.min(5, d) + " soru)"); g.type = "button"; g.addEventListener("click", wrongStart); b.appendChild(g); }
}

/* ---------- Sınav hazırlık planı ---------- */
function planFor(x) {
  const left = dayDiff(x.date); if (!x.date || left < 1) return [];
  const N = Math.min(left, 7), exam = new Date(x.date + "T00:00:00");
  let topics = splitItems(x.topics); if (!topics.length) topics = [x.title || "Genel tekrar"];
  const weak = weakTopics().filter((w) => w.x.subject === x.subject).map((w) => String(w.x.topic).toLowerCase());
  const isW = (t) => weak.indexOf(t.toLowerCase()) >= 0;
  topics = topics.slice(0, 12).sort((a, b) => (isW(b) ? 1 : 0) - (isW(a) ? 1 : 0));
  const per = Math.ceil(topics.length / Math.max(1, N - 1)), days = [];
  for (let k = 0; k < N; k++) {
    const d = new Date(exam); d.setDate(d.getDate() - N + k);
    const date = dateStr(d), tasks = [];
    if (k < N - 1) {
      topics.slice(k * per, (k + 1) * per).forEach((t) => {
        tasks.push({ kind: "study", topic: t, text: t + (isW(t) ? " (zayıf konu)" : "") + ": konuyu çalış" });
        tasks.push({ kind: "quiz", topic: t, text: t + ": 5 soruluk prova çöz" });
      });
      if (!tasks.length) tasks.push({ kind: "review", text: "Notlarını ve ödevlerini gözden geçir" });
    } else {
      tasks.push({ kind: "quiz", topic: topics[0], text: "Genel tekrar: " + topics[0] + " konusundan prova çöz" });
      tasks.push({ kind: "review", text: "Yanlış defterini tekrar et" });
      tasks.push({ kind: "review", text: "Notlarına son bir göz at, erken yat" });
    }
    tasks.forEach((t, i) => { t.key = date + "|" + i; });
    days.push({ date, tasks });
  }
  return days;
}
async function planToggle(examId, key) {
  const set = new Set(S.plan[examId] || []);
  if (set.has(key)) set.delete(key); else set.add(key);
  S.plan[examId] = set;
  try { await setDoc(doc(db, "users", S.user.uid, "plan", examId), { done: Array.from(set).slice(-60) }); }
  catch (e) { toast("Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
  renderPlan(); renderMobiSuggest(); renderCal();
}
function planAction(t, x) {
  if (t.kind === "study") return ["Anlat", () => openAi("“" + t.topic + "” konusunu bana basitçe anlatır mısın?", (x.subject || "") + ": " + t.topic)];
  if (t.kind === "quiz") return ["Prova", () => { $("pl-panel").hidden = true; setView("quiz"); quizPrefill(x.subject, t.topic); }];
  if (/Yanlış defteri/.test(t.text) && S.wrong.length) return ["Aç", () => { $("pl-panel").hidden = true; setView("quiz"); }];
  return null;
}
S.plId = "";
function renderPlan() {
  const x = S.ex.find((e) => e.id === S.plId), box = $("pl-body"); box.textContent = "";
  if (!x) { box.appendChild(el("p", "muted", "Sınav bulunamadı.")); return; }
  const days = planFor(x), done = S.plan[x.id] || new Set();
  $("pl-title").textContent = (x.subject || "Sınav") + " hazırlık planı";
  const left = dayDiff(x.date);
  $("pl-sub").textContent = left > 7 ? "Sınava " + left + " gün var. Plan, sınavdan 7 gün önce başlar. Zayıf konuların öne alındı." : "Sınava " + left + " gün var. Zayıf konuların öne alındı.";
  if (!days.length) { box.appendChild(el("p", "muted", "Bu sınav için plan çıkarılamadı. Tarihi geçmiş olabilir.")); return; }
  days.forEach((d) => {
    const c = el("div", "pl-day" + (d.date === dateStr(nowD()) ? " today" : ""));
    c.appendChild(el("h4", "", (d.date === dateStr(nowD()) ? "Bugün · " : "") + fmtDay(d.date)));
    d.tasks.forEach((t) => {
      const r = el("div", "pl-task" + (done.has(t.key) ? " done" : ""));
      const ck = el("button", "pl-chk", done.has(t.key) ? "✓" : ""); ck.type = "button"; ck.setAttribute("aria-label", "Yaptım olarak işaretle"); ck.addEventListener("click", () => planToggle(x.id, t.key));
      r.appendChild(ck); r.appendChild(el("span", "", t.text));
      const a = planAction(t, x);
      if (a) { const g = el("button", "btn btn-quiet btn-small pl-go", a[0]); g.type = "button"; g.addEventListener("click", a[1]); r.appendChild(g); }
      c.appendChild(r);
    });
    box.appendChild(c);
  });
}
function fmtDay(ds) { const d = new Date(ds + "T00:00:00"); return d.getDate() + " " + MONTHS_LONG[d.getMonth()] + ", " + DAY_NAMES[d.getDay()]; }
function openPlan(x) { S.plId = x.id; $("pl-panel").hidden = false; renderPlan(); }
$("pl-close").addEventListener("click", () => { $("pl-panel").hidden = true; });

/* ---------- Bu haftanın özeti ---------- */
function renderWeek() {
  const box = $("td-week-body"); if (!box || !S.user) return; box.textContent = "";
  const now = nowMs(), wk = now - 7 * 864e5, today = dateStr(nowD());
  const hwDone = Object.keys(S.doneAt || {}).filter((id) => S.doneAt[id] >= wk).length;
  let study = 0; const d0 = nowD();
  for (let k = 0; k < 7; k++) { const d = new Date(d0); d.setDate(d.getDate() - k); const v = S.study[dateStr(d)]; if (v) study += v.min; }
  const qs = S.qzList.filter((x) => x.at >= wk), qn = qs.length, qa = qn ? Math.round((100 * qs.reduce((a, x) => a + x.score, 0)) / Math.max(1, qs.reduce((a, x) => a + x.total, 0))) : 0;
  const grid = el("div", "wk-grid");
  [[hwDone, "ödev yaptın"], [study >= 60 ? (Math.round(study / 6) / 10) + " sa" : study + " dk", "çalıştın"], [qn ? qn + " (%" + qa + ")" : "0", "prova"]].forEach((x) => { const c = el("div"); c.appendChild(el("b", "", String(x[0]))); c.appendChild(el("span", "", x[1])); grid.appendChild(c); });
  box.appendChild(grid);
  const lines = [];
  const ex = S.ex.filter((x) => x.date && dayDiff(x.date) >= 0 && dayDiff(x.date) <= 7).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const undone = S.hw.filter((h) => h.due && !isExpired(h.due) && !S.done.has(h.id) && dayDiff(h.due) <= 7).length;
  if (ex.length) lines.push("Önümüzdeki 7 günde " + ex.length + " sınav var: " + ex.slice(0, 3).map((x) => (x.subject || "Sınav") + " (" + (dayDiff(x.date) === 0 ? "bugün" : dayDiff(x.date) + " gün sonra") + ")").join(", ") + ".");
  if (undone) lines.push("Bu hafta bitmesi gereken " + undone + " ödevin var.");
  const wk2 = weakTopics().slice(0, 2); if (wk2.length) lines.push("Zayıf konular: " + wk2.map((w) => w.x.subject + " · " + w.x.topic).join(", ") + ".");
  const dw = dueWrong().length; if (dw) lines.push("Yanlış defterinde " + dw + " soru tekrar bekliyor.");
  if (!lines.length) lines.push("Önümüzdeki günler sakin görünüyor. Bir prova çözmek için iyi zaman.");
  lines.forEach((t) => box.appendChild(el("p", "wk-line", t)));
  const b = el("button", "btn btn-quiet btn-small", "Mobi yorumlasın"); b.type = "button";
  b.addEventListener("click", () => openAi("Haftalık özetim: " + hwDone + " ödev yaptım, " + study + " dakika çalıştım, " + qn + " prova çözdüm" + (qn ? " (ortalama %" + qa + ")" : "") + ". " + lines.join(" ") + " Gelecek hafta için bana kısa bir tavsiye verir misin?", "Haftalık özet"));
  box.appendChild(b);
}

/* ---------- Ortak ezber desteleri ---------- */
function renderDecks() {
  const box = $("nt-decks"); if (!box) return; box.textContent = "";
  $("nt-decks-box").hidden = !S.decks.length; if (!S.decks.length) return;
  S.decks.forEach((d) => {
    const r = el("div", "dk-row"), l = el("div");
    const t = el("b", "", d.title || "Deste"); l.appendChild(t);
    l.appendChild(el("small", "", (d.subject ? d.subject + " · " : "") + (Array.isArray(d.cards) ? d.cards.length : 0) + " kart · " + (d.author || "?")));
    r.appendChild(l);
    const o = el("button", "btn btn-primary btn-small", "Çalış"); o.type = "button"; o.addEventListener("click", () => openDeck(d)); r.appendChild(o);
    if (canModify(d)) r.appendChild(delButton("dk:" + d.id, () => deleteDoc(doc(db, "decks", d.id))));
    box.appendChild(r);
  });
}
function openDeck(d) {
  const cards = (Array.isArray(d.cards) ? d.cards : []).filter((c) => c && c.front && c.back);
  if (!cards.length) return;
  $("nc-panel").hidden = false; $("nc-title").textContent = String(d.title || "Deste").slice(0, 40);
  S.nc = { summary: d.summary || "", cards, order: cards.map((_, i) => i), known: new Set(), pos: 0, flip: false, share: null };
  ncRender();
}
async function shareDeck() {
  const st = S.nc; if (!st || !st.share || !S.canAdd) return;
  const btn = $("nc-body").querySelector(".nc-share"); if (btn) { btn.disabled = true; btn.textContent = "Paylaşılıyor…"; }
  try {
    await addDoc(collection(db, "decks"), { title: String(st.share.title || "Deste").slice(0, 80), subject: String(st.share.subject || "").slice(0, 30), summary: String(st.summary || "").slice(0, 900), cards: st.cards.slice(0, 12).map((c) => ({ front: String(c.front).slice(0, 200), back: String(c.back).slice(0, 320) })), author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
    st.share = null; toast("Deste sınıfla paylaşıldı.");
  } catch (e) { toast(e && e.code === "permission-denied" ? "Paylaşılamadı. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Paylaşılamadı. Biraz sonra tekrar dene."); if (btn) { btn.disabled = false; btn.textContent = "Sınıfla paylaş"; } return; }
  ncRender();
}

/* ---------- Soru-cevap: Mobi taslağı ---------- */
async function qaDraft(q) {
  if (S.qaDraft[q.id] && S.qaDraft[q.id].loading) return;
  S.qaDraft[q.id] = { loading: true }; renderQa();
  let status = 0, code = "", limit = 0, text = "";
  try {
    const t = await auth.currentUser.getIdToken();
    const ask = "Sınıf arkadaşım şu soruyu sordu (" + (q.subject || "ders") + "): " + String(q.title || "").slice(0, 150) + (q.body ? " — " + String(q.body).slice(0, 250) : "") + "\nBu soruya kısa, adım adım bir taslak cevap yaz. Emin olmadığın yeri açıkça söyle.";
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ messages: [{ role: "user", content: ask }], context: aiContext("Soru-cevap: " + (q.subject || "")) }) });
    status = r.status; let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.ok && j.text) text = j.text; else { code = j.error || ""; limit = j.limit || 0; }
  } catch (e) { status = 0; }
  S.qaDraft[q.id] = text ? { text } : { err: aiErr(status, code, limit) };
  renderQa();
}
async function qaPostDraft(q) {
  const d = S.qaDraft[q.id]; if (!d || !d.text || !S.canAdd) return;
  try {
    await addDoc(collection(db, "qa", q.id, "answers"), { text: ("Mobi taslağı (kontrol edin): " + d.text).slice(0, 1000), author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
    delete S.qaDraft[q.id]; if (!S.cmOpen.has("qa:" + q.id)) { S.cmOpen.add("qa:" + q.id); openThread("qa:" + q.id, ["qa", q.id, "answers"]); } toast("Taslak yanıt olarak eklendi.");
  } catch (e) { toast("Eklenemedi. Biraz sonra tekrar dene."); }
  renderQa();
}

/* ---------- Cahil AI: rehberli mod (yalnız "guide" görevi olan roller) ---------- */
const GD_NAME = "Cahil AI";
const isGuide = () => !!(S.profile && S.profile.guide === true);
const GD_VIEW = {
  today: ["Bugün ekranı", ["Üstte Mobi'nin önerileri var. Düğmelere dokunarak başla.", "Altta bugünkü derslerin ve yaklaşan ödevlerin görünür.", "\"Bu haftanın özeti\"ne dokunursan haftanı görürsün."]],
  hw: ["Ödev ekranı", ["Sağ üstteki \"+ Ödev ekle\"ye dokun.", "Dersi seç, başlığı yaz, son günü seç, kaydet.", "Ödevi bitirince kartın altındaki \"Yaptım\" düğmesine bas."]],
  ex: ["Sınav ekranı", ["\"+ Sınav ekle\" ile sınavı ekle.", "Kartın altındaki \"Hazırlık planı\" sana günlük çalışma planı çıkarır.", "Konuları bitirdikçe işaretle."]],
  cal: ["Takvim", ["Ödev ve sınav günleri burada görünür.", "Bir güne dokunursan o günün işleri açılır."]],
  sch: ["Ders programı", ["Hangi gün hangi ders olduğunu burada görürsün.", "\"Şimdi\" yazan ders şu an işlenen derstir."]],
  ann: ["Duyurular", ["Öğretmenden ve yönetimden gelen haberler burada.", "Okumadığın duyurunun yanında kırmızı sayı olur."]],
  more: ["Daha fazla menüsü", ["Burada notların, çalışma sayacın, Sınav Provası ve diğer her şey var.", "Bir satıra dokunarak o bölüme gidersin."]],
  grd: ["Notlarım", ["\"Not ekle\" ile yazılı notunu gir.", "Hedef puanını seç, sistem kaç alman gerektiğini hesaplar."]],
  nts: ["Ders notları", ["\"+ Not paylaş\" ile not ekle. Arkadaşların da görür.", "Uzun bir notta \"Özet ve kartlar\"a bas, Mobi özet ve ezber kartı çıkarır."]],
  tr: ["Denemeler", ["Deneme sınavı sonuçlarını girip ilerlemeni grafikte görürsün."]],
  study: ["Çalışma sayacı", ["Dersi seç, başlat, bitirince kaydet.", "Haftalık çalışma süreni burada görürsün."]],
  quiz: ["Sınav Provası", ["Dersi seç, konuyu yaz, \"Prova hazırla\"ya bas.", "Soruları cevapla. Yanlışların Yanlış defterine girer."]],
  qa: ["Soru-Cevap", ["Anlamadığın soruyu sınıfa sorabilirsin.", "Bir soruda \"Mobi taslağı\"na basarsan Mobi taslak cevap yazar."]],
  poll: ["Anketler", ["Bir ankete dokunup oyunu ver."]],
  info: ["Sınıf bilgisi", ["Öğretmenler, sınıf kuralları ve bu haftanın konuları burada."]],
  ask: ["Hocaya sorulacaklar", ["Sorunu yaz, \"Listeye ekle\"ye bas.", "Başkasının sorusunu da merak ediyorsan \"Ben de\"ye dokun.", "\"Listeyi kopyala\" ile soruları derse götürebilirsin."]],
  fun: ["Eğlence köşesi", ["Günün fen şakasını oku, \"Başka şaka\"ya bas.", "Saçma bir fen sorusu yaz, Mobi hem güldürür hem doğrusunu söyler.", "Konu yazıp tekerleme, rap ya da mani yaptır."]],
  set: ["Ayarlar", ["Bildirimleri buradan açıp kapatırsın.", "Uygulama turunu yeniden izleyebilirsin."]]
};
function gdBubble(text, cls) { const b = aiBubble(cls || "bot", text); return b; }
function gdHint(v) {
  const h = GD_VIEW[v] || GD_VIEW.today;
  return h[0] + " burası. " + h[1].map((x, i) => (i + 1) + ") " + x).join(" ");
}
function gdRender(extra) {
  const log = $("gd-log"); log.textContent = "";
  const first = (S.profile && S.profile.name ? S.profile.name.split(" ")[0] : "") || "";
  log.appendChild(gdBubble("Merhaba" + (first ? " " + first : "") + "! Ben " + GD_NAME + ". Takıldığın her yerde yanındayım, sorular normal. Konu anlatma, soru çözme ve prova işini Mobi AI'ya veririm, o bitirince ben devam ederim."));
  S.gd.msgs.forEach((m) => {
    const b = gdBubble(m.text, m.role === "user" ? "me" : "bot");
    if (m.by === "mobi") b.insertBefore(el("small", "gd-sub", "Mobi AI'ya devredildi"), b.firstChild);
    log.appendChild(b);
  });
  if (extra) log.appendChild(extra);
  log.scrollTop = log.scrollHeight;
}
function gdChips(list) {
  const box = $("gd-chips"); box.textContent = "";
  (list || []).forEach((c) => { const b = el("button", "", c[0]); b.type = "button"; b.addEventListener("click", c[1]); box.appendChild(b); });
}
function gdDefaultChips() {
  const out = [["Bu ekranda ne yapılır?", () => gdSay("Bu ekranda ne yapılır?", gdHint(S.view))],
    ["Prova çözmek istiyorum", gdAskQuiz], ["Bir konuyu öğrenmek istiyorum", gdAskLearn],
    ["Fotoğraftan soru çözdür", () => gdSay("Fotoğraftan soru çözdür", "Bunu Mobi AI yapıyor. Seni ona götürüyorum. Orada \"Fotoğraf\" düğmesine bas, sorunun net bir fotoğrafını seç ve gönder. Bitince ben devam ederim.", () => gdToMobi(null, "Fotoğraftaki soruyu çözmek için yardım isteyeceğim."))]];
  return out;
}
function gdSay(userText, botText, then) {
  S.gd.msgs.push({ role: "user", text: userText }); S.gd.msgs.push({ role: "assistant", text: botText });
  gdRender(); gdChips(gdDefaultChips()); if (then) setTimeout(then, 900);
}
function gdOpen() {
  closeAi(); $("gd-tip").hidden = true;
  $("gd-panel").hidden = false; gdRender(); gdChips(gdDefaultChips());
  if (!S.gd.msgs.length) { S.gd.msgs.push({ role: "assistant", text: gdHint(S.view) + "\nBaşka bir şey için aşağıdan seç ya da yaz." }); gdRender(); }
  setTimeout(() => $("gd-in").focus(), 60);
}
function gdClose() { $("gd-panel").hidden = true; }
function gdAskQuiz() {
  S.gd.msgs.push({ role: "user", text: "Prova çözmek istiyorum" });
  S.gd.msgs.push({ role: "assistant", text: "Olur! Prova işini Mobi AI hazırlıyor. Hangi konudan olsun? Aşağıdan seç ya da konuyu yaz (örn. Atom modelleri)." });
  gdRender();
  const opts = [];
  weakTopics().slice(0, 2).forEach((w) => opts.push([w.x.subject + " · " + w.x.topic + " (zayıf)", () => gdQuiz(w.x.subject, w.x.topic)]));
  Object.keys(S.topics || {}).slice(0, 2).forEach((sub) => { const t = S.topics[sub] && S.topics[sub].t; if (t) opts.push([sub + " · " + t, () => gdQuiz(sub, t)]); });
  S.ex.filter((x) => x.date && dayDiff(x.date) >= 0).slice(0, 1).forEach((x) => { const t = splitItems(x.topics)[0]; if (t) opts.push([(x.subject || "Sınav") + " · " + t, () => gdQuiz(x.subject, t)]); });
  gdChips(opts.slice(0, 4).concat([["Vazgeç", () => { gdRender(); gdChips(gdDefaultChips()); }]]));
  S.gd.wait = "quiz";
}
function gdAskLearn() {
  S.gd.msgs.push({ role: "user", text: "Bir konuyu öğrenmek istiyorum" });
  S.gd.msgs.push({ role: "assistant", text: "Tamam! Konu anlatmayı Mobi AI yapıyor. Hangi konuyu öğrenmek istiyorsun? Aşağıya yaz (örn. Newton'un 2. yasası)." });
  gdRender(); gdChips([["Vazgeç", () => { S.gd.wait = ""; gdRender(); gdChips(gdDefaultChips()); }]]);
  S.gd.wait = "learn"; $("gd-in").focus();
}
function gdSubjectOf(name) { const n = String(name || "").trim().toLocaleLowerCase("tr"); const f = SUBJECTS.find((x) => x.n.toLocaleLowerCase("tr") === n); return f ? f.n : ""; }
function gdQuiz(subject, topic) {
  S.gd.wait = ""; topic = String(topic || "").trim();
  if (topic.length < 2) { gdSay("Prova", "Hangi konudan prova çözmek istediğini yazar mısın?"); S.gd.wait = "quiz"; return; }
  const sub = gdSubjectOf(subject);
  S.gd.msgs.push({ role: "assistant", text: "Bunu Mobi AI'ya soruyorum: " + topic + " konusundan prova. O hazırlayıp sorduktan sonra ben devam edeceğim.", by: "mobi" });
  gdRender(); gdChips([]);
  setTimeout(() => { gdClose(); setView("quiz"); quizPrefill(sub || $("qz-sub").value, topic); quizStart(); }, 1000);
}
function gdToMobi(prompt, focus) {
  S.gd.msgs.push({ role: "assistant", text: "Mobi AI'ya geçiyorum. Bitince buraya dönmen için \"Cahil AI'ya dön\"e basabilirsin ya da Mobi'yi kapatman yeter.", by: "mobi" });
  gdRender(); gdChips([]);
  setTimeout(() => { gdClose(); openAi(prompt, "Cahil AI devretti. Öğrenci konuyu hiç bilmiyor, çok sade ve adım adım anlat. " + (focus || "")); }, 900);
}
function gdReturn(text, kinds, delay) {
  if (!isGuide()) return;
  setTimeout(() => {
    if (!$("ai-panel").hidden || !$("app") || $("app").hidden) return;
    S.gd.msgs.push({ role: "assistant", text });
    $("gd-panel").hidden = false; gdRender(); gdChips(S.gd.after || gdDefaultChips()); S.gd.after = null;
  }, delay == null ? 1200 : delay);
}
function gdAfterQuiz(topic, score, n, review) {
  const r = score / n;
  const msg = "Prova bitti: " + score + " / " + n + " doğru. " + (review ? "Yanlış defterindeki soruları tekrar ettin, bu çok iyi. " : r >= 0.8 ? "Harika, bu konuyu iyi biliyorsun. " : r >= 0.5 ? "Fena değil, birkaç yeri daha çalışalım. " : "Sorun değil, bu konu henüz oturmamış. Birlikte çalışacağız. ") + "Şimdi ne yapalım?";
  const chips = [];
  if (n - score > 0 && !review) chips.push(["Yanlışlarımı anlat (Mobi)", () => { gdToMobi("Az önceki provada " + topic + " konusunda " + (n - score) + " soruyu yanlış yaptım. Yanlış yaptığım yerleri basitçe anlatır mısın?", topic); }]);
  if (!review) chips.push(["Aynı konuda yeni prova", () => gdQuiz($("qz-sub").value, topic)]);
  chips.push(["Konuyu baştan anlat (Mobi)", () => gdToMobi("“" + topic + "” konusunu baştan, çok basit anlatır mısın?", topic)]);
  chips.push(["Başka iş", () => { gdRender(); gdChips(gdDefaultChips()); }]);
  S.gd.after = chips;
  gdReturn(msg, null);
  S.gd.afterTopic = topic;
}
function gdAfterMobi() {
  if (!isGuide() || !S.ai) return;
  const got = S.ai.msgs.slice(S.ai.openLen || 0).some((m) => m.role === "assistant");
  if (!got) { S.gd.after = null; return; }
  const last = S.ai.msgs.filter((m) => m.role === "user").pop();
  const topic = S.gd.afterTopic || (last ? last.content.replace(/[“”"]/g, "").slice(0, 60) : "");
  S.gd.after = [["Anladım, prova çözelim", () => gdAskQuiz()], ["Bir daha anlat (Mobi)", () => gdToMobi(null, "Bir önceki cevabı daha basit anlat.")],
    ["Başka iş", () => { gdRender(); gdChips(gdDefaultChips()); }]];
  S.ai.openLen = S.ai.msgs.length;
  gdReturn("Mobi anlattı. Anlamadığın yer kaldıysa söyle. Anladıysan bir prova ile kendini deneyebilirsin. Şimdi ne yapalım?", null, 400);
}
function gdSplitMarker(text) {
  const m = /\[\[MOBI:\s*([^\]]+?)\s*\]\]/i.exec(text || "");
  return { clean: String(text || "").replace(/\[\[MOBI:[^\]]*\]\]/gi, "").trim(), spec: m ? m[1].trim() : "" };
}
async function gdSend(text) {
  text = String(text || "").trim();
  if (!text || S.gd.busy || !auth.currentUser) return;
  $("gd-in").value = "";
  if (S.gd.wait === "learn") { S.gd.wait = ""; S.gd.msgs.push({ role: "user", text }); gdToMobi("“" + text + "” konusunu bana basitçe anlatır mısın?", text); S.gd.afterTopic = text; return; }
  if (S.gd.wait === "quiz") { S.gd.msgs.push({ role: "user", text }); const parts = text.split("|"); gdQuiz(parts.length > 1 ? parts[0] : "", parts.length > 1 ? parts[1] : text); return; }
  S.gd.busy = true; $("gd-send").disabled = true;
  S.gd.msgs.push({ role: "user", text });
  gdRender(gdBubble("Cahil AI düşünüyor…", "bot wait")); gdChips([]);
  let status = 0, code = "", limit = 0, reply = "";
  try {
    const t = await auth.currentUser.getIdToken();
    const hist = S.gd.msgs.slice(-8).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ persona: "guide", messages: hist, context: aiContext("Cahil AI: " + (AI_VIEW[S.view] || S.view)) }) });
    status = r.status; let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.ok && j.text) reply = j.text; else { code = j.error || ""; limit = j.limit || 0; }
  } catch (e) { status = 0; }
  S.gd.busy = false; $("gd-send").disabled = false;
  if (!reply) { S.gd.msgs.pop(); gdRender(aiBubble("err", aiErr(status, code, limit).replace(/Mobi/g, GD_NAME))); gdChips(gdDefaultChips()); $("gd-in").value = text; return; }
  const sp = gdSplitMarker(reply);
  S.gd.msgs.push({ role: "assistant", text: sp.clean || "Tamam." });
  gdRender(); gdChips(gdDefaultChips());
  if (sp.spec) {
    const q = /^PROVA\s*\|\s*([^|]*)\|\s*(.+)$/i.exec(sp.spec);
    if (q) { S.gd.afterTopic = q[2]; gdQuiz(q[1], q[2]); } else { S.gd.afterTopic = ""; gdToMobi(sp.spec, ""); }
  }
}
function gdPeek(v) {
  if (!isGuide() || !S.gd || S.gd.seen[v] || $("app").hidden) return;
  S.gd.seen[v] = 1;
  const h = GD_VIEW[v]; if (!h) return;
  const tip = $("gd-tip"); tip.textContent = h[0] + ": " + h[1][0] + " Takılırsan bana dokun.";
  tip.hidden = false; $("gd-fab").classList.remove("pulse"); void $("gd-fab").offsetWidth; $("gd-fab").classList.add("pulse");
  clearTimeout(S.gd.tipT); S.gd.tipT = setTimeout(() => { tip.hidden = true; }, 9000);
}
$("set-guide").addEventListener("change", async function () {
  const on = this.checked;
  try { await updateDoc(doc(db, "users", S.user.uid), { guide: on }); setMsg("guide-msg", on ? "Cahil AI açıldı. Sol altta düğmesi var." : "Cahil AI kapatıldı.", true); if (!on) { S.gd.msgs = []; S.gd.seen = {}; } }
  catch (e) { this.checked = !on; setMsg("guide-msg", "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
});
$("gd-fab").addEventListener("click", gdOpen);
$("gd-tip").addEventListener("click", gdOpen);
$("gd-close").addEventListener("click", gdClose);
$("gd-form").addEventListener("submit", (ev) => { ev.preventDefault(); gdSend($("gd-in").value); });
$("gd-in").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); gdSend($("gd-in").value); } });
$("ai-back-b").addEventListener("click", () => { closeAi(); gdAfterMobi(); if (!S.gd.after || $("gd-panel").hidden) setTimeout(() => { if ($("gd-panel").hidden) gdOpen(); }, 500); });

/* ---------- Eğlence köşesi ---------- */
const FUN_JOKES = [
  "Atomlara asla güvenme. Her şeyi onlar uyduruyor.",
  "Sodyum ile klor evlenince ne olmuş? Sofralara tuz olmuşlar.",
  "Elektron neden hep ters ters bakar? Çünkü yükü negatif.",
  "Mol neden hiç yalnız kalmaz? Avogadro sayısı kadar arkadaşı var.",
  "Karbon neden herkesle arkadaş? Dört eli var, hepsi açık.",
  "Hidrojen oksijene ne demiş? \"Seninle iki kere iyi oluruz.\" (H₂O)",
  "Yer çekimine yakalanan ne demiş? \"Sana bir kez düştüm, çıkamıyorum.\"",
  "Su neden ödevini yapmaz? Hep akışına bırakıyor.",
  "Buz neden sınavda sakin? Çünkü soğukkanlı.",
  "Ağaç neden iyi öğrenci? Köklü bilgi sahibi.",
  "Mitokondri neden hiç dinlenmez? Hücrenin güç santrali, mesai bitmez.",
  "Hücre zarı neden iyi güvenlik görevlisi? Kimi içeri alacağını çok iyi biliyor.",
  "DNA evden çıkmaz, RNA postacılık yapar. Bu işte iş bölümü var.",
  "Mıknatıs neden popüler? Çekiciliği var.",
  "Vitamin neden hep takım halinde? Çünkü ABCD diye başlıyor.",
  "Kaynayan su neden stresli? Yüz dereceye gelince kendini tutamıyor.",
  "Enerji korunumu: ders çalışma isteği yoktan var olmaz, yok da olmaz, sadece sınavdan önce dönüşür.",
  "Mutlak sıfır nedir? Pazartesi sabahı motivasyonum.",
  "Işık saniyede 300.000 km gider. Ders zili çalınca sınıftan çıkan öğrenci yarışa katılır.",
  "Termodinamiğin ikinci yasası: odanın düzeni kendiliğinden bozulur. Evet, annemin haklı olduğu yer burası.",
  "Mikroskop öğretmene ne demiş? \"Küçük detayları görüyorum hocam.\"",
  "Balina neden iyi öğrenci? Konuların derinine iniyor.",
  "Fotosentez yapan bitki öğrenciye ne demiş? \"Ben güneşle besleniyorum, sen de arada kitapla beslen.\"",
  "Kimyager neden her zaman sakin? Çünkü her şeye bir tepkisi hazır, ama kimse onu kızdıramaz.",
  "Newton elma düşünce bilim yapmış. Ben kalem düşürünce sadece eğiliyorum.",
  "Sürtünme neden hep bahaneci? \"Ben olmasam hiçbir şey durmazdı\" diyor.",
  "Hız ile ivme kavga etmiş. Zaman hakemlik yapmış, ikisi de değişmiş.",
  "Bulut neden iyi arkadaş? Gerektiğinde yanında yağar."
];
const funOn = (k) => lsGet("odev-fun-" + k) !== "0";
S.jokeShift = 0;
function jokeOfDay(shift) { const d = nowD(); const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); return FUN_JOKES[(n + (shift || 0)) % FUN_JOKES.length]; }
function renderJoke() {
  const t = jokeOfDay(S.jokeShift), on = funOn("joke");
  if ($("td-joke")) { $("td-joke").hidden = !on; $("td-joke-t").textContent = t; }
  if ($("fn-joke")) $("fn-joke").textContent = t;
}
const CHEER = {
  quiz: ["Tam puan! Beyin bugün turbo modda 🚀", "Hepsi doğru! Ders kitabı seni korkuyla izliyor 😎", "Yüzde yüz! Bu konu artık senden korkuyor 🏆"],
  hw: ["Bütün ödevler bitti! Hakkını verdin, helal olsun 🎉", "Ödev kalmadı! Bugün canavar gibisin 🦖", "Liste tertemiz! Şimdi biraz dinlen, hak ettin 🛋️"],
  streak: ["{n} gün üst üste çalıştın! Çalışma sayacı sana şapka çıkarıyor 🎩", "{n} günlük seri! Disiplin diye buna denir 🔥", "{n} gün! Motivasyon gelmeyi bıraktı, sen yine de çalıştın 💪"],
  mastered: ["{n} soru kalıcı öğrenildi, defterden çıktı. Güle güle yanlışlar 👋", "{n} yanlışı yendin! Artık bu sorular senden kaçıyor 🏃"]
};
function confetti() {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let c = $("cf"); if (!c) { c = document.createElement("canvas"); c.id = "cf"; c.setAttribute("aria-hidden", "true"); document.body.appendChild(c); }
  const W = (c.width = window.innerWidth), H = (c.height = window.innerHeight), x = c.getContext("2d");
  const cols = ["#E5484D", "#F5A623", "#2E9E6B", "#2F6FDE", "#9B59B6", "#F2C94C"];
  const ps = Array.from({ length: 90 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.62, vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 9, r: 4 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4 }));
  const t0 = performance.now();
  (function f(t) {
    x.clearRect(0, 0, W, H);
    ps.forEach((p) => { p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); x.restore(); });
    if (t - t0 < 2400) requestAnimationFrame(f); else { x.clearRect(0, 0, W, H); c.remove(); }
  })(t0);
}
function celebrate(kind, n) {
  if (!funOn("confetti")) return;
  const a = CHEER[kind]; if (!a) return;
  toast(a[Math.floor(Math.random() * a.length)].replace("{n}", String(n || "")));
  confetti();
}
function hwAllDone(justId) {
  const act = S.hw.filter((h) => h.due && !isExpired(h.due));
  return act.length >= 2 && act.every((h) => h.id === justId || S.done.has(h.id));
}
function studyStreakNow() { const t = todayStr(); let n = 1, i = 1; while (i < 70 && studyMin(addDays(t, -i)) > 0) { n++; i++; } return n; }

async function aiSimple(body) {
  let status = 0, code = "", limit = 0;
  try {
    const t = await auth.currentUser.getIdToken();
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify(body) });
    status = r.status; let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.ok && j.text) return { text: j.text };
    code = j.error || ""; limit = j.limit || 0;
  } catch (e) { status = 0; }
  return { err: status === 400 ? "Bu çok kısa ya da uygun değil. Biraz daha açık yaz." : status === 502 ? "Mobi bu sefer bir şey yazamadı. Tekrar dene." : aiErr(status, code, limit) };
}
// Neden oyunu
["Gökyüzü kırmızı olsaydı ne olurdu?", "Neden kuşlar elektrik tellerinde çarpılmıyor?", "Buz neden sıcak suyu daha çabuk dondurabilir?", "Neden soğan doğrarken ağlarız?"].forEach((q) => {
  const b = el("button", "chip plain", q); b.type = "button"; b.style.cursor = "pointer"; b.addEventListener("click", () => { $("fn-why-q").value = q; $("fn-why-go").click(); }); $("fn-why-sugg").appendChild(b);
});
$("fn-why-go").addEventListener("click", async () => {
  const q = $("fn-why-q").value.replace(/\s+/g, " ").trim();
  if (q.length < 8) { setMsg("fn-why-msg", "Biraz daha uzun bir soru yaz."); return; }
  setMsg("fn-why-msg", ""); const out = $("fn-why-out"), btn = $("fn-why-go");
  btn.disabled = true; btn.textContent = "Mobi düşünüyor…"; out.hidden = true;
  const r = await aiSimple({ mode: "why", question: q });
  btn.disabled = false; btn.textContent = "Mobi'ye sor";
  if (r.err) { setMsg("fn-why-msg", r.err); return; }
  out.textContent = ""; String(r.text).split(/\n+/).forEach((l) => { if (l.trim()) { const p = el("p", "", l.trim()); if (/^Gerçek cevap:/i.test(l.trim())) p.style.fontWeight = "700"; out.appendChild(p); } });
  out.hidden = false;
});
// Tekerleme / rap / mani
function openRhyme(req) {
  $("nc-panel").hidden = false; $("nc-title").textContent = (req.form === "rap" ? "Rap" : req.form === "mani" ? "Mani" : "Tekerleme") + ": " + String(req.title).slice(0, 30);
  S.nc = { loading: true }; ncRender();
  aiSimple({ mode: "rhyme", title: req.title, subject: req.subject || "", text: String(req.text || "").slice(0, 1500), form: req.form }).then((r) => {
    if ($("nc-panel").hidden) return;
    S.nc = r.err ? { err: r.err } : { rhyme: true, req, text: r.text }; ncRender();
  });
}
$("fn-rh-go").addEventListener("click", () => {
  const t = $("fn-rh-t").value.replace(/\s+/g, " ").trim();
  if (t.length < 2) { setMsg("fn-rh-msg", "Önce bir konu yaz."); return; }
  setMsg("fn-rh-msg", ""); openRhyme({ title: t, subject: $("fn-rh-sub").value, form: $("fn-rh-form").value });
});
fillSubjectSelect("fn-rh-sub");
// Bahane jeneratörü (şaka)
const EX_WHO = ["Kedim", "Köpeğim", "Dedemin papağanı", "Robot süpürge", "Modemimiz", "Kardeşimin hamsteri", "Buzdolabının ışığı", "Evdeki tost makinesi", "Komşunun horozu", "Uzaylılar", "Zaman yolcusu amcam", "Sihirli kalem kutum"];
const EX_DO = ["defterimi yedi", "defterimi okumaya başlayınca bırakmadı", "ödevimi kendi ödevi sandı", "ödevimi çözüp yanlış sınıfa gönderdi", "sayfayı katlayıp kâğıt uçak yaptı", "ödevimi sonsuza dek \"yükleniyor\" ekranında bıraktı", "tam kaydedecekken fişi çekti", "ödevimi o kadar beğendi ki sergiye gönderdi", "defterime mors alfabesiyle ders notu yazdı", "ödevim için toplantı çağırdı ama kimse gelmedi", "kâğıdı alıp ders çalışmaya gitti", "sayfaları sayıp 'eksik var' diye şikâyet etti"];
function makeExcuse() {
  const w = EX_WHO[Math.floor(Math.random() * EX_WHO.length)], d = EX_DO[Math.floor(Math.random() * EX_DO.length)];
  return "Hocam, ödevimi " + w.toLocaleLowerCase("tr") + " " + d + ". (İnandırıcılık: %" + (3 + Math.floor(Math.random() * 20)) + ", bilimsel olarak ölçülmedi.)";
}
$("fn-ex-go").addEventListener("click", () => { $("fn-ex-out").textContent = makeExcuse(); });
$("fn-ex-hw").addEventListener("click", () => setView("hw"));
$("fn-joke-next").addEventListener("click", () => { S.jokeShift++; renderJoke(); });
// Ayarlar
$("set-confetti").checked = funOn("confetti"); $("set-joke").checked = funOn("joke");
$("set-confetti").addEventListener("change", function () { lsSet("odev-fun-confetti", this.checked ? "1" : "0"); if (this.checked) celebrate("quiz"); });
$("set-joke").addEventListener("change", function () { lsSet("odev-fun-joke", this.checked ? "1" : "0"); renderJoke(); });
$("set-mstyle").addEventListener("change", async function () {
  const v = this.value;
  try { await updateDoc(doc(db, "users", S.user.uid), { mstyle: v }); setMsg("fun-msg", v ? "Mobi artık bu tarzda konuşacak." : "Mobi normal tarza döndü.", true); }
  catch (e) { this.value = (S.profile && S.profile.mstyle) || ""; setMsg("fun-msg", "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
});


/* ---------- Hocaya sorulacaklar ---------- */
fillSubjectSelect("ask-sub", "Ders (isteğe bağlı)");
const askVotes = (a) => (Array.isArray(a.votes) ? a.votes.length : 0);
function askRow(a) {
  const uid = S.user.uid, voted = Array.isArray(a.votes) && a.votes.indexOf(uid) >= 0;
  const r = el("div", "ask-row" + (a.done ? " done" : ""));
  const v = el("button", "ask-vote"); v.type = "button"; v.setAttribute("aria-pressed", voted ? "true" : "false");
  v.appendChild(el("b", "", String(askVotes(a)))); v.appendChild(el("span", "", voted ? "Ben de ✓" : "Ben de"));
  v.addEventListener("click", () => updateDoc(doc(db, "asks", a.id), { votes: voted ? arrayRemove(uid) : arrayUnion(uid) }).catch(() => toast("Oy kaydedilemedi.")));
  r.appendChild(v);
  const m = el("div", "ask-main"), top = el("div", "top");
  if (a.subject) top.appendChild(subjectChip(a.subject));
  if (a.done) top.appendChild(el("span", "chip good", "Soruldu"));
  m.appendChild(top); m.appendChild(el("p", "", a.text));
  const meta = el("div", "meta"), who = el("span", "", "Ekleyen: "); who.appendChild(el("span", "who", a.author || "?")); meta.appendChild(who);
  if (can("mod")) { const d = el("button", "lnk", a.done ? "Tekrar aç" : "Soruldu işaretle"); d.type = "button"; d.addEventListener("click", () => updateDoc(doc(db, "asks", a.id), { done: !a.done }).catch(() => toast("Kaydedilemedi."))); meta.appendChild(d); }
  if (canModify(a)) meta.appendChild(delButton("ask:" + a.id, () => deleteDoc(doc(db, "asks", a.id))));
  m.appendChild(meta); r.appendChild(m);
  return r;
}
function renderAsks() {
  const box = $("ask-list"); if (!box || !S.user) return; box.textContent = "";
  if (!S.asks.length) { box.appendChild(emptyBox("Henüz soru yok", "Hocaya sormak istediğin ilk soruyu sen ekle.")); return; }
  const open = S.asks.filter((a) => !a.done).sort((a, b) => askVotes(b) - askVotes(a) || (b.createdAt || 0) - (a.createdAt || 0));
  open.concat(S.asks.filter((a) => a.done)).forEach((a) => box.appendChild(askRow(a)));
}
$("ask-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const t = $("ask-t").value.replace(/\s+/g, " ").trim();
  if (t.length < 3) { setMsg("ask-msg", "Sorunu biraz daha açık yaz."); return; }
  if (!S.canAdd) { setMsg("ask-msg", "Şu an soru ekleyemiyorsun. Yöneticine yaz."); return; }
  setMsg("ask-msg", ""); $("ask-go").disabled = true;
  try { await addDoc(collection(db, "asks"), { text: t.slice(0, 150), subject: $("ask-sub").value, author: S.profile.name, uid: S.user.uid, createdAt: nowMs(), votes: [S.user.uid], done: false }); $("ask-t").value = ""; toast("Listeye eklendi."); }
  catch (e) { setMsg("ask-msg", e && e.code === "permission-denied" ? "Eklenemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Eklenemedi. Biraz sonra tekrar dene."); }
  $("ask-go").disabled = false;
});
$("ask-copy").addEventListener("click", async () => {
  const open = S.asks.filter((a) => !a.done).sort((a, b) => askVotes(b) - askVotes(a));
  if (!open.length) { toast("Kopyalanacak soru yok."); return; }
  const txt = "Hocaya sorulacaklar:\n" + open.map((a, i) => (i + 1) + ". " + (a.subject ? "(" + a.subject + ") " : "") + a.text + " [" + askVotes(a) + " kişi]").join("\n");
  try { await navigator.clipboard.writeText(txt); toast("Liste kopyalandı."); } catch (e) { toast("Kopyalanamadı."); }
});

/* ---------- Anonim öneri kutusu ---------- */
const FB_KIND = { oneri: "Öneri", sorun: "Sorun", tesekkur: "Teşekkür" };
$("fb-go").addEventListener("click", async () => {
  const t = $("fb-t").value.replace(/\s+/g, " ").trim();
  if (t.length < 5) { setMsg("fb-msg", "Biraz daha uzun yaz."); return; }
  $("fb-go").disabled = true; setMsg("fb-msg", "");
  try { await addDoc(collection(db, "feedback"), { text: t.slice(0, 500), kind: $("fb-kind").value, createdAt: nowMs() }); $("fb-t").value = ""; setMsg("fb-msg", "Teşekkürler, isimsiz gönderildi.", true); }
  catch (e) { setMsg("fb-msg", e && e.code === "permission-denied" ? "Gönderilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Gönderilemedi. Biraz sonra tekrar dene."); }
  $("fb-go").disabled = false;
});
function renderFb() {
  if (!S.isAdmin) return;
  $("n-fb").textContent = String(S.fb.length);
  const box = $("fb-list"); if (!box) return; box.textContent = "";
  if (!S.fb.length) { box.appendChild(emptyBox("Henüz öneri yok", "Öğrenciler Ayarlar'daki Öneri kutusundan isimsiz yazabilir.")); return; }
  S.fb.forEach((f) => {
    const r = el("div", "urow"), top = el("div", "u-top");
    top.appendChild(el("span", "chip " + (f.kind === "sorun" ? "crit" : f.kind === "tesekkur" ? "good" : "plain"), FB_KIND[f.kind] || "Öneri"));
    top.appendChild(el("span", "u-mail", agoText(f.createdAt)));
    r.appendChild(top); r.appendChild(el("p", "", f.text));
    const act = el("div", "u-act"); act.appendChild(delButton("fb:" + f.id, () => deleteDoc(doc(db, "feedback", f.id)))); r.appendChild(act);
    box.appendChild(r);
  });
}

/* ---------- Sınav sonrası: Neden kaçırdım? ---------- */
const MISS_REASONS = [["calismadim", "Yeterince çalışmadım"], ["panik", "Heyecanlandım, panik oldum"], ["sure", "Süre yetmedi"], ["anlamadim", "Konuyu anlamamıştım"], ["dikkat", "Dikkatsizlik yaptım"]];
const MISS_LBL = { calismadim: "yeterince çalışamadım", panik: "heyecanlandım", sure: "süre yetmedi", anlamadim: "konuyu anlayamadım", dikkat: "dikkatsizlik yaptım", diger: "zorlandım" };
const MISS_ADVICE = {
  calismadim: "Planlı çalışmak işe yarar. Sınav eklersen \"Hazırlık planı\" günlere bölüp sana küçük görevler verir.",
  panik: "Heyecan çok normal. Önceden prova çözmek sınav havasına alıştırır. Sınavda derin bir nefes al, kolay sorulardan başla.",
  sure: "Prova çözerken zamanı tut. Takıldığın soruyu işaretleyip geç, sonra dönersin.",
  anlamadim: "O zaman konuyu baştan, sade bir şekilde öğrenelim. Mobi'ye anlattırabilirsin.",
  dikkat: "Dikkat hataları Yanlış defterinde toplanır. Cevabı vermeden önce soruyu bir kez daha oku."
};
S.ms = null;
function msRender() {
  const box = $("ms-body"), st = S.ms; box.textContent = ""; if (!st) return;
  const chips = (list) => { const c = el("div", "ai-chips"); list.forEach((x) => { const b = el("button", "", x[0]); b.type = "button"; b.addEventListener("click", x[1]); c.appendChild(b); }); box.appendChild(c); };
  if (st.step === 1) {
    box.appendChild(aiBubble("bot", st.subject + " sınavın " + st.score + " çıktı, hedefinin altında. Sorun değil, nedenini bulalım. Hangi konuda zorlandın?"));
    chips(st.topics.map((t) => [t, () => { st.topic = t; st.step = 2; msRender(); }]).concat([["Hatırlamıyorum", () => { st.topic = ""; st.step = 2; msRender(); }]]));
    const f = el("form", "ai-form"); f.noValidate = true;
    const inp = el("input"); inp.type = "text"; inp.maxLength = 100; inp.placeholder = "Başka bir konu yaz…"; inp.setAttribute("aria-label", "Başka bir konu yaz"); inp.style.flex = "1";
    const g = el("button", "btn btn-quiet btn-small", "Tamam"); g.type = "submit"; f.appendChild(inp); f.appendChild(g);
    f.addEventListener("submit", (ev) => { ev.preventDefault(); const v = inp.value.replace(/\s+/g, " ").trim(); if (v.length < 2) return; st.topic = v.slice(0, 100); st.step = 2; msRender(); });
    box.appendChild(f);
  } else if (st.step === 2) {
    box.appendChild(aiBubble("me", st.topic || "Hatırlamıyorum"));
    box.appendChild(aiBubble("bot", "Peki bunun sebebi neydi?"));
    chips(MISS_REASONS.map((x) => [x[1], () => msSave(x[0])]));
  } else {
    box.appendChild(aiBubble("me", MISS_REASONS.find((x) => x[0] === st.reason)[1]));
    box.appendChild(aiBubble("bot", MISS_ADVICE[st.reason] + (st.topic ? " Bu konuyu Bugün ekranında sana önereceğim." : "")));
    const acts = [];
    if (st.topic) { acts.push(["Bu konudan prova çöz", () => { $("ms-panel").hidden = true; setView("quiz"); quizPrefill(st.subject, st.topic); }]); acts.push(["Konuyu anlat (Mobi)", () => { $("ms-panel").hidden = true; openAi("“" + st.topic + "” konusunu bana basitçe anlatır mısın? Son sınavımda zorlandım.", st.subject + ": " + st.topic); }]); }
    acts.push(["Kapat", () => { $("ms-panel").hidden = true; }]);
    chips(acts);
  }
  box.scrollTop = box.scrollHeight;
}
async function msSave(reason) {
  const st = S.ms; if (!st) return; st.reason = reason; st.step = 3; msRender();
  try { await addDoc(collection(db, "users", S.user.uid, "misses"), { subject: st.subject.slice(0, 30), topic: (st.topic || "").slice(0, 120), reason, score: st.score, at: nowMs() }); }
  catch (e) { toast("Cevabın kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
}
function askMiss(subject, score, examTopics) {
  const topics = [];
  const lastEx = S.ex.filter((x) => x.subject === subject && x.date).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  (examTopics || []).concat(lastEx ? splitItems(lastEx.topics) : [], S.topics && S.topics[subject] ? [S.topics[subject].t] : [], weakTopics().filter((w) => w.x.subject === subject).map((w) => w.x.topic)).forEach((t) => { t = String(t || "").trim(); if (t && topics.indexOf(t) < 0 && topics.length < 5) topics.push(t); });
  S.ms = { subject, score, topics, step: 1, topic: "", reason: "" };
  $("ms-panel").hidden = false; msRender();
}
$("ms-close").addEventListener("click", () => { $("ms-panel").hidden = true; S.ms = null; });
function recentMisses() {
  const t = nowMs() - 21 * 864e5, seen = new Set(), out = [];
  S.misses.forEach((m) => { if (m.at < t || !m.topic) return; const k = m.subject + "|" + m.topic.toLowerCase(); if (seen.has(k) || recentGood(m.subject, m.topic)) return; seen.add(k); out.push(m); });
  return out;
}

/* ---------- Telefona ekle rehberi ---------- */
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
const platformOf = () => { const u = navigator.userAgent || ""; if (/iPhone|iPad|iPod/i.test(u) || (/Macintosh/i.test(u) && navigator.maxTouchPoints > 1)) return "ios"; if (/Android/i.test(u)) return "android"; return "other"; };
function installSteps() {
  const p = platformOf();
  if (p === "ios") return "1) Bu sayfayı Safari'de aç (başka tarayıcıda olmaz). 2) Alttaki Paylaş düğmesine (kare ve ok) dokun. 3) Aşağı kaydırıp \"Ana Ekrana Ekle\"ye bas. 4) Sağ üstte \"Ekle\"ye dokun. Artık uygulama gibi açılır. iPhone'da bildirimler yalnızca ana ekrana eklenince çalışır.";
  if (p === "android") return "1) Chrome'da sağ üstteki üç noktaya dokun. 2) \"Uygulamayı yükle\" ya da \"Ana ekrana ekle\"ye bas. 3) \"Yükle\"ye dokun. Aşağıda Yükle düğmesi çıkarsa onunla da olur.";
  return "Adres çubuğunun sağındaki yükle simgesine bas ya da tarayıcı menüsünden \"Uygulamayı yükle\"yi seç. Telefonundan açıp oradan eklemen daha iyi olur.";
}
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; renderInstall(); });
window.addEventListener("appinstalled", () => { installPrompt = null; renderInstall(); });
async function doInstall() { if (!installPrompt) return; try { installPrompt.prompt(); await installPrompt.userChoice; } catch (e) {} installPrompt = null; renderInstall(); }
function renderInstall() {
  const sa = isStandalone();
  if ($("td-install")) {
    $("td-install").hidden = sa || lsGet("odev-install-hide") === "1";
    $("td-install-t").textContent = installSteps(); $("td-install-go").hidden = !installPrompt;
  }
  if ($("set-install-t")) { $("set-install-t").textContent = sa ? "Uygulama zaten ana ekranına eklenmiş. Süper!" : installSteps(); $("set-install-go").hidden = sa || !installPrompt; }
}
$("td-install-go").addEventListener("click", doInstall);
$("set-install-go").addEventListener("click", doInstall);
$("td-install-hide").addEventListener("click", () => { lsSet("odev-install-hide", "1"); renderInstall(); });

/* ---------- Takvimde hazırlık planı ---------- */
function planDayMap() {
  const m = {};
  S.ex.forEach((x) => {
    const done = S.plan[x.id] || new Set();
    planFor(x).forEach((d) => d.tasks.forEach((t) => { (m[d.date] = m[d.date] || []).push({ x, t, done: done.has(t.key) }); }));
  });
  return m;
}
/* ---------- Bakım modu ---------- */
const MAINT_DEFAULT = "Uygulamayı güncelliyoruz. Birazdan tekrar dene.";
S.maint = { on: false, msg: MAINT_DEFAULT };
function setMaint(d) { S.maint = { on: !!(d && d.maint === true), msg: String((d && d.maintMsg) || "").trim().slice(0, 200) || MAINT_DEFAULT }; }
function renderMaint() {
  const bar = $("maint-bar"); if (bar) bar.hidden = !(S.maint.on && S.isAdmin);
  if ($("m-maint")) { $("m-maint").checked = S.maint.on; if (document.activeElement !== $("m-maint-msg")) $("m-maint-msg").value = S.maint.msg === MAINT_DEFAULT ? "" : S.maint.msg; }
  if (!S.profile) return;
  if (S.maint.on && !S.isAdmin) { $("maint-msg").textContent = S.maint.msg; show("maint"); }
  else if (!$("maint").hidden) { show("app"); }
}
async function saveMaint(on) {
  const msg = $("m-maint-msg").value.replace(/\s+/g, " ").trim().slice(0, 200);
  try { await setDoc(doc(db, "config", "public"), { maint: on, maintMsg: msg, updatedAt: nowMs() }, { merge: true }); setMsg("m-maint-st", on ? "Bakım modu açık. Öğrenciler bakım ekranını görüyor." : "Bakım modu kapatıldı. Herkes uygulamaya dönebilir.", true); return true; }
  catch (e) { setMsg("m-maint-st", "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); return false; }
}
$("m-maint").addEventListener("change", async function () {
  const on = this.checked;
  if (on && !window.confirm("Bakım modunu açınca yönetici dışındaki herkes uygulamayı göremez. Açılsın mı?")) { this.checked = false; return; }
  if (!(await saveMaint(on))) this.checked = !on;
});
$("m-maint-save").addEventListener("click", () => saveMaint($("m-maint").checked));
$("maint-out").addEventListener("click", doLogout);
/* ---------- Genel görünüm ---------- */
function renderChrome() {
  if ($("set-guide")) $("set-guide").checked = isGuide();
  if ($("set-mstyle")) $("set-mstyle").value = (S.profile && S.profile.mstyle) || "";
  $("who").textContent = ((S.profile && S.profile.name) || "").trim().split(/\s+/)[0]; // başlıkta sadece ilk ad
  const rn = S.isAdmin ? "Yönetici" : (S.profile && S.profile.roleName) || "";
  $("role-chip").textContent = rn; $("role-chip").hidden = !rn;
  $("more-adm").hidden = !(S.isAdmin || admAccess());
  renderAdmTabs();
  S.canAdd = !S.profile || S.profile.canAdd !== false;
  $("noadd").hidden = S.canAdd;
  ["hw-add", "ex-add", "ev-add", "nt-add", "qa-add", "poll-add"].forEach((id) => { $(id).hidden = !S.canAdd; });
  if (S.view === "adm" && !(S.isAdmin || admAccess())) setView("more");
  syncSettings();
}
function renderAll() {
  renderHw(); renderEx(); renderSch(); renderAnn(); renderCal(); renderGrades(); renderNotes(); renderBadges();
  renderToday(); renderTrials(); renderStudy(); renderQa(); renderPolls(); renderInfo();
}
const NAV_GROUP = { ask: "more", fun: "more", quiz: "more", sch: "more", grd: "more", nts: "more", tr: "more", study: "more", qa: "more", poll: "more", info: "more", set: "more", adm: "more" };
const VIEWS = ["today", "hw", "ex", "cal", "sch", "ann", "more", "grd", "nts", "tr", "study", "quiz", "qa", "poll", "info", "set", "adm", "fun", "ask"];
function setView(v) {
  if (v === "adm" && !(S.isAdmin || admAccess())) v = "more";
  if (VIEWS.indexOf(v) < 0) v = "today";
  S.view = v;
  VIEWS.forEach((k) => { $("v-" + k).hidden = k !== v; });
  const g = NAV_GROUP[v] || v;
  document.querySelectorAll("#nav button").forEach((b) => {
    if (b.dataset.view === g) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  if (v === "adm") { renderAdmTabs(); const t0 = S.admTab || "users"; if (admTabOk(t0)) setAdmTab(t0); else { const f = Array.from(document.querySelectorAll("#adm-tabs .tab")).find((b) => !b.hidden); if (f) setAdmTab(f.dataset.adm); } }
  if (v === "adm" && S.isAdmin && !S.acctLoaded) { S.acctLoaded = true; loadAcct(); }
  if (v === "ann") { S.annNew = annSeen(); markAnnSeen(); renderAnn(); renderBadges(); }
  if (v === "today") renderToday();
  renderAiChips(); gdPeek(v);
  if (v === "quiz") renderQuiz();
  if (v === "fun") renderJoke();
  if (v === "ask") renderAsks();
  if (v === "set") renderInstall();
  window.scrollTo(0, 0);
}
document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.go)));
const annKey = () => "odev-ann-seen-" + (S.user ? S.user.uid : ""); // kişiye özel (ortak telefonlarda karışmasın)
// "Duyuruları okudum" bilgisi hesapta tutulur (telefon ve bilgisayar aynı bilgiyi görür); cihazdaki kayıt yedektir.
const annSeen = () => Math.max(Number(S.profile && S.profile.annSeen) || 0, Number(lsGet(annKey()) || 0));
function annUnread() {
  const seen = annSeen(), recent = nowMs() - 14 * 86400000;
  return S.ann.filter((a) => a.createdAt > seen && a.createdAt > recent && a.uid !== (S.user && S.user.uid)).length;
}
function markAnnSeen() {
  const mx = S.ann.reduce((m, a) => Math.max(m, a.createdAt || 0), 0);
  if (!mx) return;
  lsSet(annKey(), String(Math.max(mx, Number(lsGet(annKey()) || 0))));
  if (S.user && S.profile && mx > (Number(S.profile.annSeen) || 0)) {
    S.profile.annSeen = mx; // aynı değeri tekrar yazmamak için hemen güncelle
    updateDoc(doc(db, "users", S.user.uid), { annSeen: mx }).catch(() => {});
  }
}
function renderBadges() {
  const u = S.hw.filter((h) => h.due && !isExpired(h.due) && !S.done.has(h.id)).length;
  const b = $("b-hw"); b.textContent = u; b.hidden = u === 0;
  const e = S.ex.filter((x) => x.date && dayDiff(x.date) >= 0 && dayDiff(x.date) <= 3).length;
  const be = $("b-ex"); be.textContent = e; be.hidden = e === 0;
  const n = S.view === "ann" ? 0 : annUnread();
  const ba = $("b-ann"); ba.textContent = n; ba.hidden = n === 0;
}

/* ---------- Ders filtre düğmeleri ---------- */
function makeSubPills(boxId, get, set, onChange) {
  const box = $(boxId); box.textContent = "";
  const mk = (val, label, hue) => {
    const b = el("button", "pill"); b.type = "button"; b.dataset.v = val;
    if (hue != null) { const d = el("span", "dot"); d.style.setProperty("--h", String(hue)); b.appendChild(d); }
    b.appendChild(document.createTextNode(label));
    b.addEventListener("click", () => { set(val); sync(); onChange(); });
    box.appendChild(b);
  };
  mk("all", "Tüm dersler", null);
  SUBJECTS.forEach((s) => mk(s.n, s.n, s.h));
  function sync() { Array.from(box.children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === get() ? "true" : "false")); }
  sync();
}

/* ---------- ÖDEVLER ---------- */
function hwStatus(due) {
  const diff = dayDiff(due);
  if (isExpired(due)) { const ago = Math.abs(diff); return { state: "done", label: ago <= 1 ? "Dün doldu" : ago + " gün önce doldu" }; }
  if (diff === 0) { const hrs = Math.max(1, Math.ceil((dueEnd(due).getTime() - nowMs()) / 3600000)); return { state: "crit", label: "Bugün son gün · " + hrs + " saat kaldı" }; }
  if (diff === 1) return { state: "crit", label: "Yarın son gün" };
  if (diff <= 3) return { state: "warn", label: diff + " gün kaldı" };
  return { state: "ok", label: diff + " gün kaldı" };
}
function dateBlock(dateStr) {
  const p = parts(dateStr), dt = new Date(p.y, p.m - 1, p.d);
  const d = el("div", "date");
  d.appendChild(el("span", "dow", DOW[dt.getDay()]));
  d.appendChild(el("span", "day", String(p.d)));
  d.appendChild(el("span", "mon", MONTHS[p.m - 1]));
  return d;
}
function hwCard(h, expired) {
  const st = hwStatus(h.due), isDone = S.done.has(h.id);
  const li = el("li", "card" + (isDone ? " is-done" : ""));
  li.dataset.state = expired ? "done" : (isDone ? "ok-done" : st.state);
  li.appendChild(dateBlock(h.due));
  const body = el("div", "body");
  const top = el("div", "top");
  top.appendChild(subjectChip(h.subject));
  top.appendChild(el("span", "chip", expired ? (isDone ? "Yaptın" : "Yapmadın") + " · " + st.label : st.label));
  body.appendChild(top);
  body.appendChild(el("h3", "title", h.title || "Adsız ödev"));
  if (h.desc) body.appendChild(el("p", "desc", h.desc));
  if (h.photo) { // eski kayıtlar: fotoğraf ödevin içinde
    const tb = el("button", "thumb"); tb.type = "button"; tb.setAttribute("aria-label", "Fotoğrafı büyüt");
    const im = document.createElement("img"); im.src = h.photo; im.alt = "Ödev fotoğrafı"; tb.appendChild(im);
    tb.addEventListener("click", () => { $("lb-img").src = h.photo; $("lb").hidden = false; $("lb-close").focus(); });
    body.appendChild(tb);
  } else if (h.hasPhoto) { // yeni kayıtlar: fotoğraf ayrı tutulur, istenince indirilir
    const pb = el("button", "btn btn-quiet btn-small photo-btn", "Fotoğrafı göster"); pb.type = "button";
    pb.addEventListener("click", () => openPhoto(h.id, pb));
    body.appendChild(pb);
  }
  if (Array.isArray(h.steps) && h.steps.length) body.appendChild(stepsBlock(h, expired));
  if (!expired) {
    const ab = el("button", "btn btn-quiet btn-small ai-ask", "Mobi'ye sor"); ab.type = "button";
    ab.addEventListener("click", () => openAi("“" + (h.title || "Ödev") + "” ödevinde bana yardım eder misin? Nereden başlamalıyım?", (h.subject || "") + ": " + (h.title || "")));
    body.appendChild(ab);
    const mb = el("button", "markbtn"); mb.type = "button"; mb.setAttribute("aria-pressed", isDone ? "true" : "false");
    mb.appendChild(el("span", "box")); mb.appendChild(el("span", "", isDone ? "Yaptım" : "Yaptım olarak işaretle"));
    mb.addEventListener("click", () => toggleDone(h.id));
    body.appendChild(mb);
  }
  const ck = "hw:" + h.id, cOpen = S.cmOpen.has(ck);
  const cb = el("button", "tlink", cOpen ? "Yorumları gizle" : "Yorumlar"); cb.type = "button";
  cb.addEventListener("click", () => toggleThread(ck, ["homework", h.id, "comments"], renderHw));
  body.appendChild(cb);
  if (cOpen) body.appendChild(threadBox(ck, ["homework", h.id, "comments"], { max: 300, ph: "Yorum yaz (örn. 5. soru şöyle çözülüyor)", btn: "Gönder" }));
  const meta = el("div", "meta");
  const who = el("span", "", "Ekleyen: "); who.appendChild(el("span", "who", h.author || "Bilinmiyor")); meta.appendChild(who);
  if (h.createdAt) { const c = new Date(h.createdAt); meta.appendChild(el("span", "", c.getDate() + " " + MONTHS[c.getMonth()] + " tarihinde eklendi")); }
  if (canModify(h)) {
    const ed = el("button", "lnk", "Düzenle"); ed.type = "button"; ed.addEventListener("click", () => startEditHw(h)); meta.appendChild(ed);
    meta.appendChild(delButton("hw:" + h.id, () => deleteHw(h)));
  }
  body.appendChild(meta);
  li.appendChild(body);
  return li;
}
/* Silinen ödev, sınav, etkinlik ve notlar çöp kutusuna kopyalanır (yönetici 30 gün içinde geri getirebilir). */
function addTrash(b, kind, id, data, photo) {
  const t = { kind, docId: id, data, by: S.profile.name, uid: S.user.uid, at: nowMs() };
  if (photo) t.photo = photo;
  b.set(doc(collection(db, "trash")), t);
}
function deleteWithTrash(kind, col, x) {
  const b = writeBatch(db);
  b.delete(doc(db, col, x.id));
  addTrash(b, kind, x.id, stripId(x));
  addLog(b, "del", kind, x.title);
  return b.commit();
}
async function deleteHw(h) {
  let ph = "";
  if (h.hasPhoto) {
    ph = photoCache.get(h.id) || "";
    if (!ph) { try { const s = await getDoc(doc(db, "photos", h.id)); ph = s.exists() ? s.data().data || "" : ""; } catch (e) { ph = ""; } }
  }
  const b = writeBatch(db);
  b.delete(doc(db, "homework", h.id));
  if (h.hasPhoto) b.delete(doc(db, "photos", h.id));
  addTrash(b, "hw", h.id, stripId(h), ph);
  addLog(b, "del", "hw", h.title);
  return b.commit();
}
/* Alt görevler (kişiye özel ilerleme) */
function stepsBlock(h, locked) {
  const done = new Set(S.stepsDone[h.id] || []), n = h.steps.length, k = h.steps.filter((_, i) => done.has(i)).length;
  const box = el("div"); box.style.display = "flex"; box.style.flexDirection = "column"; box.style.gap = "6px";
  box.appendChild(el("span", "hint", "Alt görevler: " + k + " / " + n));
  const bar = el("div", "bar"), fill = el("i"); fill.style.width = Math.round((100 * k) / n) + "%"; bar.appendChild(fill); box.appendChild(bar);
  const ul = el("ul", "steps");
  h.steps.forEach((t, idx) => {
    const li = el("li"), lb = el("label"), cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = done.has(idx); cb.disabled = !!locked;
    cb.addEventListener("change", () => toggleStep(h, idx));
    lb.appendChild(cb); lb.appendChild(el("span", "", t)); li.appendChild(lb); ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
}
async function toggleStep(h, idx) {
  const n = h.steps.length, before = new Set(S.stepsDone[h.id] || []), cur = new Set(before);
  if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
  const arr = Array.from(cur).filter((i) => i < n).sort((a, b) => a - b);
  const wasAll = Array.from(before).filter((i) => i < n).length === n, all = arr.length === n;
  S.stepsDone[h.id] = arr; renderHw(); renderToday();
  try {
    const ref = doc(db, "users", S.user.uid, "steps", h.id);
    if (arr.length) await setDoc(ref, { done: arr }); else await deleteDoc(ref);
    // Tüm adımlar bitince ödev de "yaptım" olur; birini geri alırsan yaptım işareti de kalkar.
    if (all && !S.done.has(h.id)) await setDoc(doc(db, "users", S.user.uid, "done", h.id), { at: Date.now() });
    else if (wasAll && !all && S.done.has(h.id)) await deleteDoc(doc(db, "users", S.user.uid, "done", h.id));
  } catch (e) { toast("İşaretlenemedi. Tekrar dene."); }
}
/* Yorum ve yanıt konuşmaları: ödev altında yorumlar, soru altında yanıtlar. Açılınca canlı dinlenir. */
function toggleThread(key, colPath, rerender) {
  if (S.cmOpen.has(key)) { S.cmOpen.delete(key); const u = live.get(key); if (u) { u(); live.delete(key); } delete S.cm[key]; }
  else { S.cmOpen.add(key); openThread(key, colPath); }
  rerender();
}
function openThread(key, colPath) {
  if (live.has(key)) return;
  S.cm[key] = undefined;
  const u = onSnapshot(query(collection(db, ...colPath), orderBy("createdAt", "asc")), (s) => {
    S.cm[key] = s.docs.map((d) => ({ ...d.data(), id: d.id })); refreshThread(key);
  }, () => { S.cm[key] = null; refreshThread(key); });
  live.set(key, u);
}
function refreshThread(key) { document.querySelectorAll("[data-thread]").forEach((b) => { if (b.dataset.thread === key && b._fill) b._fill(); }); }
function threadBox(key, colPath, o) {
  if (!live.has(key)) openThread(key, colPath);
  const box = el("div", "cmbox"); box.dataset.thread = key;
  const list = el("div", "cm-list"); list.style.display = "flex"; list.style.flexDirection = "column"; list.style.gap = "8px";
  box.appendChild(list);
  const f = el("form", "cmform"); f.noValidate = true;
  const ta = document.createElement("textarea"); ta.maxLength = o.max; ta.placeholder = o.ph; ta.rows = 1; ta.setAttribute("aria-label", o.ph);
  ta.value = S.drafts[key] || ""; ta.addEventListener("input", () => { S.drafts[key] = ta.value; });
  const sb = el("button", "btn btn-primary btn-small", o.btn); sb.type = "submit";
  f.appendChild(ta); f.appendChild(sb);
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const text = ta.value.trim(); if (!text) return;
    if (!S.canAdd) { toast("Ekleme iznin kapalı. Yöneticiyle konuş."); return; }
    sb.disabled = true;
    try { await addDoc(collection(db, ...colPath), { text, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() }); ta.value = ""; delete S.drafts[key]; }
    catch (e) { toast("Gönderilemedi. Tekrar dene."); }
    sb.disabled = false;
  });
  box.appendChild(f);
  box._fill = () => {
    list.textContent = "";
    const items = S.cm[key];
    if (items === undefined) { list.appendChild(el("span", "hint", "Yükleniyor…")); return; }
    if (items === null) { list.appendChild(el("span", "hint", "Yüklenemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım).")); return; }
    if (!items.length) { list.appendChild(el("span", "hint", "Henüz yok. İlk yazan sen ol.")); return; }
    items.forEach((c) => {
      const row = el("div", "cm");
      row.appendChild(el("p", "", c.text));
      const meta = el("div", "meta"); meta.appendChild(el("span", "who", c.author || "?")); meta.appendChild(el("span", "", c.createdAt ? fmtStamp(c.createdAt) : ""));
      if (canModify(c)) meta.appendChild(delButton("c:" + key + ":" + c.id, () => deleteDoc(doc(db, ...colPath, c.id))));
      row.appendChild(meta); list.appendChild(row);
    });
  };
  box._fill();
  return box;
}
async function openPhoto(id, btn) {
  try {
    let d = photoCache.get(id);
    if (!d) {
      btn.disabled = true; btn.textContent = "Yükleniyor…";
      const s = await getDoc(doc(db, "photos", id));
      d = s.exists() ? s.data().data : "";
      if (d) photoCache.set(id, d);
    }
    if (!d) throw new Error("yok");
    $("lb-img").src = d; $("lb").hidden = false; $("lb-close").focus();
  } catch (e) { toast("Fotoğraf yüklenemedi."); }
  btn.disabled = false; btn.textContent = "Fotoğrafı göster";
}
function delButton(key, fn) {
  const b = el("button", "lnk", armedId === key ? "Silmek için tekrar dokun" : "Sil");
  b.type = "button"; b.dataset.armed = armedId === key ? "1" : "0";
  b.addEventListener("click", () => {
    if (armedId !== key) { armedId = key; clearTimeout(armTimer); armTimer = setTimeout(() => { armedId = null; renderAll(); renderAdmUsers(); }, 4000); renderAll(); renderAdmUsers(); return; }
    armedId = null; clearTimeout(armTimer);
    Promise.resolve(fn()).catch(() => toast("Silinemedi. Yetkin olmayabilir."));
    renderAll();
  });
  return b;
}
async function toggleDone(id) {
  const ref = doc(db, "users", S.user.uid, "done", id);
  try {
    if (S.done.has(id)) await deleteDoc(ref); else { await setDoc(ref, { at: Date.now() }); if (hwAllDone(id)) celebrate("hw"); }
  } catch (e) { toast("İşaretlenemedi. Tekrar dene."); }
}
function hwVisible(list, expired) {
  const f = S.hwF, q = f.q.trim().toLocaleLowerCase("tr");
  const out = list.filter((h) => {
    if (f.sub !== "all" && (h.subject || "Diğer") !== f.sub) return false;
    if (!expired && f.week && dayDiff(h.due) > 7) return false;
    if (f.undone && S.done.has(h.id)) return false;
    if (q) {
      const hay = ((h.title || "") + " " + (h.desc || "") + " " + (h.author || "") + " " + (h.subject || "")).toLocaleLowerCase("tr");
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  out.sort((a, b) => {
    if (f.sort === "new") return (b.createdAt || 0) - (a.createdAt || 0);
    if (f.sort === "subject") { const c = (a.subject || "Diğer").localeCompare(b.subject || "Diğer", "tr"); if (c) return c; }
    if (a.due === b.due) return (a.createdAt || 0) - (b.createdAt || 0);
    const asc = a.due < b.due ? -1 : 1;
    return expired ? -asc : asc;
  });
  return out;
}
function renderHw() {
  const all = S.hw.filter((h) => h.due);
  const active = all.filter((h) => !isExpired(h.due)), expired = all.filter((h) => isExpired(h.due));
  const undone = active.filter((h) => !S.done.has(h.id));
  $("s-active").textContent = active.length;
  $("s-undone").textContent = undone.length;
  $("s-soon").textContent = undone.filter((h) => dayDiff(h.due) <= 3).length;
  $("n-hw-active").textContent = active.length;
  $("n-hw-exp").textContent = expired.length;
  $("fl-week").hidden = S.hwTab !== "active";
  if (deferIfTyping("hw-list", renderHw)) return; // yorum yazılırken liste yeniden çizilip yazıyı silmesin
  const box = $("hw-list"); box.textContent = "";
  if (S.err) { box.appendChild(emptyBox("Ödevler yüklenemedi", S.err)); return; }
  if (!S.hwLoaded) { box.appendChild(emptyBox("Ödevler yükleniyor", "Birkaç saniye sürebilir.")); return; }
  const expTab = S.hwTab === "exp";
  const base = expTab ? expired : active;
  const items = hwVisible(base, expTab);
  if (!items.length) {
    if (base.length) box.appendChild(emptyBox("Filtreye uyan ödev yok", "", "Filtreleri temizle", clearHwFilters));
    else if (expTab) box.appendChild(emptyBox("Süresi dolan ödev yok", "Bitiş tarihi geçen ödevler otomatik olarak buraya taşınır. Son " + KEEP_DAYS + " gün gösterilir."));
    else box.appendChild(emptyBox("Şu an aktif ödev yok", "İlk ödevi “Ödev ekle” düğmesiyle ekleyebilirsin."));
    return;
  }
  const ul = el("ul", "list");
  items.forEach((h) => ul.appendChild(hwCard(h, expTab)));
  box.appendChild(ul);
}
function clearHwFilters() {
  S.hwF = { q: "", sub: "all", undone: false, week: false, sort: S.hwF.sort };
  $("q").value = ""; syncHwFilters(); renderHw();
}
function syncHwFilters() {
  $("fl-undone").setAttribute("aria-pressed", S.hwF.undone ? "true" : "false");
  $("fl-week").setAttribute("aria-pressed", S.hwF.week ? "true" : "false");
  Array.from($("hw-subs").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === S.hwF.sub ? "true" : "false"));
}
$("q").addEventListener("input", function () { S.hwF.q = this.value; renderHw(); });
$("sort").addEventListener("change", function () { S.hwF.sort = this.value; renderHw(); });
$("fl-undone").addEventListener("click", () => { S.hwF.undone = !S.hwF.undone; syncHwFilters(); renderHw(); });
$("fl-week").addEventListener("click", () => { S.hwF.week = !S.hwF.week; syncHwFilters(); renderHw(); });
function setHwTab(t) {
  S.hwTab = t;
  $("tab-hw-active").setAttribute("aria-selected", t === "active" ? "true" : "false");
  $("tab-hw-exp").setAttribute("aria-selected", t === "exp" ? "true" : "false");
  renderHw();
}
$("tab-hw-active").addEventListener("click", () => setHwTab("active"));
$("tab-hw-exp").addEventListener("click", () => setHwTab("exp"));

/* Ödev formu */
// mode: "none" (fotoğraf yok), "keep" (kayıtlı fotoğraf olduğu gibi kalır), "new" (photoData yazılacak)
function setPhoto(d, mode) {
  photoData = d || "";
  photoMode = mode || (photoData ? "new" : "none");
  $("h-prev").hidden = photoMode === "none";
  $("h-keep").hidden = photoMode !== "keep";
  $("h-img").hidden = photoMode !== "new";
  if (photoMode === "new") $("h-img").src = photoData; else $("h-img").removeAttribute("src");
}
function compress(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject();
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject();
      img.onload = () => {
        const k = Math.min(1, 1100 / Math.max(img.width, img.height));
        for (const sc of [1, 0.8, 0.65, 0.5, 0.4]) {
          const w = Math.max(1, Math.round(img.width * k * sc)), h = Math.max(1, Math.round(img.height * k * sc));
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
          for (const q of [0.72, 0.6, 0.5, 0.4]) { const out = cv.toDataURL("image/jpeg", q); if (out.length <= PHOTO_LIMIT) { resolve(out); return; } }
        }
        reject();
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
$("h-photo").addEventListener("change", function () {
  const file = this.files && this.files[0]; if (!file) return;
  photoBusy = true; setMsg("h-msg", ""); $("h-submit").disabled = true;
  compress(file).then(setPhoto).catch(() => setMsg("h-msg", "Fotoğraf okunamadı. JPG ya da PNG bir fotoğraf dene."))
    .then(() => { photoBusy = false; $("h-submit").disabled = false; $("h-photo").value = ""; });
});
$("h-rm").addEventListener("click", () => setPhoto(""));
$("lb").addEventListener("click", () => { $("lb").hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("lb").hidden = true; });

function resetHwForm() {
  $("h-title").value = ""; $("h-desc").value = ""; $("h-due").value = ""; $("h-sub").value = ""; $("h-steps").value = "";
  $("h-rep").value = "0"; $("h-rep-n").value = "4"; syncRep(); $("h-repbox").hidden = false;
  setPhoto(""); setMsg("h-msg", ""); editingHw = null; editingHwObj = null;
  $("h-ftitle").textContent = "Yeni ödev"; $("h-submit").textContent = "Ödevi kaydet";
}
function syncRep() { const on = $("h-rep").value === "1"; $("h-rep-n").hidden = !on; $("h-rep-hint").hidden = !on; }
$("h-rep").addEventListener("change", syncRep);
function showHwForm(open) {
  $("hw-panel").hidden = !open; $("hw-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("h-due").min = editingHw ? "" : todayStr(); $("hw-panel").scrollIntoView({ block: "nearest" }); $("h-title").focus(); }
}
function startEditHw(h) {
  resetHwForm(); editingHw = h.id; editingHwObj = h;
  $("h-ftitle").textContent = "Ödevi düzenle"; $("h-submit").textContent = "Değişiklikleri kaydet";
  $("h-title").value = h.title || ""; $("h-desc").value = h.desc || ""; $("h-due").value = h.due || ""; $("h-sub").value = h.subject || "Diğer";
  $("h-steps").value = Array.isArray(h.steps) ? h.steps.join("\n") : ""; $("h-repbox").hidden = true;
  setPhoto(h.photo || "", h.photo ? "new" : (h.hasPhoto ? "keep" : "none")); setView("hw"); showHwForm(true);
}
$("hw-add").addEventListener("click", () => { if ($("hw-panel").hidden) { resetHwForm(); showHwForm(true); } else showHwForm(false); });
$("h-cancel").addEventListener("click", () => { resetHwForm(); showHwForm(false); });
$("hw-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (photoBusy) return;
  const title = $("h-title").value.trim(), sub = $("h-sub").value, desc = $("h-desc").value.trim(), due = $("h-due").value;
  if (!title) { setMsg("h-msg", "Ödev adını yaz."); $("h-title").focus(); return; }
  if (!sub) { setMsg("h-msg", "Dersi seç."); $("h-sub").focus(); return; }
  if (!due) { setMsg("h-msg", "Bitiş tarihini seç."); $("h-due").focus(); return; }
  if (!editingHw && due < todayStr()) { setMsg("h-msg", "Bitiş tarihi bugünden önce olamaz."); $("h-due").focus(); return; }
  if (!S.canAdd) { setMsg("h-msg", "Ekleme iznin kapalı. Yöneticiyle konuş."); return; }
  const steps = $("h-steps").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (steps.length > 8) { setMsg("h-msg", "En fazla 8 alt görev ekleyebilirsin."); $("h-steps").focus(); return; }
  if (steps.some((s) => s.length > 60)) { setMsg("h-msg", "Her alt görev en fazla 60 karakter olmalı."); $("h-steps").focus(); return; }
  const rep = !editingHw && $("h-rep").value === "1" ? Math.min(8, Math.max(2, Math.round(Number($("h-rep-n").value)) || 2)) : 1;
  setMsg("h-msg", "");
  const btn = $("h-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Kaydediliyor…";
  // Fotoğraf ödev kaydının içine değil, "photos" koleksiyonuna yazılır (liste hafif kalsın).
  const body = { title, subject: sub, desc, due, photo: "", hasPhoto: photoMode !== "none", steps };
  try {
    const b = writeBatch(db);
    addLog(b, editingHw ? "edit" : "add", "hw", rep > 1 ? title + " (" + rep + " hafta)" : title);
    if (editingHw) {
      const h0 = editingHwObj;
      b.update(doc(db, "homework", editingHw), body);
      if (photoMode === "new") {
        if (h0 && h0.hasPhoto) b.update(doc(db, "photos", editingHw), { data: photoData });
        else b.set(doc(db, "photos", editingHw), { data: photoData, uid: S.user.uid });
      } else if (photoMode === "none" && h0 && h0.hasPhoto) b.delete(doc(db, "photos", editingHw));
      await b.commit(); photoCache.delete(editingHw);
    } else {
      // "Her hafta tekrarla": aynı ödev 7 gün arayla birkaç kez açılır, fotoğraf sadece ilkine eklenir.
      for (let k = 0; k < rep; k++) {
        const ref = doc(collection(db, "homework"));
        b.set(ref, { ...body, due: addDays(due, 7 * k), hasPhoto: k === 0 && photoMode !== "none", author: S.profile.name, uid: S.user.uid, createdAt: nowMs() + k });
        if (k === 0 && photoMode === "new") b.set(doc(db, "photos", ref.id), { data: photoData, uid: S.user.uid });
      }
      await b.commit();
    }
    resetHwForm(); showHwForm(false); setHwTab("active");
  } catch (e) {
    setMsg("h-msg", e && e.code === "permission-denied" ? "Bu işlem için yetkin yok." : "Ödev kaydedilemedi. Biraz sonra tekrar dene.");
    btn.textContent = label;
  }
  btn.disabled = false;
});

/* ---------- SINAVLAR ---------- */
function exStatus(date) {
  const d = dayDiff(date);
  if (d < 0) return { state: "done", label: d === -1 ? "Dün yapıldı" : -d + " gün önce" };
  if (d === 0) return { state: "crit", label: "Bugün" };
  if (d === 1) return { state: "crit", label: "Yarın" };
  if (d <= 3) return { state: "warn", label: d + " gün sonra" };
  return { state: "ok", label: d + " gün sonra" };
}
function exCard(x) {
  const st = exStatus(x.date);
  const li = el("li", "card"); li.dataset.state = st.state;
  li.appendChild(dateBlock(x.date));
  const body = el("div", "body");
  const top = el("div", "top");
  top.appendChild(subjectChip(x.subject));
  top.appendChild(el("span", "chip", st.label));
  if (x.time) top.appendChild(el("span", "chip plain", "Saat " + x.time));
  const gr = dayDiff(x.date) <= 0 ? S.grades.find((q) => q.examId === x.id) : null;
  if (gr) top.appendChild(el("span", "chip good", "Notun: " + fmtScore(gr.score)));
  body.appendChild(top);
  body.appendChild(el("h3", "title", x.title || "Sınav"));
  const items = splitItems(x.topics);
  if (x.topics && dayDiff(x.date) >= 0 && items.length >= 2) body.appendChild(topicsBlock(x, items));
  else if (x.topics) body.appendChild(el("p", "desc", x.topics));
  if (dayDiff(x.date) >= 0) {
    const ab = el("button", "btn btn-quiet btn-small ai-ask", "Mobi'ye sor"); ab.type = "button";
    ab.addEventListener("click", () => openAi("“" + (x.title || "Sınav") + "” sınavına nasıl çalışmalıyım? Bana bir plan yapar mısın?", (x.subject || "") + ": " + (x.title || "") + (x.topics ? " | konular: " + String(x.topics).slice(0, 80) : "")));
    body.appendChild(ab);
    if (dayDiff(x.date) >= 1) { const pb = el("button", "btn btn-quiet btn-small ai-ask", "Hazırlık planı"); pb.type = "button"; pb.addEventListener("click", () => openPlan(x)); body.appendChild(pb); }
    const qb = el("button", "btn btn-quiet btn-small ai-ask", "Prova çöz"); qb.type = "button";
    qb.addEventListener("click", () => { setView("quiz"); quizPrefill(x.subject, splitItems(x.topics)[0] || x.title || ""); });
    body.appendChild(qb);
  }
  if (dayDiff(x.date) <= 0 && !gr) {
    const gb = el("button", "btn btn-quiet btn-small", "Notunu gir"); gb.type = "button"; gb.style.alignSelf = "flex-start";
    gb.addEventListener("click", () => openGradeFromExam(x));
    body.appendChild(gb);
  }
  const meta = el("div", "meta");
  const who = el("span", "", "Ekleyen: "); who.appendChild(el("span", "who", x.author || "Bilinmiyor")); meta.appendChild(who);
  if (canModify(x)) {
    const ed = el("button", "lnk", "Düzenle"); ed.type = "button"; ed.addEventListener("click", () => startEditEx(x)); meta.appendChild(ed);
    meta.appendChild(delButton("ex:" + x.id, () => deleteWithTrash("ex", "exams", x)));
  }
  body.appendChild(meta);
  li.appendChild(body);
  return li;
}
/* Sınav konu listesi: konular virgül ya da satırla ayrılır, her biri kişiye özel işaretlenir. */
function topicsBlock(x, items) {
  const done = new Set(S.prog[x.id] || []), k = items.filter((_, i) => done.has(i)).length;
  const det = document.createElement("details"); det.className = "fold"; det.open = S.topOpen.has(x.id);
  det.addEventListener("toggle", () => { if (det.open) S.topOpen.add(x.id); else S.topOpen.delete(x.id); });
  det.appendChild(el("summary", "", "Konu listesi · " + k + " / " + items.length + " çalışıldı"));
  const bar = el("div", "bar"), fill = el("i"); fill.style.width = Math.round((100 * k) / items.length) + "%"; bar.appendChild(fill); det.appendChild(bar);
  const ul = el("ul", "steps"); ul.style.marginTop = "8px";
  items.forEach((t, idx) => {
    const li = el("li"), lb = el("label"), cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = done.has(idx);
    cb.addEventListener("change", () => toggleTopic(x, idx, items.length));
    lb.appendChild(cb); lb.appendChild(el("span", "", t)); li.appendChild(lb); ul.appendChild(li);
  });
  det.appendChild(ul);
  return det;
}
async function toggleTopic(x, idx, n) {
  const cur = new Set(S.prog[x.id] || []);
  if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
  const arr = Array.from(cur).filter((i) => i < n).sort((a, b) => a - b);
  S.prog[x.id] = arr; renderEx();
  try {
    const ref = doc(db, "users", S.user.uid, "prog", x.id);
    if (arr.length) await setDoc(ref, { done: arr }); else await deleteDoc(ref);
  } catch (e) { toast("İşaretlenemedi. Tekrar dene."); }
}
function renderEx() {
  const all = S.ex.filter((x) => x.date);
  const up = all.filter((x) => dayDiff(x.date) >= 0), past = all.filter((x) => dayDiff(x.date) < 0);
  $("n-ex-up").textContent = up.length; $("n-ex-past").textContent = past.length;
  const week = up.filter((x) => dayDiff(x.date) <= 7).length;
  const next = up.slice().sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))[0];
  $("ex-sum").textContent = !S.exLoaded ? "" : !up.length ? "Yaklaşan sınav yok."
    : "Önümüzdeki 7 günde " + week + " sınav var. Sıradaki: " + (next.subject || "Sınav") + ", " + (next.title || "sınav") + " (" + relDay(next.date) + ").";
  const box = $("ex-list"); box.textContent = "";
  if (S.err) { box.appendChild(emptyBox("Sınavlar yüklenemedi", S.err)); return; }
  if (!S.exLoaded) { box.appendChild(emptyBox("Sınavlar yükleniyor", "")); return; }
  const upTab = S.exTab === "up";
  const base = (upTab ? up : past).filter((x) => S.exF.sub === "all" || (x.subject || "Diğer") === S.exF.sub);
  base.sort((a, b) => { const c = (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); return upTab ? c : -c; });
  if (!base.length) {
    const hasAny = (upTab ? up : past).length > 0;
    box.appendChild(hasAny ? emptyBox("Bu derse ait sınav yok", "", "Filtreyi temizle", () => { S.exF.sub = "all"; syncExPills(); renderEx(); })
      : emptyBox(upTab ? "Yaklaşan sınav yok" : "Geçmiş sınav yok", upTab ? "“Sınav ekle” ile ekleyebilirsin." : ""));
    return;
  }
  const ul = el("ul", "list"); base.forEach((x) => ul.appendChild(exCard(x))); box.appendChild(ul);
}
function syncExPills() { Array.from($("ex-subs").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === S.exF.sub ? "true" : "false")); }
function setExTab(t) {
  S.exTab = t;
  $("tab-ex-up").setAttribute("aria-selected", t === "up" ? "true" : "false");
  $("tab-ex-past").setAttribute("aria-selected", t === "past" ? "true" : "false");
  renderEx();
}
$("tab-ex-up").addEventListener("click", () => setExTab("up"));
$("tab-ex-past").addEventListener("click", () => setExTab("past"));

function resetExForm() {
  $("e-title").value = ""; $("e-sub").value = ""; $("e-date").value = ""; $("e-time").value = ""; $("e-topics").value = "";
  setMsg("e-msg", ""); editingEx = null; $("e-ftitle").textContent = "Yeni sınav"; $("e-submit").textContent = "Sınavı kaydet";
}
function showExForm(open) {
  $("ex-panel").hidden = !open; $("ex-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("e-date").min = editingEx ? "" : todayStr(); $("ex-panel").scrollIntoView({ block: "nearest" }); $("e-title").focus(); }
}
function startEditEx(x) {
  resetExForm(); editingEx = x.id; $("e-ftitle").textContent = "Sınavı düzenle"; $("e-submit").textContent = "Değişiklikleri kaydet";
  $("e-title").value = x.title || ""; $("e-sub").value = x.subject || "Diğer"; $("e-date").value = x.date || "";
  $("e-time").value = x.time || ""; $("e-topics").value = x.topics || ""; setView("ex"); showExForm(true);
}
$("ex-add").addEventListener("click", () => { if ($("ex-panel").hidden) { resetExForm(); showExForm(true); } else showExForm(false); });
$("e-cancel").addEventListener("click", () => { resetExForm(); showExForm(false); });
$("ex-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const title = $("e-title").value.trim(), sub = $("e-sub").value, date = $("e-date").value, time = $("e-time").value, topics = $("e-topics").value.trim();
  if (!title) { setMsg("e-msg", "Sınav adını yaz."); $("e-title").focus(); return; }
  if (!sub) { setMsg("e-msg", "Dersi seç."); $("e-sub").focus(); return; }
  if (!date) { setMsg("e-msg", "Sınav tarihini seç."); $("e-date").focus(); return; }
  if (!editingEx && date < todayStr()) { setMsg("e-msg", "Sınav tarihi bugünden önce olamaz."); $("e-date").focus(); return; }
  setMsg("e-msg", "");
  const btn = $("e-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Kaydediliyor…";
  const body = { title, subject: sub, date, time, topics };
  if (!S.canAdd) { setMsg("e-msg", "Ekleme iznin kapalı. Yöneticiyle konuş."); btn.disabled = false; btn.textContent = label; return; }
  try {
    const b = writeBatch(db);
    if (editingEx) b.update(doc(db, "exams", editingEx), body);
    else b.set(doc(collection(db, "exams")), { ...body, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
    addLog(b, editingEx ? "edit" : "add", "ex", title);
    await b.commit();
    resetExForm(); showExForm(false); setExTab("up");
  } catch (e) {
    setMsg("e-msg", e && e.code === "permission-denied" ? "Bu işlem için yetkin yok." : "Sınav kaydedilemedi. Biraz sonra tekrar dene.");
    btn.textContent = label;
  }
  btn.disabled = false;
});

/* ---------- DUYURULAR ---------- */
function fmtStamp(ms) {
  const d = new Date(ms);
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function annCard(a) {
  const li = el("li", "ann" + (a.important ? " important" : ""));
  const top = el("div", "top");
  top.appendChild(el("span", "chip plain", fmtStamp(a.createdAt)));
  if (a.important) top.appendChild(el("span", "chip crit", "Önemli"));
  if (S.view === "ann" && a.createdAt > S.annNew && a.uid !== (S.user && S.user.uid)) top.appendChild(el("span", "chip", "Yeni"));
  li.appendChild(top);
  li.appendChild(el("h3", "title", a.title || "Duyuru"));
  if (a.body) li.appendChild(el("p", "desc", a.body));
  const meta = el("div", "meta");
  const who = el("span", "", "Yazan: "); who.appendChild(el("span", "who", a.author || "Yönetici")); meta.appendChild(who);
  if (can("ann")) meta.appendChild(delButton("an:" + a.id, () => { const b = writeBatch(db); b.delete(doc(db, "announcements", a.id)); addLog(b, "del", "ann", a.title); return b.commit(); }));
  li.appendChild(meta);
  return li;
}
function renderAnn() {
  if (!$("ann-list")) return;
  $("ann-admin").hidden = !can("ann");
  const box = $("ann-list"); box.textContent = "";
  if (S.annErr) { box.appendChild(emptyBox("Duyurular yüklenemedi", S.annErr)); return; }
  if (!S.ann.length) { box.appendChild(emptyBox("Henüz duyuru yok", can("ann") ? "Yukarıdan ilk duyuruyu yazabilirsin." : "Yönetici duyuru yazınca burada görünür.")); return; }
  const ul = el("ul", "list");
  S.ann.forEach((a) => ul.appendChild(annCard(a)));
  box.appendChild(ul);
}
$("a-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!can("ann")) return;
  const title = $("a-title").value.trim(), body = $("a-body").value.trim(), important = $("a-imp").checked, push = $("a-push").checked;
  if (!title) { setMsg("a-msg", "Duyuru başlığını yaz."); $("a-title").focus(); return; }
  if (!body) { setMsg("a-msg", "Duyuru metnini yaz."); $("a-body").focus(); return; }
  setMsg("a-msg", "");
  const btn = $("a-go"), label = btn.textContent; btn.disabled = true; btn.textContent = "Yayınlanıyor…";
  let ref;
  try {
    ref = doc(collection(db, "announcements"));
    const b = writeBatch(db);
    b.set(ref, { title, body, important, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
    addLog(b, "add", "ann", title);
    await b.commit();
  } catch (e) {
    setMsg("a-msg", e && e.code === "permission-denied" ? "Yetki yok. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Duyuru kaydedilemedi. Biraz sonra tekrar dene.");
    btn.disabled = false; btn.textContent = label; return;
  }
  $("a-title").value = ""; $("a-body").value = ""; $("a-imp").checked = false;
  if (push) {
    try {
      const r = await api("announce", { id: ref.id });
      setMsg("a-msg", "Duyuru yayınlandı. " + (r.devices || 0) + " cihaza bildirim gitti" + (r.users != null ? " (" + r.users + " kişi)" : "") + ".", true);
    } catch (e) { setMsg("a-msg", "Duyuru yayınlandı ama bildirim gönderilemedi: " + apiMsg(e)); }
  } else setMsg("a-msg", "Duyuru yayınlandı (bildirim gönderilmedi).", true);
  btn.disabled = false; btn.textContent = label;
});

/* ---------- DERS PROGRAMI ---------- */
const realToday = () => { const g = nowD().getDay(); return g >= 1 && g <= 5 ? g : 0; };
const lessonOf = (day, i) => S.sched.cells[day + "-" + i] || null;
function renderSch() {
  const days = $("sch-days"); days.textContent = "";
  const rt = realToday();
  DAY_SHORT.forEach((n, k) => {
    const d = k + 1, b = el("button", "pill", n); b.type = "button";
    b.setAttribute("aria-pressed", S.schDay === d ? "true" : "false");
    if (d === rt) { const dot = el("span", "dot"); dot.style.background = "currentColor"; b.insertBefore(dot, b.firstChild); b.title = "Bugün"; }
    b.addEventListener("click", () => { S.schDay = d; S.schSel = ""; renderSch(); });
    days.appendChild(b);
  });
  days.hidden = S.schMode !== "day";
  Array.from($("sch-mode").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === S.schMode ? "true" : "false"));

  const body = $("sch-body"); body.textContent = "";
  const periods = S.sched.periods, hasAny = Object.keys(S.sched.cells).length > 0;
  if (!periods.length || !hasAny) {
    body.appendChild(emptyBox("Ders programı henüz girilmemiş", can("sched") ? "Yönetim > Ders programı bölümünden ekleyebilirsin." : "Yönetici ekleyince burada görünecek."));
    $("sch-detail").hidden = true; return;
  }
  const nm = nowD().getHours() * 60 + nowD().getMinutes();
  if (S.schMode === "day") {
    const ul = el("ul", "lessons");
    let nowI = -1, nextI = -1;
    if (S.schDay === rt) {
      periods.forEach((p, i) => { if (lessonOf(S.schDay, i)) { if (nowI < 0 && toMin(p.start) <= nm && nm < toMin(p.end)) nowI = i; if (nextI < 0 && toMin(p.start) > nm) nextI = i; } });
    }
    periods.forEach((p, i) => {
      const c = lessonOf(S.schDay, i);
      const li = el("li"); const b = el("button", "lesson" + (c ? "" : " free") + (i === nowI ? " now" : "") + (c && S.schSel === c.subject ? " sel" : "")); b.type = "button";
      const t = el("div", "time"); t.appendChild(el("b", "", p.start)); t.appendChild(document.createTextNode(p.end)); b.appendChild(t);
      const w = el("div", "what");
      if (c) {
        const nmEl = el("div", "nm"); const sw = el("span", "swatch"); sw.style.setProperty("--h", String(subHue(c.subject))); nmEl.appendChild(sw);
        nmEl.appendChild(document.createTextNode(c.subject));
        if (i === nowI) nmEl.appendChild(el("span", "tag", "Şimdi"));
        else if (i === nextI) nmEl.appendChild(el("span", "tag next", "Sıradaki"));
        w.appendChild(nmEl);
        const sub2 = [c.teacher, c.room].filter(Boolean).join(" · "); if (sub2) w.appendChild(el("div", "sub2", sub2));
        b.addEventListener("click", () => { S.schSel = S.schSel === c.subject ? "" : c.subject; renderSch(); });
      } else { w.appendChild(el("div", "nm", "Boş")); b.disabled = true; }
      b.appendChild(w); li.appendChild(b); ul.appendChild(li);
    });
    body.appendChild(el("h3", "view-title", DAY_LONG[S.schDay - 1])); body.lastChild.style.fontSize = "1.2rem"; body.lastChild.style.marginBottom = "10px";
    body.appendChild(ul);
  } else {
    const wrap = el("div", "gridwrap"); const tb = el("table", "week");
    const hr = el("tr"); hr.appendChild(el("th"));
    DAY_SHORT.forEach((n, k) => hr.appendChild(el("th", k + 1 === rt ? "today" : "", n)));
    const thead = el("thead"); thead.appendChild(hr); tb.appendChild(thead);
    const tbody = el("tbody");
    periods.forEach((p, i) => {
      const tr = el("tr"); const pt = el("td", "pt"); pt.appendChild(el("b", "", p.start)); pt.appendChild(document.createTextNode(p.end)); tr.appendChild(pt);
      for (let d = 1; d <= 5; d++) {
        const td = el("td"); const c = lessonOf(d, i);
        const b = el("button", "cell" + (c ? "" : " empty-cell") + (d === rt ? " today-col" : "") + (c && S.schSel === c.subject ? " sel" : "")); b.type = "button";
        if (c) {
          b.style.setProperty("--h", String(subHue(c.subject))); b.appendChild(document.createTextNode(c.subject));
          if (c.room) b.appendChild(el("small", "", c.room));
          b.addEventListener("click", () => { S.schSel = S.schSel === c.subject ? "" : c.subject; renderSch(); });
        } else { b.textContent = "–"; b.disabled = true; }
        td.appendChild(b); tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody); wrap.appendChild(tb); body.appendChild(wrap);
  }
  renderSchDetail();
}
function renderSchDetail() {
  const box = $("sch-detail"); box.textContent = "";
  if (!S.schSel) { box.hidden = true; return; }
  box.hidden = false; box.className = "detail";
  const h = el("h3"); h.appendChild(subjectChip(S.schSel)); h.appendChild(document.createTextNode(" için yapılacaklar")); box.appendChild(h);
  const hws = S.hw.filter((x) => x.due && !isExpired(x.due) && (x.subject || "Diğer") === S.schSel).sort((a, b) => a.due.localeCompare(b.due));
  const exs = S.ex.filter((x) => x.date && dayDiff(x.date) >= 0 && (x.subject || "Diğer") === S.schSel).sort((a, b) => a.date.localeCompare(b.date));
  if (!hws.length && !exs.length) { box.appendChild(el("p", "muted", "Bu ders için aktif ödev ya da yaklaşan sınav yok.")); return; }
  if (hws.length) {
    box.appendChild(el("p", "muted", "Ödevler"));
    const ul = el("ul"); hws.forEach((x) => ul.appendChild(el("li", "", x.title + " (" + relDay(x.due) + ")" + (S.done.has(x.id) ? " · yaptın" : "")))); box.appendChild(ul);
  }
  if (exs.length) {
    box.appendChild(el("p", "muted", "Sınavlar"));
    const ul = el("ul"); exs.forEach((x) => ul.appendChild(el("li", "", x.title + " · " + fmtDate(x.date) + " (" + relDay(x.date) + ")"))); box.appendChild(ul);
  }
}
$("sch-mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.schMode = b.dataset.m; renderSch(); });

/* ---------- NOTLARIM (kişisel: sadece sahibi görür, yönetici bile göremez) ---------- */
const KIND_LABEL = { yazili: "Yazılı", sozlu: "Sözlü", proje: "Proje / performans", quiz: "Kısa sınav", diger: "Diğer" };
const fmtScore = (n) => (Math.round(Number(n) * 10) / 10).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const termOfDate = (s) => { const m = parts(s).m; return m >= 9 || m === 1 ? 1 : 2; }; // Eylül-Ocak 1. dönem, Şubat-Ağustos 2. dönem
function bandOf(p) {
  return p >= 85 ? { k: "ok", t: "Pekiyi" } : p >= 70 ? { k: "ok", t: "İyi" } : p >= 55 ? { k: "warn", t: "Orta" }
    : p >= 50 ? { k: "warn", t: "Geçer" } : { k: "crit", t: "Riskli (50 altı)" };
}
let gTarget = Math.min(100, Math.max(50, Number(lsGet("odev-gtarget")) || 70));
let gRem = Math.min(4, Math.max(1, Number(lsGet("odev-grem")) || 1));
let editingG = null, gFromExam = null;
const gAvg = (l) => l.reduce((a, g) => a + Number(g.score), 0) / l.length;
function gGroups(term) {
  const m = new Map();
  S.grades.filter((g) => String(g.term) === String(term)).forEach((g) => { if (!m.has(g.subject)) m.set(g.subject, []); m.get(g.subject).push(g); });
  m.forEach((l) => l.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt || 0) - (b.createdAt || 0)));
  return m;
}
const subjOrder = (a, b) => { const ia = SUBJECTS.findIndex((x) => x.n === a), ib = SUBJECTS.findIndex((x) => x.n === b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); };
// Genel ortalama: ders programı girilmişse derslerin haftalık saatine göre ağırlıklıdır (MEB'in hesabı gibi), yoksa eşit ağırlıklıdır.
function lessonWeights() {
  const w = {};
  Object.keys(S.sched.cells).forEach((k) => { const c = S.sched.cells[k]; if (c && c.subject) w[c.subject] = (w[c.subject] || 0) + 1; });
  return w;
}
function wAvg(pairs) {
  if (!pairs.length) return { avg: null, weighted: false };
  const w = lessonWeights();
  if (pairs.every((p) => w[p.k] > 0)) {
    const tw = pairs.reduce((a, p) => a + w[p.k], 0);
    return { avg: pairs.reduce((a, p) => a + p.v * w[p.k], 0) / tw, weighted: true };
  }
  return { avg: pairs.reduce((a, p) => a + p.v, 0) / pairs.length, weighted: false };
}
function setGStats(avg, n, risk, weighted) {
  $("g-avg").textContent = avg == null ? "–" : avg.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $("g-avg-l").textContent = weighted ? "ağırlıklı ortalama (ders saatine göre)" : "genel ortalama";
  $("g-n").textContent = String(n); $("g-risk").textContent = String(risk);
}
function renderGrades() {
  const box = $("g-list"); if (!box) return; box.textContent = "";
  Array.from($("g-term").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === S.gTerm ? "true" : "false"));
  if (S.gErr) { setGStats(null, 0, 0, false); box.appendChild(emptyBox("Notlar yüklenemedi", S.gErr)); return; }
  if (S.gTerm === "y") { renderGradesYear(box); return; }
  const groups = gGroups(S.gTerm), subs = Array.from(groups.keys()).sort(subjOrder);
  const pts = subs.map((k) => Math.round(gAvg(groups.get(k))));
  const wa = wAvg(subs.map((k, i) => ({ k, v: pts[i] })));
  setGStats(wa.avg, subs.length, pts.filter((p) => p < 50).length, wa.weighted);
  if (!subs.length) {
    box.appendChild(emptyBox(S.grades.length ? "Bu dönemde not yok" : "Henüz not girmedin", "“Not ekle” ile sınav notunu gir. Geçmiş sınavlarda “Notunu gir” düğmesi de var."));
    return;
  }
  const ul = el("ul", "list");
  subs.forEach((k) => ul.appendChild(gCard(k, groups.get(k))));
  box.appendChild(ul);
}
function gCard(sub, list) {
  const avg = gAvg(list), pt = Math.round(avg), band = bandOf(pt), n = list.length, sum = list.reduce((a, g) => a + Number(g.score), 0);
  const li = el("li", "gcard"); li.dataset.band = band.k;
  const head = el("div", "ghead");
  const left = el("div", "top"); left.appendChild(subjectChip(sub));
  left.appendChild(el("span", "chip " + (band.k === "crit" ? "crit" : band.k === "ok" ? "good" : "plain"), band.t));
  head.appendChild(left);
  const sc = el("div", "gscore", String(pt)); sc.appendChild(el("small", "", "ort. " + fmtScore(avg) + " · " + n + " not")); head.appendChild(sc);
  li.appendChild(head);
  const bars = el("div", "bars"); bars.setAttribute("aria-hidden", "true");
  list.slice(-10).forEach((g) => { const b = el("span", Number(g.score) < 50 ? "low" : ""); b.style.height = Math.max(3, Math.round(Number(g.score) * 0.44)) + "px"; b.title = g.title + ": " + fmtScore(g.score); bars.appendChild(b); });
  li.appendChild(bars);
  const rem = gRem, need = ((gTarget - 0.5) * (n + rem) - sum) / rem, tg = el("p", "gtarget");
  if (n >= 4) {
    const sc = list.map((g) => Number(g.score)), last = sc.slice(-3), prev = sc.slice(0, -3).slice(-3);
    const d = last.reduce((a, b) => a + b, 0) / last.length - prev.reduce((a, b) => a + b, 0) / prev.length;
    if (Math.abs(d) >= 5) li.appendChild(el("p", "gtrend", d > 0 ? "Gidişat: son notların yükseliyor." : "Gidişat: son notların düşüyor, dikkat."));
  }
  if (pt >= gTarget) { tg.appendChild(document.createTextNode("Hedefin ")); tg.appendChild(el("b", "", String(gTarget))); tg.appendChild(document.createTextNode(": şu an tutuyor.")); }
  else if (need > 100) { tg.appendChild(document.createTextNode("Hedef ")); tg.appendChild(el("b", "", String(gTarget))); tg.appendChild(document.createTextNode(" için " + rem + " sınav yetmez, daha fazla sınavda toparlamak gerekir.")); }
  else { tg.appendChild(document.createTextNode("Hedef ")); tg.appendChild(el("b", "", String(gTarget))); tg.appendChild(document.createTextNode(rem > 1 ? " için kalan " + rem + " sınavın ortalaması en az " : " için sonraki notun en az ")); tg.appendChild(el("b", "", String(Math.ceil(need)))); tg.appendChild(document.createTextNode(" olmalı.")); }
  li.appendChild(tg);
  if (pt < gTarget) {
    const mb = el("button", "btn btn-quiet btn-small", "Mobi'ye sor: nasıl toparlarım?"); mb.type = "button";
    mb.addEventListener("click", () => openAi(sub + " dersinde ortalamam " + pt + ", hedefim " + gTarget + ". Nasıl toparlayabilirim? Hangi konulara çalışmalıyım?", sub));
    li.appendChild(mb);
  }
  const det = document.createElement("details"); det.open = S.gOpen.has(sub);
  det.addEventListener("toggle", () => { if (det.open) S.gOpen.add(sub); else S.gOpen.delete(sub); });
  det.appendChild(el("summary", "", "Notlar (" + n + ")"));
  list.slice().reverse().forEach((g) => {
    const r = el("div", "grow-row");
    r.appendChild(el("span", "", g.date ? fmtDate(g.date) : ""));
    r.appendChild(el("span", "", g.title + " · " + (KIND_LABEL[g.kind] || "")));
    r.appendChild(el("span", "gs", fmtScore(g.score)));
    const ed = el("button", "lnk", "Düzenle"); ed.type = "button"; ed.addEventListener("click", () => startEditG(g)); r.appendChild(ed);
    r.appendChild(delButton("g:" + g.id, () => deleteDoc(doc(db, "users", S.user.uid, "grades", g.id))));
    det.appendChild(r);
  });
  li.appendChild(det);
  return li;
}
function renderGradesYear(box) {
  const g1 = gGroups(1), g2 = gGroups(2), subs = Array.from(new Set([...g1.keys(), ...g2.keys()])).sort(subjOrder);
  const rows = subs.map((k) => {
    const a = g1.has(k) ? Math.round(gAvg(g1.get(k))) : null, b = g2.has(k) ? Math.round(gAvg(g2.get(k))) : null;
    return { k, a, b, y: a != null && b != null ? Math.round((a + b) / 2) : null };
  });
  const ys = rows.filter((r) => r.y != null).map((r) => r.y);
  const wy = wAvg(rows.filter((r) => r.y != null).map((r) => ({ k: r.k, v: r.y })));
  setGStats(wy.avg, ys.length, ys.filter((p) => p < 50).length, wy.weighted);
  if (!rows.length) { box.appendChild(emptyBox("Henüz not girmedin", "Yıl sonu puanı için iki dönemin notları gerekir.")); return; }
  const ul = el("ul", "list");
  rows.forEach((r) => {
    const li = el("li", "gcard"); const band = r.y != null ? bandOf(r.y) : null; if (band) li.dataset.band = band.k;
    const head = el("div", "ghead"); const left = el("div", "top"); left.appendChild(subjectChip(r.k));
    if (band) left.appendChild(el("span", "chip " + (band.k === "crit" ? "crit" : band.k === "ok" ? "good" : "plain"), band.t));
    head.appendChild(left); li.appendChild(head);
    const gy = el("div", "gyear");
    [["1. dönem", r.a], ["2. dönem", r.b], ["Yıl sonu", r.y]].forEach(([t, v]) => { const c = el("div"); c.appendChild(el("b", "", v == null ? "–" : String(v))); c.appendChild(document.createTextNode(t)); gy.appendChild(c); });
    li.appendChild(gy);
    ul.appendChild(li);
  });
  box.appendChild(ul);
}
$("g-term").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.gTerm = b.dataset.t; renderGrades(); });
$("g-target").value = String(gTarget); $("g-rem").value = String(gRem);
$("g-rem").addEventListener("change", function () { gRem = Math.min(4, Math.max(1, Number(this.value) || 1)); lsSet("odev-grem", String(gRem)); renderGrades(); });
$("g-target").addEventListener("change", function () {
  const v = Math.min(100, Math.max(50, Math.round(Number(this.value) || 70)));
  gTarget = v; this.value = String(v); lsSet("odev-gtarget", String(v)); renderGrades();
});
function resetGForm() {
  $("g-sub").value = ""; $("g-kind").value = "yazili"; $("g-title").value = ""; $("g-score").value = ""; $("g-date").value = todayStr();
  $("g-termsel").value = String(termOfDate(todayStr())); setMsg("g-msg", ""); editingG = null; gFromExam = null;
  $("g-ftitle").textContent = "Yeni not"; $("g-submit").textContent = "Notu kaydet";
}
function showGForm(open) {
  $("g-panel").hidden = !open; $("g-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("g-panel").scrollIntoView({ block: "nearest" }); $("g-score").focus(); }
}
function startEditG(g) {
  resetGForm(); editingG = g.id; $("g-ftitle").textContent = "Notu düzenle"; $("g-submit").textContent = "Değişiklikleri kaydet";
  $("g-sub").value = g.subject; $("g-kind").value = g.kind || "diger"; $("g-title").value = g.title || ""; $("g-score").value = String(g.score);
  $("g-date").value = g.date || todayStr(); $("g-termsel").value = String(g.term || 1); showGForm(true);
}
function openGradeFromExam(x) {
  setView("grd"); resetGForm(); gFromExam = x.id;
  S.gTerm = String(termOfDate(x.date)); renderGrades();
  $("g-sub").value = x.subject || ""; $("g-title").value = x.title || ""; $("g-date").value = x.date; $("g-termsel").value = String(termOfDate(x.date));
  showGForm(true);
}
$("g-add").addEventListener("click", () => { if ($("g-panel").hidden) { resetGForm(); showGForm(true); } else showGForm(false); });
$("g-cancel").addEventListener("click", () => { resetGForm(); showGForm(false); });
$("g-date").addEventListener("change", function () { if (this.value) $("g-termsel").value = String(termOfDate(this.value)); });
$("g-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const subject = $("g-sub").value, title = $("g-title").value.trim(), kind = $("g-kind").value, date = $("g-date").value, raw = $("g-score").value.trim();
  const score = Number(raw.replace(",", ".")), term = Number($("g-termsel").value);
  if (!subject) { setMsg("g-msg", "Dersi seç."); $("g-sub").focus(); return; }
  if (!title) { setMsg("g-msg", "Başlığı yaz (örn. 1. yazılı)."); $("g-title").focus(); return; }
  if (!raw || !isFinite(score) || score < 0 || score > 100) { setMsg("g-msg", "Puan 0 ile 100 arasında olmalı."); $("g-score").focus(); return; }
  if (!date) { setMsg("g-msg", "Tarihi seç."); $("g-date").focus(); return; }
  setMsg("g-msg", "");
  const btn = $("g-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Kaydediliyor…";
  const body = { subject, title, kind, term, score, date };
  const wasEdit = !!editingG, exTopics = gFromExam ? splitItems((S.ex.find((e) => e.id === gFromExam) || {}).topics) : [];
  if (gFromExam) body.examId = gFromExam;
  try {
    if (editingG) await updateDoc(doc(db, "users", S.user.uid, "grades", editingG), body);
    else await setDoc(doc(collection(db, "users", S.user.uid, "grades")), { ...body, createdAt: nowMs() });
    S.gTerm = String(term); resetGForm(); showGForm(false); renderGrades();
    if (!wasEdit && score < gTarget) setTimeout(() => askMiss(subject, score, exTopics), 500);
  } catch (e) {
    setMsg("g-msg", e && e.code === "permission-denied" ? "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Not kaydedilemedi. Biraz sonra tekrar dene.");
    btn.textContent = label;
  }
  btn.disabled = false;
});

/* ---------- TAKVİM ---------- */
// Sabit tarihli resmî tatiller (dinî bayramlar her yıl değiştiği için yönetici "Tatil / ara" etkinliği olarak ekler).
const HOLIDAYS = {
  "01-01": "Yılbaşı", "04-23": "Ulusal Egemenlik ve Çocuk Bayramı", "05-01": "Emek ve Dayanışma Günü",
  "05-19": "Atatürk'ü Anma, Gençlik ve Spor Bayramı", "07-15": "Demokrasi ve Millî Birlik Günü", "08-30": "Zafer Bayramı",
  "10-28": "Cumhuriyet Bayramı arifesi (öğleden sonra tatil)", "10-29": "Cumhuriyet Bayramı"
};
const EV_KIND = { etkinlik: "Etkinlik", gezi: "Gezi", tatil: "Tatil / ara", toplanti: "Toplantı", diger: "Diğer" };
let editingEv = null;
function evCovers(e, ds) { return e.date <= ds && ds <= (e.endDate || e.date); }
function calIndex() {
  const idx = {};
  const at = (d) => (idx[d] = idx[d] || { hw: 0, ex: 0, ev: 0, bd: 0, pl: 0 });
  S.hw.forEach((h) => { if (h.due) at(h.due).hw++; });
  S.ex.forEach((x) => { if (x.date) at(x.date).ex++; });
  { const pm = planDayMap(); Object.keys(pm).forEach((d) => { const n = pm[d].filter((i) => !i.done).length; if (n) at(d).pl = n; }); }
  // Çok günlü etkinlikler (yaz tatili gibi) sadece gösterilen ayın günlerine işlenir, uzunlukları sınırsızdır.
  const first = S.calY + "-" + pad(S.calM + 1) + "-01", last = S.calY + "-" + pad(S.calM + 1) + "-" + pad(new Date(S.calY, S.calM + 1, 0).getDate());
  S.ev.forEach((e) => {
    if (!e.date) return;
    const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    if (end < first || e.date > last) return;
    const from = e.date < first ? first : e.date, to = end > last ? last : end;
    const p = parts(from); const d = new Date(p.y, p.m - 1, p.d);
    for (let i = 0; i < 32; i++) { const ds = dateStr(d); if (ds > to) break; at(ds).ev++; d.setDate(d.getDate() + 1); }
  });
  S.bd.forEach((b) => { if (b && /^\d\d-\d\d$/.test(b.md || "") && Number(b.md.slice(0, 2)) === S.calM + 1) at(S.calY + "-" + b.md).bd++; });
  return idx;
}
const bdOn = (md) => S.bd.filter((b) => b.md === md);
function renderCal() {
  const grid = $("cal-grid"); if (!grid) return; grid.textContent = "";
  $("cal-title").textContent = MONTHS_LONG[S.calM] + " " + S.calY;
  ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].forEach((n, i) => grid.appendChild(el("div", "dh" + (i > 4 ? " we" : ""), n)));
  const lead = (new Date(S.calY, S.calM, 1).getDay() + 6) % 7, days = new Date(S.calY, S.calM + 1, 0).getDate(), today = todayStr(), idx = calIndex();
  for (let i = 0; i < lead; i++) grid.appendChild(el("div", "gap"));
  for (let d = 1; d <= days; d++) {
    const ds = S.calY + "-" + pad(S.calM + 1) + "-" + pad(d), c = idx[ds] || { hw: 0, ex: 0, ev: 0, bd: 0, pl: 0 }, hol = HOLIDAYS[pad(S.calM + 1) + "-" + pad(d)];
    const wd = (lead + d - 1) % 7;
    const b = el("button", "cday" + (wd > 4 ? " we" : "") + (ds === today ? " today" : "") + (ds === S.calSel ? " sel" : "") + (hol ? " hol" : "")); b.type = "button"; b.dataset.d = ds;
    const bits = [d + " " + MONTHS_LONG[S.calM]]; if (c.hw) bits.push(c.hw + " ödev"); if (c.ex) bits.push(c.ex + " sınav"); if (c.ev) bits.push(c.ev + " etkinlik"); if (c.bd) bits.push(c.bd + " doğum günü"); if (c.pl) bits.push(c.pl + " hazırlık planı görevi"); if (hol) bits.push(hol);
    b.setAttribute("aria-label", bits.join(", "));
    b.appendChild(el("span", "num", String(d)));
    const dots = el("span", "dots");
    if (c.hw) dots.appendChild(el("i", "k-hw")); if (c.ex) dots.appendChild(el("i", "k-ex")); if (c.ev) dots.appendChild(el("i", "k-ev")); if (c.bd) dots.appendChild(el("i", "k-bd")); if (c.pl) dots.appendChild(el("i", "k-pl")); if (hol) dots.appendChild(el("i", "k-hol"));
    b.appendChild(dots);
    b.addEventListener("click", () => { S.calSel = ds; renderCal(); });
    grid.appendChild(b);
  }
  renderCalDetail();
}
function renderCalDetail() {
  const box = $("cal-detail"); box.textContent = ""; box.className = "detail";
  if (S.evErr) { box.appendChild(emptyBox("Etkinlikler yüklenemedi", S.evErr)); return; }
  const ds = S.calSel;
  if (!ds) { box.appendChild(el("p", "muted", "Ayrıntı için bir güne dokun.")); return; }
  const p = parts(ds), dt = new Date(p.y, p.m - 1, p.d);
  const h = el("h3", "", p.d + " " + MONTHS_LONG[p.m - 1] + " " + DAY_NAMES[dt.getDay()]); h.appendChild(el("span", "chip plain", relDay(ds))); h.lastChild.style.marginLeft = "8px"; box.appendChild(h);
  const hol = HOLIDAYS[pad(p.m) + "-" + pad(p.d)];
  const hws = S.hw.filter((x) => x.due === ds), exs = S.ex.filter((x) => x.date === ds), evs = S.ev.filter((x) => x.date && evCovers(x, ds));
  const bds = bdOn(pad(p.m) + "-" + pad(p.d)), pls = planDayMap()[ds] || [];
  if (!hol && !hws.length && !exs.length && !evs.length && !bds.length && !pls.length) { box.appendChild(el("p", "muted", "Bu gün için kayıt yok.")); return; }
  const group = (title, rows) => { if (!rows.length) return; const g = el("div", "dgroup"); g.appendChild(el("p", "muted", title)); rows.forEach((r) => g.appendChild(r)); box.appendChild(g); };
  if (hol) { const r = el("div", "drow"); r.appendChild(el("b", "", hol)); r.appendChild(el("small", "", "Resmî tatil")); group("Tatil", [r]); }
  group("Doğum günleri", bds.map((b) => { const r = el("div", "drow"); r.appendChild(el("b", "", b.name || "?")); r.appendChild(el("small", "", "Doğum günü")); return r; }));
  group("Etkinlikler", evs.map((e) => {
    const r = el("div", "drow"); const top = el("div", "top"); top.appendChild(el("span", "chip plain", EV_KIND[e.kind] || "Etkinlik"));
    if (e.endDate && e.endDate > e.date) top.appendChild(el("span", "chip plain", fmtDate(e.date) + " – " + fmtDate(e.endDate)));
    if (e.time) top.appendChild(el("span", "chip plain", "Saat " + e.time));
    r.appendChild(top); r.appendChild(el("b", "", e.title)); if (e.note) r.appendChild(el("small", "", e.note));
    const meta = el("div", "meta"); const who = el("span", "", "Ekleyen: "); who.appendChild(el("span", "who", e.author || "?")); meta.appendChild(who);
    if (canModify(e)) {
      const ed = el("button", "lnk", "Düzenle"); ed.type = "button"; ed.addEventListener("click", () => startEditEv(e)); meta.appendChild(ed);
      meta.appendChild(delButton("ev:" + e.id, () => deleteWithTrash("ev", "events", e)));
    }
    r.appendChild(meta); return r;
  }));
  group("Sınavlar", exs.map((x) => {
    const r = el("div", "drow"); const top = el("div", "top"); top.appendChild(subjectChip(x.subject)); if (x.time) top.appendChild(el("span", "chip plain", "Saat " + x.time));
    r.appendChild(top); r.appendChild(el("b", "", x.title || "Sınav")); if (x.topics) r.appendChild(el("small", "", x.topics)); return r;
  }));
  group("Hazırlık planın", pls.map((i) => {
    const r = el("div", "drow"); const top = el("div", "top"); top.appendChild(subjectChip(i.x.subject)); if (i.done) top.appendChild(el("span", "chip good", "Yaptın"));
    r.appendChild(top);
    const row = el("div", "pl-mini"), ck = el("button", "pl-chk", i.done ? "✓" : ""); ck.type = "button"; ck.setAttribute("aria-label", "Yaptım olarak işaretle"); ck.addEventListener("click", () => planToggle(i.x.id, i.t.key));
    row.appendChild(ck); row.appendChild(el("b", "", i.t.text)); r.appendChild(row); return r;
  }));
  group("Ödev bitişleri", hws.map((x) => {
    const r = el("div", "drow"); const top = el("div", "top"); top.appendChild(subjectChip(x.subject)); if (S.done.has(x.id)) top.appendChild(el("span", "chip good", "Yaptın"));
    r.appendChild(top); r.appendChild(el("b", "", x.title || "Ödev")); if (x.desc) r.appendChild(el("small", "", x.desc)); return r;
  }));
}
function calGo(delta) {
  const d = new Date(S.calY, S.calM + delta, 1); S.calY = d.getFullYear(); S.calM = d.getMonth(); S.calSel = ""; renderCal();
}
$("cal-prev").addEventListener("click", () => calGo(-1));
$("cal-next").addEventListener("click", () => calGo(1));
$("cal-today").addEventListener("click", () => { const n = nowD(); S.calY = n.getFullYear(); S.calM = n.getMonth(); S.calSel = todayStr(); renderCal(); });
function resetEvForm() {
  $("ev-title").value = ""; $("ev-kind").value = "etkinlik"; $("ev-date").value = ""; $("ev-end").value = ""; $("ev-time").value = ""; $("ev-note").value = "";
  setMsg("ev-msg", ""); editingEv = null; $("ev-ftitle").textContent = "Yeni etkinlik"; $("ev-submit").textContent = "Etkinliği kaydet";
}
function showEvForm(open) {
  $("ev-panel").hidden = !open; $("ev-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("ev-date").min = editingEv ? "" : todayStr(); $("ev-panel").scrollIntoView({ block: "nearest" }); $("ev-title").focus(); }
}
function startEditEv(e) {
  resetEvForm(); editingEv = e.id; $("ev-ftitle").textContent = "Etkinliği düzenle"; $("ev-submit").textContent = "Değişiklikleri kaydet";
  $("ev-title").value = e.title || ""; $("ev-kind").value = e.kind || "etkinlik"; $("ev-date").value = e.date || ""; $("ev-end").value = e.endDate || "";
  $("ev-time").value = e.time || ""; $("ev-note").value = e.note || ""; showEvForm(true);
}
$("ev-add").addEventListener("click", () => {
  if ($("ev-panel").hidden) { resetEvForm(); if (S.calSel && S.calSel >= todayStr()) $("ev-date").value = S.calSel; showEvForm(true); } else showEvForm(false);
});
$("ev-cancel").addEventListener("click", () => { resetEvForm(); showEvForm(false); });
$("ev-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const title = $("ev-title").value.trim(), kind = $("ev-kind").value, date = $("ev-date").value, end = $("ev-end").value, time = $("ev-time").value, note = $("ev-note").value.trim();
  if (!title) { setMsg("ev-msg", "Etkinlik adını yaz."); $("ev-title").focus(); return; }
  if (!date) { setMsg("ev-msg", "Tarihi seç."); $("ev-date").focus(); return; }
  if (!editingEv && date < todayStr()) { setMsg("ev-msg", "Tarih bugünden önce olamaz."); $("ev-date").focus(); return; }
  if (end && end < date) { setMsg("ev-msg", "Bitiş tarihi başlangıçtan önce olamaz."); $("ev-end").focus(); return; }
  if (!S.canAdd) { setMsg("ev-msg", "Ekleme iznin kapalı. Yöneticiyle konuş."); return; }
  setMsg("ev-msg", "");
  const btn = $("ev-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Kaydediliyor…";
  const body = { title, kind, date, endDate: end || "", time, note };
  try {
    const b = writeBatch(db);
    if (editingEv) b.update(doc(db, "events", editingEv), body);
    else b.set(doc(collection(db, "events")), { ...body, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
    addLog(b, editingEv ? "edit" : "add", "ev", title);
    await b.commit();
    const p = parts(date); S.calY = p.y; S.calM = p.m - 1; S.calSel = date;
    resetEvForm(); showEvForm(false); renderCal();
  } catch (e) {
    setMsg("ev-msg", e && e.code === "permission-denied" ? "Bu işlem için yetkin yok. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Etkinlik kaydedilemedi. Biraz sonra tekrar dene.");
    btn.textContent = label;
  }
  btn.disabled = false;
});

/* ---------- DERS NOTLARI (paylaşım) ---------- */
let editingNt = null, editingNtObj = null, ntPhotos = [], ntMode = "none", ntBusy = false;
function setNtPhotos(list, mode) {
  ntPhotos = list || []; ntMode = mode || (ntPhotos.length ? "new" : "none");
  $("nt-prev").hidden = ntMode === "none"; $("nt-keep").hidden = ntMode !== "keep";
  const box = $("nt-prev-imgs"); box.textContent = "";
  if (ntMode === "new") ntPhotos.forEach((d) => { const im = document.createElement("img"); im.src = d; im.alt = "Seçilen fotoğraf"; box.appendChild(im); });
}
$("nt-photos").addEventListener("change", async function () {
  const files = Array.from(this.files || []).slice(0, 3); if (!files.length) return;
  ntBusy = true; setMsg("nt-msg", ""); $("nt-submit").disabled = true;
  try {
    const out = [];
    for (const f of files) out.push(await compress(f));
    setNtPhotos(out, "new");
    if ((this.files || []).length > 3) setMsg("nt-msg", "En fazla 3 fotoğraf eklenir, ilk 3'ü alındı.");
  } catch (e) { setMsg("nt-msg", "Fotoğraf okunamadı. JPG ya da PNG dene."); }
  ntBusy = false; $("nt-submit").disabled = false; this.value = "";
});
$("nt-rm").addEventListener("click", () => setNtPhotos([], "none"));
function resetNtForm() {
  $("nt-title").value = ""; $("nt-sub").value = ""; $("nt-body").value = ""; $("nt-link").value = "";
  setNtPhotos([], "none"); setMsg("nt-msg", ""); editingNt = null; editingNtObj = null;
  $("nt-ftitle").textContent = "Yeni not"; $("nt-submit").textContent = "Paylaş";
}
function showNtForm(open) {
  $("nt-panel").hidden = !open; $("nt-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("nt-panel").scrollIntoView({ block: "nearest" }); $("nt-title").focus(); }
}
function startEditNt(n) {
  resetNtForm(); editingNt = n.id; editingNtObj = n; $("nt-ftitle").textContent = "Notu düzenle"; $("nt-submit").textContent = "Değişiklikleri kaydet";
  $("nt-title").value = n.title || ""; $("nt-sub").value = n.subject || "Diğer"; $("nt-body").value = n.body || ""; $("nt-link").value = n.link || "";
  setNtPhotos([], n.photoCount > 0 ? "keep" : "none"); setView("nts"); showNtForm(true);
}
$("nt-add").addEventListener("click", () => { if ($("nt-panel").hidden) { resetNtForm(); showNtForm(true); } else showNtForm(false); });
$("nt-cancel").addEventListener("click", () => { resetNtForm(); showNtForm(false); });
$("nt-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (ntBusy) return;
  const title = $("nt-title").value.trim(), subject = $("nt-sub").value, body = $("nt-body").value.trim(), link = $("nt-link").value.trim();
  if (!title) { setMsg("nt-msg", "Başlığı yaz."); $("nt-title").focus(); return; }
  if (!subject) { setMsg("nt-msg", "Dersi seç."); $("nt-sub").focus(); return; }
  if (link && !/^https:\/\/[^\s]+$/i.test(link)) { setMsg("nt-msg", "Bağlantı https:// ile başlamalı ve boşluk içermemeli."); $("nt-link").focus(); return; }
  if (!body && !link && ntMode === "none") { setMsg("nt-msg", "Not metni, bağlantı ya da fotoğraf ekle."); $("nt-body").focus(); return; }
  if (!S.canAdd) { setMsg("nt-msg", "Ekleme iznin kapalı. Yöneticiyle konuş."); return; }
  setMsg("nt-msg", "");
  const btn = $("nt-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Kaydediliyor…";
  const n0 = editingNtObj, had = n0 ? n0.photoCount || 0 : 0;
  const count = ntMode === "new" ? ntPhotos.length : ntMode === "keep" ? had : 0;
  const data = { title, subject, body, link, photoCount: count };
  try {
    const b = writeBatch(db);
    addLog(b, editingNt ? "edit" : "add", "note", title);
    if (editingNt) {
      b.update(doc(db, "notes", editingNt), data);
      if (ntMode === "new") { if (had > 0) b.update(doc(db, "notePhotos", editingNt), { data: ntPhotos }); else b.set(doc(db, "notePhotos", editingNt), { data: ntPhotos, uid: S.user.uid }); }
      else if (ntMode === "none" && had > 0) b.delete(doc(db, "notePhotos", editingNt));
      await b.commit(); noteCache.delete(editingNt);
    } else {
      const ref = doc(collection(db, "notes"));
      b.set(ref, { ...data, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
      if (ntMode === "new") b.set(doc(db, "notePhotos", ref.id), { data: ntPhotos, uid: S.user.uid });
      await b.commit();
    }
    resetNtForm(); showNtForm(false);
  } catch (e) {
    setMsg("nt-msg", e && e.code === "permission-denied" ? "Bu işlem için yetkin yok. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Not kaydedilemedi. Biraz sonra tekrar dene.");
    btn.textContent = label;
  }
  btn.disabled = false;
});
function deleteNote(n) {
  const b = writeBatch(db);
  b.delete(doc(db, "notes", n.id));
  if (n.photoCount > 0) b.delete(doc(db, "notePhotos", n.id));
  addTrash(b, "note", n.id, stripId(n));
  addLog(b, "del", "note", n.title);
  return b.commit();
}
function toggleLike(n) {
  const uid = S.user.uid, liked = Array.isArray(n.likes) && n.likes.indexOf(uid) >= 0;
  return updateDoc(doc(db, "notes", n.id), { likes: liked ? arrayRemove(uid) : arrayUnion(uid) }).catch(() => toast("Beğeni kaydedilemedi."));
}
async function loadNotePhotos(n, btn) {
  try {
    if (!noteCache.has(n.id)) {
      btn.disabled = true; btn.textContent = "Yükleniyor…";
      const s = await getDoc(doc(db, "notePhotos", n.id));
      const d = s.exists() && Array.isArray(s.data().data) ? s.data().data : [];
      if (!d.length) throw new Error("yok");
      noteCache.set(n.id, d);
    }
    S.ntShown.add(n.id); renderNotes();
  } catch (e) { toast("Fotoğraflar yüklenemedi."); btn.disabled = false; btn.textContent = "Fotoğrafları göster (" + n.photoCount + ")"; }
}
function noteCard(n) {
  const li = el("li", "ncard");
  const top = el("div", "top"); top.appendChild(subjectChip(n.subject)); if (n.createdAt) top.appendChild(el("span", "chip plain", fmtStamp(n.createdAt))); li.appendChild(top);
  li.appendChild(el("h3", "title", n.title || "Not"));
  if (n.body) li.appendChild(el("p", "desc", n.body));
  if (n.link && /^https:\/\//i.test(n.link)) {
    const a = el("a", "btn btn-quiet btn-small linkbtn"); a.href = n.link; a.target = "_blank"; a.rel = "noopener noreferrer";
    let host = ""; try { host = new URL(n.link).hostname.replace(/^www\./, ""); } catch (e) {}
    a.textContent = "Bağlantıyı aç" + (host ? " · " + host : ""); li.appendChild(a);
  }
  if (n.photoCount > 0) {
    const cached = noteCache.get(n.id);
    if (S.ntShown.has(n.id) && cached) {
      const row = el("div", "nphotos");
      cached.forEach((d) => {
        const tb = el("button", "thumb"); tb.type = "button"; tb.setAttribute("aria-label", "Fotoğrafı büyüt");
        const im = document.createElement("img"); im.src = d; im.alt = "Ders notu fotoğrafı"; tb.appendChild(im);
        tb.addEventListener("click", () => { $("lb-img").src = d; $("lb").hidden = false; $("lb-close").focus(); });
        row.appendChild(tb);
      });
      li.appendChild(row);
    } else {
      const pb = el("button", "btn btn-quiet btn-small photo-btn", "Fotoğrafları göster (" + n.photoCount + ")"); pb.type = "button";
      pb.addEventListener("click", () => loadNotePhotos(n, pb)); li.appendChild(pb);
    }
  }
  if (S.aiOn !== false && String(n.body || "").trim().length >= 60) {
    const nb = el("button", "btn btn-quiet btn-small", "Özet ve kartlar (Mobi)"); nb.type = "button"; nb.addEventListener("click", () => openNoteCards(n)); li.appendChild(nb);
  }
  if (S.aiOn !== false && (String(n.title || "").trim().length >= 3)) {
    const rb = el("button", "btn btn-quiet btn-small", "Tekerleme yap"); rb.type = "button"; rb.addEventListener("click", () => openRhyme({ title: n.title, subject: n.subject || "", text: n.body || "", form: "tekerleme" })); li.appendChild(rb);
  }
  const likes = Array.isArray(n.likes) ? n.likes : [], liked = !!(S.user && likes.indexOf(S.user.uid) >= 0);
  const lk = el("button", "like"); lk.type = "button"; lk.setAttribute("aria-pressed", liked ? "true" : "false");
  lk.setAttribute("aria-label", liked ? "Faydalı işaretini kaldır" : "Faydalı buldum");
  const ic = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  ic.appendChild(svgEl("path", { d: "M12 20.5s-7.5-4.4-9-9.4C2 7.8 4 5 7 5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3 0 5 2.8 4 6.1-1.5 5-9 9.4-9 9.4z" }));
  lk.appendChild(ic); lk.appendChild(document.createTextNode(likes.length ? "Faydalı · " + likes.length : "Faydalı buldum"));
  lk.addEventListener("click", () => toggleLike(n));
  li.appendChild(lk);
  const meta = el("div", "meta"); const who = el("span", "", "Paylaşan: "); who.appendChild(el("span", "who", n.author || "Bilinmiyor")); meta.appendChild(who);
  if (canModify(n)) {
    const ed = el("button", "lnk", "Düzenle"); ed.type = "button"; ed.addEventListener("click", () => startEditNt(n)); meta.appendChild(ed);
    meta.appendChild(delButton("nt:" + n.id, () => deleteNote(n)));
  }
  li.appendChild(meta);
  return li;
}
function renderNotes() {
  const box = $("nt-list"); if (!box) return; box.textContent = "";
  Array.from($("nt-subs").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === S.ntF.sub ? "true" : "false"));
  if (S.ntErr) { box.appendChild(emptyBox("Ders notları yüklenemedi", S.ntErr)); return; }
  $("nt-top").setAttribute("aria-pressed", S.ntTop ? "true" : "false");
  const q = S.ntF.q.trim().toLocaleLowerCase("tr");
  const items = S.notes.filter((n) => {
    if (S.ntF.sub !== "all" && (n.subject || "Diğer") !== S.ntF.sub) return false;
    if (q && ((n.title || "") + " " + (n.body || "") + " " + (n.author || "") + " " + (n.subject || "")).toLocaleLowerCase("tr").indexOf(q) < 0) return false;
    return true;
  });
  if (S.ntTop) items.sort((a, b) => ((b.likes || []).length - (a.likes || []).length) || ((b.createdAt || 0) - (a.createdAt || 0)));
  if (!items.length) {
    box.appendChild(S.notes.length ? emptyBox("Filtreye uyan not yok", "", "Filtreleri temizle", () => { S.ntF = { q: "", sub: "all" }; $("nt-q").value = ""; renderNotes(); })
      : emptyBox("Henüz paylaşılan not yok", "İlk notu “Not paylaş” ile ekleyebilirsin."));
    return;
  }
  const ul = el("ul", "list"); items.forEach((n) => ul.appendChild(noteCard(n))); box.appendChild(ul);
}
$("nt-q").addEventListener("input", function () { S.ntF.q = this.value; renderNotes(); });
$("nt-top").addEventListener("click", () => { S.ntTop = !S.ntTop; renderNotes(); });

/* ---------- AYARLAR ---------- */
function pushEnv() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (ios && !standalone) return "ios-install";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return "ok";
}
function deviceOn() { const t = lsGet("odev-fcm"); return !!(t && S.profile && Array.isArray(S.profile.tokens) && S.profile.tokens.indexOf(t) >= 0); }
function syncSettings() {
  if (!S.profile) return;
  $("set-name").textContent = S.profile.name || "-";
  $("set-email").textContent = S.profile.email || (S.user && S.user.email) || "-";
  const nt = curNotify();
  $("n17").checked = nt.h17; $("n20").checked = nt.h20; $("n-ann").checked = nt.ann;
  $("n-exam").checked = nt.exam; $("n-week").checked = nt.week; $("n-bday").checked = nt.bday; $("n-vib").checked = nt.vib;
  $("n-sound").checked = lsGet("odev-sound") !== "0";
  Array.from($("n-subs").children).forEach((b) => b.setAttribute("aria-pressed", nt.subs.indexOf(b.dataset.v) >= 0 ? "true" : "false"));
  syncBirthday();
  const env = pushEnv(), hint = $("push-hint"), btn = $("push-btn"), st = $("push-status");
  hint.hidden = true; btn.hidden = false; btn.disabled = false;
  if (env === "ios-install") {
    hint.hidden = false; btn.hidden = true;
    hint.textContent = "iPhone'da bildirim için önce siteyi ana ekrana ekle: Safari'de bu sayfayı aç, Paylaş düğmesine dokun, “Ana Ekrana Ekle”yi seç. Sonra ana ekrandaki simgeden açıp Ayarlar'dan bildirimleri aç.";
    st.textContent = "";
  } else if (env === "unsupported") {
    hint.hidden = false; btn.hidden = true; hint.textContent = "Bu tarayıcı bildirimleri desteklemiyor. Android'de Chrome, iPhone'da ana ekrana eklenmiş Safari kullan.";
    st.textContent = "";
  } else if ("Notification" in window && Notification.permission === "denied") {
    hint.hidden = false; hint.textContent = "Bildirimler bu tarayıcıda engellenmiş. Tarayıcının site ayarlarından bildirim iznini aç, sonra tekrar dene.";
    st.textContent = ""; btn.textContent = "Bu cihazda bildirimleri aç";
  } else if (deviceOn()) {
    st.textContent = "Bu cihazda bildirimler açık."; btn.textContent = "Bu cihazda bildirimleri kapat";
  } else {
    st.textContent = "Bu cihazda bildirimler kapalı."; btn.textContent = "Bu cihazda bildirimleri aç";
  }
}
async function enablePush() {
  setMsg("push-msg", "");
  if (!vapidKey || String(vapidKey).indexOf("BURAYA") === 0) { setMsg("push-msg", "Bildirim anahtarı (VAPID) henüz girilmemiş. Yöneticiye haber ver."); return; }
  try {
    if (!(await isSupported())) { setMsg("push-msg", "Bu tarayıcı bildirimleri desteklemiyor."); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setMsg("push-msg", "Bildirim izni verilmedi."); syncSettings(); return; }
    const reg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
    messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) { setMsg("push-msg", "Bildirim anahtarı alınamadı. Tekrar dene."); return; }
    lsSet("odev-fcm", token);
    await updateDoc(doc(db, "users", S.user.uid), { tokens: arrayUnion(token), notify: curNotify() });
    listenForeground();
    syncSettings();
    toast("Bildirimler açıldı.");
  } catch (e) { console.error(e); setMsg("push-msg", "Bildirimler açılamadı. Biraz sonra tekrar dene."); }
}
async function disablePush() {
  setMsg("push-msg", "");
  const t = lsGet("odev-fcm");
  try {
    if (t) await updateDoc(doc(db, "users", S.user.uid), { tokens: arrayRemove(t) });
    try { await deleteToken(messaging || getMessaging(app)); } catch (e) {}
    lsSet("odev-fcm", null); syncSettings(); toast("Bu cihazda bildirimler kapatıldı.");
  } catch (e) { setMsg("push-msg", "Kapatılamadı. Tekrar dene."); }
}
let fgBound = false;
function listenForeground() {
  if (fgBound) return;
  try {
    messaging = messaging || getMessaging(app);
    onMessage(messaging, (p) => {
      const n = p && p.notification;
      if (n) toast((n.title || "") + (n.body ? " · " + n.body : ""));
      if (lsGet("odev-sound") !== "0") beep();
    });
    fgBound = true;
  } catch (e) {}
}
/* Kısa bildirim sesi (uygulama açıkken). Tarayıcı izin vermezse sessizce geçer. */
function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = new AC(), t = ac.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t + i * 0.18); g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.18);
    });
    setTimeout(() => { try { ac.close(); } catch (e) {} }, 800);
  } catch (e) {}
}
$("push-btn").addEventListener("click", () => { if (deviceOn()) disablePush(); else enablePush(); });
// Bildirim tercihleri: hesapta tutulur, hatırlatma göndericisi buna göre davranır.
function curNotify() {
  const nt = (S.profile && S.profile.notify) || {};
  return {
    h17: nt.h17 !== false, h20: nt.h20 !== false, ann: nt.ann !== false, exam: nt.exam !== false,
    week: nt.week !== false, bday: nt.bday !== false, vib: nt.vib !== false,
    subs: Array.isArray(nt.subs) ? nt.subs.slice(0, 12) : []
  };
}
async function saveNotify(subs) {
  const n = { h17: $("n17").checked, h20: $("n20").checked, ann: $("n-ann").checked, exam: $("n-exam").checked, week: $("n-week").checked, bday: $("n-bday").checked, vib: $("n-vib").checked, subs: Array.isArray(subs) ? subs : curNotify().subs };
  try { await updateDoc(doc(db, "users", S.user.uid), { notify: n }); }
  catch (e) { setMsg("push-msg", "Kaydedilemedi."); }
}
["n17", "n20", "n-ann", "n-exam", "n-week", "n-bday", "n-vib"].forEach((id) => $(id).addEventListener("change", () => saveNotify()));
$("n-sound").addEventListener("change", function () { lsSet("odev-sound", this.checked ? "1" : "0"); if (this.checked) beep(); });
{
  const box = $("n-subs");
  SUBJECTS.filter((s) => s.n !== "Diğer").forEach((s) => {
    const b = el("button", "pill"); b.type = "button"; b.dataset.v = s.n; b.setAttribute("aria-pressed", "false");
    const d = el("span", "dot"); d.style.setProperty("--h", String(s.h)); b.appendChild(d); b.appendChild(document.createTextNode(s.n));
    b.addEventListener("click", () => {
      const cur = new Set(curNotify().subs); if (cur.has(s.n)) cur.delete(s.n); else cur.add(s.n);
      saveNotify(Array.from(cur));
    });
    box.appendChild(b);
  });
}
async function postLogin() {
  try {
    if (pushEnv() === "ok" && "Notification" in window && Notification.permission === "granted" && lsGet("odev-fcm") && (await isSupported())) {
      const reg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
      await navigator.serviceWorker.ready;
      messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
      if (token && token !== lsGet("odev-fcm")) { await updateDoc(doc(db, "users", S.user.uid), { tokens: arrayUnion(token) }); lsSet("odev-fcm", token); }
      listenForeground();
    }
  } catch (e) { /* sessizce geç */ }
}

$("pw-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const old = $("pw-old").value, nw = $("pw-new").value;
  if (!old || !nw) { setMsg("pw-msg", "İki alanı da doldur."); return; }
  if (nw.length < 6) { setMsg("pw-msg", "Yeni şifre en az 6 karakter olmalı."); return; }
  try {
    await reauthenticateWithCredential(S.user, EmailAuthProvider.credential(S.user.email, old));
    await updatePassword(S.user, nw);
    $("pw-old").value = ""; $("pw-new").value = ""; setMsg("pw-msg", "Şifren değiştirildi.", true);
  } catch (e) { setMsg("pw-msg", authMsg(e)); }
});

/* Görünüm ayarları (her cihazda kendine ait) */
const SCALES = [0.9, 1, 1.15, 1.3];
let scaleIdx = 1;
const root = document.documentElement;
function applyScale() { root.style.fontSize = 14 * SCALES[scaleIdx] + "px"; $("fs-down").disabled = scaleIdx === 0; $("fs-up").disabled = scaleIdx === SCALES.length - 1; }
function applyTheme(v) {
  if (v === "light" || v === "dark") root.setAttribute("data-theme", v); else root.removeAttribute("data-theme");
  Array.from($("theme-seg").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"));
}
function applyAccent(v) {
  if (v === "yesil") root.removeAttribute("data-accent"); else root.setAttribute("data-accent", v);
  Array.from($("swatches").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"));
}
$("theme-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; lsSet("odev-theme", b.dataset.v); applyTheme(b.dataset.v); });
$("swatches").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; lsSet("odev-accent", b.dataset.v); applyAccent(b.dataset.v); });
$("fs-down").addEventListener("click", () => { if (scaleIdx > 0) { scaleIdx--; lsSet("odev-scale", String(scaleIdx)); applyScale(); } });
$("fs-up").addEventListener("click", () => { if (scaleIdx < SCALES.length - 1) { scaleIdx++; lsSet("odev-scale", String(scaleIdx)); applyScale(); } });
{
  const sv = lsGet("odev-scale"); if (sv !== null && SCALES[Number(sv)]) scaleIdx = Number(sv); applyScale();
  const tv = lsGet("odev-theme"); if (tv === "light" || tv === "dark") applyTheme(tv);
  const av = lsGet("odev-accent"); if (av === "mavi" || av === "bordo" || av === "turuncu") applyAccent(av);
}

/* ---------- YÖNETİM: kullanıcılar ---------- */
const ADM_TAB_PERM = { fb: null, users: null, roles: null, logs: null, trash: null, maint: null, req: "req", sched: "sched", calimp: "cal" };
const admTabOk = (t) => (ADM_TAB_PERM[t] ? can(ADM_TAB_PERM[t]) : S.isAdmin);
function renderAdmTabs() {
  document.querySelectorAll("#adm-tabs .tab").forEach((b) => { b.hidden = !admTabOk(b.dataset.adm); });
  if (S.admTab && !admTabOk(S.admTab)) { const f = Array.from(document.querySelectorAll("#adm-tabs .tab")).find((b) => !b.hidden); if (f) setAdmTab(f.dataset.adm); }
}
function setAdmTab(t) {
  if (!admTabOk(t)) return;
  S.admTab = t;
  document.querySelectorAll("#adm-tabs .tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.adm === t ? "true" : "false"));
  ["users", "req", "roles", "sched", "calimp", "logs", "trash", "maint", "fb"].forEach((k) => { $("adm-" + k).hidden = t !== k; });
  if (t === "fb") renderFb();
  if (t === "logs") renderLogs();
  if (t === "trash") renderTrash();
}
document.querySelectorAll("#adm-tabs .tab").forEach((b) => b.addEventListener("click", () => setAdmTab(b.dataset.adm)));
function renderLast() {
  const l = S.last, n = $("last-rem");
  if (!l || !l.at) { n.textContent = "Henüz hatırlatma gönderilmedi. Gönderici ilk çalıştığında burada görünür."; n.classList.remove("warn"); return; }
  const d = new Date(l.at), stale = nowMs() - l.at > 26 * 3600000;
  n.textContent = "Son hatırlatma: " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) +
    " (" + (l.slot === "h17" ? "17:00" : "20:00") + " turu) · " + (l.sent || 0) + " kişiye gönderildi." +
    (stale ? " Bu 1 günden eski: zamanlayıcı durmuş olabilir. GitHub'da Actions sekmesine bak, gerekirse yeniden etkinleştir." : "");
  n.classList.toggle("warn", stale);
}
function renderAdmUsers() {
  if (!S.isAdmin) return;
  const list = $("u-list"); list.textContent = "";
  $("u-count").textContent = S.users.length ? "(" + S.users.length + ")" : "";
  const users = S.users.slice().sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) || (a.name || "").localeCompare(b.name || "", "tr"));
  if (!users.length) { list.appendChild(emptyBox("Henüz kullanıcı yok", "Yukarıdaki formdan oluştur.")); return; }
  users.forEach((u) => {
    const r = el("div", "urow");
    const top = el("div", "u-top");
    top.appendChild(el("span", "u-name", u.name || "(adsız)"));
    top.appendChild(el("span", "chip " + (u.role === "admin" ? "" : "plain"), u.role === "admin" ? "Yönetici" : "Öğrenci"));
    const nTok = Array.isArray(u.tokens) ? u.tokens.length : 0;
    top.appendChild(el("span", "chip " + (nTok ? "good" : "plain"), nTok ? "Bildirim: " + nTok + " cihaz" : "Bildirim kapalı"));
    if (u.canAdd === false) top.appendChild(el("span", "chip crit-solid", "Ekleme kapalı"));
    if (u.role !== "admin" && u.roleName) top.appendChild(el("span", "chip", u.roleName));
    if (S.acct) {
      const a = S.acct[u.id];
      if (!a) top.appendChild(el("span", "chip crit-solid", "Giriş hesabı yok"));
      else {
        top.appendChild(el("span", "chip plain", a.last ? "Son giriş: " + agoText(a.last) : "Hiç giriş yapmadı"));
        if (a.disabled) top.appendChild(el("span", "chip crit-solid", "Hesap kapalı"));
      }
    }
    r.appendChild(top);
    r.appendChild(el("div", "u-mail", u.email || ""));
    if (S.acct && !S.acct[u.id]) r.appendChild(el("div", "u-mail", "Bu kişinin giriş hesabı Firebase'de yok, giriş yapamaz. “Hesabı sil” deyip yeniden oluştur."));
    const act = el("div", "u-act");
    const me = S.user && u.id === S.user.uid;
    const rs = el("button", "lnk", "Şifre sıfırlama e-postası gönder"); rs.type = "button";
    rs.addEventListener("click", async () => { try { await sendPasswordResetEmail(auth, u.email); toast("Sıfırlama e-postası gönderildi."); } catch (e) { toast(authMsg(e)); } });
    act.appendChild(rs);
    const sp = el("button", "lnk", S.pwFor === u.id ? "Şifre belirlemeyi kapat" : "Şifre belirle"); sp.type = "button";
    sp.addEventListener("click", () => { S.pwFor = S.pwFor === u.id ? "" : u.id; S.pwDraft = ""; S.pwShown = null; renderAdmUsers(); });
    act.appendChild(sp);
    if (!me) {
      const ca = el("button", "lnk", u.canAdd === false ? "Eklemeyi aç" : "Eklemeyi kapat"); ca.type = "button";
      ca.addEventListener("click", () => updateDoc(doc(db, "users", u.id), { canAdd: u.canAdd === false }).catch(() => toast("Değiştirilemedi.")));
      act.appendChild(ca);
      if (u.role !== "admin" && Object.keys(S.roles).length) act.appendChild(roleSelect(u.roleId || "", (v) => assignRole(u, v)));
      const rl = el("button", "lnk", u.role === "admin" ? "Öğrenci yap" : "Yönetici yap"); rl.type = "button";
      rl.addEventListener("click", () => updateDoc(doc(db, "users", u.id), { role: u.role === "admin" ? "student" : "admin" }).catch(() => toast("Değiştirilemedi.")));
      act.appendChild(rl);
      const key = "u:" + u.id;
      const dl = el("button", "lnk", armedId === key ? "Hesabı silmek için tekrar dokun" : "Hesabı sil"); dl.type = "button"; dl.dataset.armed = armedId === key ? "1" : "0";
      dl.addEventListener("click", () => {
        if (armedId !== key) { armedId = key; clearTimeout(armTimer); armTimer = setTimeout(() => { armedId = null; renderAdmUsers(); }, 4000); renderAdmUsers(); return; }
        armedId = null; removeUser(u);
      });
      act.appendChild(dl);
    }
    r.appendChild(act);
    if (S.pwFor === u.id) r.appendChild(pwBox(u));
    list.appendChild(r);
  });
  renderAcctNote();
}
function renderAcctNote() {
  const n = $("acct-note"), b = $("acct-refresh");
  b.disabled = S.acctBusy; b.textContent = S.acctBusy ? "Kontrol ediliyor…" : "Giriş hesaplarını kontrol et";
  if (S.acctErr) { n.hidden = false; n.textContent = "Giriş hesapları kontrol edilemedi: " + S.acctErr; }
  else if (S.acct) {
    const missing = S.users.filter((u) => !S.acct[u.id]).length;
    n.hidden = false;
    n.textContent = missing ? missing + " kişinin giriş hesabı yok. Bu kişiler giriş yapamaz, aşağıda kırmızı etiketle işaretli." : "Tüm kullanıcıların giriş hesabı var.";
  } else n.hidden = true;
  const op = $("u-orph"), ol = $("u-orph-list");
  op.hidden = !S.orphans.length; ol.textContent = "";
  S.orphans.forEach((o) => {
    const r = el("div", "urow");
    r.appendChild(el("div", "u-mail", (o.name ? o.name + " · " : "") + (o.email || o.uid)));
    r.appendChild(el("div", "u-mail", o.last ? "Son giriş: " + agoText(o.last) : "Hiç giriş yapmadı"));
    const act = el("div", "u-act");
    const ad = el("button", "lnk", "Sınıfa öğrenci olarak ekle"); ad.type = "button";
    ad.addEventListener("click", async () => {
      ad.disabled = true;
      try { await api("adoptUser", { uid: o.uid, name: o.name || "" }); toast("Sınıfa eklendi."); loadAcct(); }
      catch (e) { toast(apiMsg(e)); ad.disabled = false; }
    });
    act.appendChild(ad); r.appendChild(act); ol.appendChild(r);
  });
}
function pwBox(u) {
  const box = el("div", "pwbox");
  if (S.pwShown && S.pwShown.id === u.id) {
    const c = el("div", "cred");
    c.appendChild(el("strong", "", "Şifre değişti. Kişiye ver:"));
    const p = el("div"); p.appendChild(document.createTextNode("E-posta: ")); p.appendChild(el("code", "", u.email || "")); c.appendChild(p);
    const q = el("div"); q.appendChild(document.createTextNode("Yeni şifre: ")); q.appendChild(el("code", "", S.pwShown.pass)); c.appendChild(q);
    box.appendChild(c); return box;
  }
  const f = el("div", "pwrow");
  const inp = document.createElement("input"); inp.type = "text"; inp.placeholder = "Yeni şifre (en az 6, boşluksuz)";
  inp.autocomplete = "off"; inp.autocapitalize = "none"; inp.spellcheck = false; inp.value = S.pwDraft; inp.setAttribute("aria-label", u.name + " için yeni şifre");
  inp.addEventListener("input", () => { S.pwDraft = inp.value; });
  const go = el("button", "btn btn-primary btn-small", "Kaydet"); go.type = "button";
  go.addEventListener("click", async () => {
    const pass = S.pwDraft.trim();
    if (pass.length < 6) { toast("Şifre en az 6 karakter olmalı."); return; }
    if (/\s/.test(pass)) { toast("Şifrede boşluk olmasın."); return; }
    go.disabled = true; go.textContent = "Kaydediliyor…";
    try { await api("setPassword", { uid: u.id, password: pass }); S.pwShown = { id: u.id, pass }; S.pwDraft = ""; renderAdmUsers(); }
    catch (e) { toast(apiMsg(e)); go.disabled = false; go.textContent = "Kaydet"; }
  });
  f.appendChild(inp); f.appendChild(go); box.appendChild(f);
  return box;
}
async function removeUser(u) {
  try { await api("deleteUser", { uid: u.id }); toast("Hesap tamamen silindi."); loadAcct(); return; }
  catch (e) {
    if (e && e.status && e.status !== 404 && e.status !== 405 && e.code !== "config") { toast(apiMsg(e)); return; }
  }
  // Sunucu fonksiyonu kurulu değilse: sadece erişimi kaldır (giriş hesabı Firebase'de kalır).
  try { await deleteDoc(doc(db, "users", u.id)); toast("Erişim kaldırıldı. Giriş hesabı Firebase > Authentication'dan elle silinebilir."); }
  catch (e) { toast("Kaldırılamadı."); }
}
/* Eski yol: sunucu fonksiyonu yoksa hesabı tarayıcıdan açar (yönetici oturumu bozulmasın diye ikinci uygulama örneğiyle). */
async function createViaClient(name, email, pass, role, roleId) {
  const sec = getApps().find((a) => a.name === "sec") || initializeApp(firebaseConfig, "sec");
  const a2 = getAuth(sec);
  let uid;
  try { uid = (await createUserWithEmailAndPassword(a2, email, pass)).user.uid; }
  catch (e) {
    if (e && e.code === "auth/email-already-in-use") {
      try { uid = (await signInWithEmailAndPassword(a2, email, pass)).user.uid; }
      catch (e2) { throw { code: "x-exists-other-pass" }; }
    } else throw e;
  }
  try { await signOut(a2); } catch (e) {}
  await setDoc(doc(db, "users", uid), Object.assign({ name, email, role, createdAt: nowMs(), tokens: [], notify: { h17: true, h20: true, ann: true } }, roleId && S.roles[roleId] ? roleFieldsOf(roleId) : {}));
  return uid;
}
$("u-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("u-name").value.trim(), email = $("u-email").value.trim().toLowerCase(), pass = $("u-pass").value.trim(), role = $("u-role").value;
  const roleId = role === "student" ? $("u-roleid").value : "";
  $("u-cred").hidden = true;
  if (!name) { setMsg("u-msg", "Ad Soyad yaz."); return; }
  if (!email) { setMsg("u-msg", "E-posta yaz."); return; }
  if (pass.length < 6) { setMsg("u-msg", "Şifre en az 6 karakter olmalı."); return; }
  if (/\s/.test(pass)) { setMsg("u-msg", "Şifrede boşluk olmasın."); return; }
  setMsg("u-msg", ""); const btn = $("u-go"); btn.disabled = true; btn.textContent = "Oluşturuluyor…";
  try {
    try {
      const r = await api("createUser", { name, email, password: pass, role, roleId });
      if (!r || !r.uid) throw { status: 404 };
    } catch (e) {
      if (e && e.status === 409) throw { code: "x-exists" };
      if (e && e.status === 400) throw { code: "x-bad-" + e.code };
      if (e && (e.status === 401 || e.status === 403)) throw { code: "x-forbidden" };
      await createViaClient(name, email, pass, role, roleId); // sunucu fonksiyonu kurulu değil ya da ulaşılamıyor
    }
    const body = $("u-cred-body"); body.textContent = "";
    [["Ad", name], ["E-posta", email], ["Şifre", pass], ["Site", location.origin + location.pathname]].forEach(([k, v]) => {
      const p = el("div"); p.appendChild(document.createTextNode(k + ": ")); p.appendChild(el("code", "", v)); body.appendChild(p);
    });
    $("u-cred").hidden = false;
    $("u-form").reset();
    loadAcct();
  } catch (e) {
    const c = e && e.code;
    setMsg("u-msg", c === "x-exists-other-pass"
      ? "Bu e-posta daha önce kaydedilmiş ve şifresi farklı. Kişiye eski şifresini sor ya da listeden “Şifre belirle” kullan."
      : c === "x-exists" ? "Bu e-posta zaten sınıfta kayıtlı. Listeden “Şifre belirle” ile yeni şifre ver."
      : c === "x-bad-ad" ? "Ad Soyad geçersiz (en fazla 40 karakter)."
      : c === "x-bad-eposta" ? "E-posta adresi geçerli görünmüyor."
      : c === "x-bad-sifre" ? "Şifre en az 6 karakter olmalı, boşluk olmasın."
      : c === "x-forbidden" ? "Bu işlem için yönetici girişi gerekli. Çıkıp tekrar gir."
      : c === "permission-denied" ? "Kullanıcı hesabı açıldı ama profili kaydedilemedi. Güvenlik kurallarını kontrol et."
      : authMsg(e));
  }
  btn.disabled = false; btn.textContent = "Kullanıcıyı oluştur";
});
$("u-copy").addEventListener("click", async () => {
  const text = $("u-cred-body").innerText;
  try { await navigator.clipboard.writeText(text); toast("Kopyalandı."); }
  catch (e) { const r = document.createRange(); r.selectNodeContents($("u-cred-body")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Metin seçildi, elle kopyala."); }
});

/* ---------- YÖNETİM: ders programı düzenleyici ---------- */
function markDirty() { S.dirty = true; setMsg("s-msg", "Kaydedilmemiş değişiklikler var.", false); }
function renderAdmSch() {
  if (!can("sched") || !S.draft) return;
  const pl = $("p-list"); pl.textContent = "";
  S.draft.periods.forEach((p, i) => {
    const r = el("div", "prow");
    const a = document.createElement("input"); a.type = "time"; a.value = p.start || ""; a.setAttribute("aria-label", (i + 1) + ". ders başlangıç");
    const b = document.createElement("input"); b.type = "time"; b.value = p.end || ""; b.setAttribute("aria-label", (i + 1) + ". ders bitiş");
    a.addEventListener("change", () => { p.start = a.value; markDirty(); renderGrid(); });
    b.addEventListener("change", () => { p.end = b.value; markDirty(); renderGrid(); });
    const rm = el("button", "btn btn-quiet btn-small", (i + 1) + ". dersi sil"); rm.type = "button";
    rm.addEventListener("click", () => removePeriod(i));
    r.appendChild(a); r.appendChild(b); r.appendChild(rm); pl.appendChild(r);
  });
  if (!S.draft.periods.length) pl.appendChild(el("p", "muted", "Henüz ders saati yok."));
  renderGrid();
}
function removePeriod(i) {
  S.draft.periods.splice(i, 1);
  const nc = {};
  Object.keys(S.draft.cells).forEach((k) => {
    const [d, idx] = k.split("-").map(Number);
    if (idx === i) return;
    nc[d + "-" + (idx > i ? idx - 1 : idx)] = S.draft.cells[k];
  });
  S.draft.cells = nc; S.cellSel = null; $("c-panel").hidden = true; markDirty(); renderAdmSch();
}
function renderGrid() {
  const g = $("g-grid"); g.textContent = "";
  if (!S.draft.periods.length) { g.appendChild(el("p", "muted", "Önce ders saatlerini ekle.")); return; }
  const tb = el("table", "week"); const hr = el("tr"); hr.appendChild(el("th"));
  DAY_SHORT.forEach((n) => hr.appendChild(el("th", "", n)));
  const th = el("thead"); th.appendChild(hr); tb.appendChild(th);
  const tbody = el("tbody");
  S.draft.periods.forEach((p, i) => {
    const tr = el("tr"); const pt = el("td", "pt"); pt.appendChild(el("b", "", p.start || "--:--")); pt.appendChild(document.createTextNode(p.end || "--:--")); tr.appendChild(pt);
    for (let d = 1; d <= 5; d++) {
      const td = el("td"); const c = S.draft.cells[d + "-" + i];
      const sel = S.cellSel && S.cellSel.d === d && S.cellSel.i === i;
      const b = el("button", "cell" + (c ? "" : " empty-cell") + (sel ? " sel" : "")); b.type = "button";
      if (c) { b.style.setProperty("--h", String(subHue(c.subject))); b.appendChild(document.createTextNode(c.subject)); if (c.room) b.appendChild(el("small", "", c.room)); }
      else b.textContent = "+";
      b.addEventListener("click", () => openCell(d, i));
      td.appendChild(b); tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  tb.appendChild(tbody); const wrap = el("div"); wrap.appendChild(tb); g.appendChild(wrap);
}
function openCell(d, i) {
  S.cellSel = { d, i };
  const c = S.draft.cells[d + "-" + i] || {}, p = S.draft.periods[i];
  $("c-title").textContent = DAY_LONG[d - 1] + ", " + (i + 1) + ". ders (" + (p.start || "--:--") + "-" + (p.end || "--:--") + ")";
  $("c-sub").value = c.subject || ""; $("c-teacher").value = c.teacher || ""; $("c-room").value = c.room || "";
  $("c-panel").hidden = false; renderGrid(); $("c-panel").scrollIntoView({ block: "nearest" });
}
$("c-apply").addEventListener("click", () => {
  if (!S.cellSel) return;
  const k = S.cellSel.d + "-" + S.cellSel.i, sub = $("c-sub").value;
  if (!sub) delete S.draft.cells[k];
  else S.draft.cells[k] = { subject: sub, teacher: $("c-teacher").value.trim(), room: $("c-room").value.trim() };
  S.cellSel = null; $("c-panel").hidden = true; markDirty(); renderGrid();
});
$("c-clear").addEventListener("click", () => {
  if (!S.cellSel) return;
  delete S.draft.cells[S.cellSel.d + "-" + S.cellSel.i]; S.cellSel = null; $("c-panel").hidden = true; markDirty(); renderGrid();
});
$("p-add").addEventListener("click", () => {
  const last = S.draft.periods[S.draft.periods.length - 1];
  let start = "08:30", end = "09:10";
  if (last && last.end) { const m = toMin(last.end) + 10; start = pad(Math.floor(m / 60)) + ":" + pad(m % 60); const e = m + 40; end = pad(Math.floor(e / 60)) + ":" + pad(e % 60); }
  S.draft.periods.push({ start, end }); markDirty(); renderAdmSch();
});
$("p-default").addEventListener("click", () => { S.draft.periods = JSON.parse(JSON.stringify(DEFAULT_PERIODS)); markDirty(); renderAdmSch(); });
$("s-save").addEventListener("click", async () => {
  for (const p of S.draft.periods) { if (!p.start || !p.end || toMin(p.start) >= toMin(p.end)) { setMsg("s-msg", "Bir ders saatinde başlangıç, bitişten önce olmalı."); return; } }
  const btn = $("s-save"); btn.disabled = true; btn.textContent = "Kaydediliyor…";
  try {
    await setDoc(doc(db, "config", "schedule"), { periods: S.draft.periods, cells: S.draft.cells, updatedAt: Date.now() });
    S.dirty = false; setMsg("s-msg", "Program kaydedildi. Herkes görebilir.", true);
  } catch (e) { setMsg("s-msg", "Kaydedilemedi. Yetkini ve güvenlik kurallarını kontrol et."); }
  btn.disabled = false; btn.textContent = "Programı kaydet";
});

/* ---------- YÖNETİM: bakım ---------- */
let cleanRefs = null;
$("m-clean").addEventListener("click", async () => {
  if (!S.isAdmin) return;
  const btn = $("m-clean"), cut = cutoffStr();
  btn.disabled = true;
  try {
    if (!cleanRefs) {
      btn.textContent = "Sayılıyor…";
      const logCut = nowMs() - 30 * 86400000;
      // Etkinlikler uzun sürebildiği için bitişi geçmiş olanlara bakılır (bitişi yoksa başlangıcı).
      const evCut = dateStr(new Date(nowMs() - 400 * 86400000));
      const [h, e, v, lg, tr] = await Promise.all([
        getDocs(query(collection(db, "homework"), where("due", "<", cut))),
        getDocs(query(collection(db, "exams"), where("date", "<", cut))),
        getDocs(query(collection(db, "events"), where("date", "<", evCut))),
        getDocs(query(collection(db, "logs"), where("at", "<", logCut))),
        getDocs(query(collection(db, "trash"), where("at", "<", logCut)))
      ]);
      const refs = [];
      h.docs.forEach((d) => { refs.push(d.ref); if (d.data().hasPhoto) refs.push(doc(db, "photos", d.id)); });
      e.docs.forEach((d) => refs.push(d.ref));
      v.docs.forEach((d) => refs.push(d.ref));
      lg.docs.forEach((d) => refs.push(d.ref));
      tr.docs.forEach((d) => refs.push(d.ref));
      if (!refs.length) { setMsg("m-msg", "Silinecek eski kayıt yok.", true); btn.textContent = "Eski kayıtları sil"; btn.disabled = false; return; }
      cleanRefs = refs;
      setMsg("m-msg", h.size + " ödev, " + e.size + " sınav, " + v.size + " etkinlik ve " + lg.size + " kayıt satırı silinecek." + (tr.size ? " Ayrıca 30 günden eski " + tr.size + " çöp kaydı silinecek." : "") + " Onaylamak için düğmeye tekrar bas.");
      btn.textContent = "Evet, sil"; btn.disabled = false; return;
    }
    btn.textContent = "Siliniyor…";
    const refs = cleanRefs; cleanRefs = null;
    for (let i = 0; i < refs.length; i += 400) {
      const b = writeBatch(db); refs.slice(i, i + 400).forEach((r) => b.delete(r)); await b.commit();
    }
    setMsg("m-msg", refs.length + " kayıt silindi.", true);
  } catch (e) { cleanRefs = null; setMsg("m-msg", "Silinemedi. Yetkini ve bağlantını kontrol et."); }
  btn.textContent = "Eski kayıtları sil"; btn.disabled = false;
});

$("m-days").addEventListener("change", async function () {
  setMsg("m-days-msg", "");
  try { await setDoc(doc(db, "config", "settings"), { reminderDays: Number(this.value), updatedAt: nowMs() }, { merge: true }); setMsg("m-days-msg", "Kaydedildi. Hatırlatmalar bu ayara göre gider.", true); }
  catch (e) { setMsg("m-days-msg", "Kaydedilemedi. Yetkini ve güvenlik kurallarını kontrol et."); }
});

/* ---------- YÖNETİM: giriş hesapları ve kayıtlar ---------- */
function agoText(ms) {
  const m = Math.max(0, Math.round((nowMs() - ms) / 60000));
  if (m < 2) return "az önce";
  if (m < 60) return m + " dk önce";
  const h = Math.round(m / 60); if (h < 24) return h + " saat önce";
  const d = Math.round(h / 24); return d + " gün önce";
}
async function loadAcct() {
  if (!S.isAdmin) return;
  S.acctBusy = true; renderAdmUsers();
  try { const r = await api("accountStatus", {}); S.acct = r.accounts || {}; S.orphans = Array.isArray(r.orphans) ? r.orphans : []; S.acctErr = ""; }
  catch (e) { S.acct = null; S.orphans = []; S.acctErr = apiMsg(e); }
  S.acctBusy = false; renderAdmUsers();
}
$("acct-refresh").addEventListener("click", loadAcct);
const KIND_TEXT = { hw: "ödev", ex: "sınav", ev: "etkinlik", note: "ders notu", ann: "duyuru", qa: "soru", poll: "anket" };
const TYPE_TEXT = { add: "ekledi", edit: "düzenledi", del: "sildi" };
function renderLogs() {
  const box = $("log-list"); if (!box || !S.isAdmin) return; box.textContent = "";
  if (!S.logs.length) { box.appendChild(emptyBox("Henüz kayıt yok", "Birisi ödev, sınav, etkinlik ya da not eklediğinde burada görünür.")); return; }
  S.logs.forEach((l) => {
    const r = el("div", "lrow");
    r.appendChild(el("span", "lt", fmtStamp(l.at)));
    r.appendChild(el("b", "", l.by || "?"));
    r.appendChild(document.createTextNode((KIND_TEXT[l.kind] || "kayıt") + " " + (TYPE_TEXT[l.type] || "işledi") + ":"));
    r.appendChild(el("span", "", l.title || ""));
    box.appendChild(r);
  });
}

/* ---------- Çizim yardımcıları (grafikler) ---------- */
function svgEl(tag, attrs, text) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}
function lineChart(box, pts) {
  box.textContent = "";
  if (!pts.length) { box.appendChild(el("p", "muted", "Henüz veri yok.")); return; }
  const W = 320, H = 170, L = 30, R = 12, T = 18, B = 28;
  const s = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Net gelişimi grafiği" });
  const ys = pts.map((p) => p.y), lo = Math.min(0, ...ys), hi = Math.max(1, ...ys), span = hi - lo || 1;
  const X = (i) => (pts.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const Y = (v) => T + ((hi - v) / span) * (H - T - B);
  s.appendChild(svgEl("line", { class: "axis", x1: L, y1: Y(0), x2: W - R, y2: Y(0) }));
  s.appendChild(svgEl("text", { class: "lb", x: L - 4, y: Y(0) + 3, "text-anchor": "end" }, "0"));
  s.appendChild(svgEl("text", { class: "lb", x: L - 4, y: Y(hi) + 3, "text-anchor": "end" }, String(Math.round(hi))));
  if (pts.length > 1) s.appendChild(svgEl("polyline", { class: "ln", points: pts.map((p, i) => X(i) + "," + Y(p.y)).join(" ") }));
  pts.forEach((p, i) => {
    s.appendChild(svgEl("circle", { class: "pt", cx: X(i), cy: Y(p.y), r: 4 }));
    s.appendChild(svgEl("text", { class: "vl", x: X(i), y: Y(p.y) - 8, "text-anchor": "middle" }, p.v));
    if (pts.length <= 7 || i % 2 === 0 || i === pts.length - 1) s.appendChild(svgEl("text", { class: "lb", x: X(i), y: H - 8, "text-anchor": "middle" }, p.x));
  });
  box.appendChild(s);
}
function barChart(box, items) {
  box.textContent = "";
  const W = 320, H = 150, L = 8, R = 8, T = 18, B = 24;
  const s = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Son 7 gün çalışma süresi" });
  const mx = Math.max(30, ...items.map((i) => i.v)), bw = (W - L - R) / items.length;
  s.appendChild(svgEl("line", { class: "axis", x1: L, y1: H - B, x2: W - R, y2: H - B }));
  items.forEach((it, i) => {
    const h = it.v ? Math.max(3, (it.v / mx) * (H - T - B)) : 3, x = L + i * bw + bw * 0.18, w = bw * 0.64;
    s.appendChild(svgEl("rect", { class: "bar-r" + (it.v ? "" : " zero"), x, y: H - B - h, width: w, height: h, rx: 4 }));
    if (it.v) s.appendChild(svgEl("text", { class: "vl", x: x + w / 2, y: H - B - h - 5, "text-anchor": "middle" }, String(it.v)));
    s.appendChild(svgEl("text", { class: "lb", x: x + w / 2, y: H - 8, "text-anchor": "middle" }, it.x));
  });
  box.appendChild(s);
}
function closeThreadKey(key) {
  S.cmOpen.delete(key);
  const u = live.get(key); if (u) { try { u(); } catch (e) {} live.delete(key); }
  delete S.cm[key];
}

/* ---------- BUGÜN ---------- */
function dutyAt(offset) {
  const d = S.info.duty;
  if (!d.length || !S.info.dutyStart) return "";
  const mon = (s) => { const p = parts(s), dt = new Date(p.y, p.m - 1, p.d); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()); };
  const w = Math.floor((mon(todayStr()) - mon(S.info.dutyStart)) / (7 * 86400000)) + offset;
  return d[((w % d.length) + d.length) % d.length];
}
function countBlock(days) {
  const c = el("div", "count" + (days <= 1 ? " crit" : days <= 3 ? " warn" : ""));
  c.appendChild(el("b", "", String(days))); c.appendChild(el("span", "", days === 0 ? "bugün" : "gün"));
  return c;
}
function renderToday() {
  if (!$("td-date") || !S.profile || !S.user) return;
  renderMobiSuggest(); renderWeek(); renderJoke(); renderInstall();
  const n = nowD(), nm = n.getHours() * 60 + n.getMinutes(), rt = realToday();
  $("td-date").textContent = DAY_NAMES[n.getDay()] + ", " + n.getDate() + " " + MONTHS_LONG[n.getMonth()];
  // Doğum günü
  const bn = $("td-bday"), tb = bdOn(pad(n.getMonth() + 1) + "-" + pad(n.getDate()));
  if (tb.length) {
    const mine = tb.some((b) => b.id === S.user.uid), others = tb.filter((b) => b.id !== S.user.uid).map((b) => b.name);
    bn.textContent = (mine ? "Bugün senin doğum günün, kutlu olsun! " : "") + (others.length ? "Bugün doğum günü olanlar: " + others.join(", ") + "." : "");
    bn.hidden = false;
  } else bn.hidden = true;
  // Dersler
  const lbox = $("td-lessons"); lbox.textContent = "";
  const periods = S.sched.periods;
  if (!periods.length || !Object.keys(S.sched.cells).length) {
    $("td-ltitle").textContent = "Dersler"; lbox.appendChild(el("p", "muted", "Ders programı henüz girilmemiş."));
  } else {
    let day = rt || 1, title = rt ? "Bugünkü dersler" : "Pazartesi dersleri";
    if (rt) {
      let lastEnd = -1; periods.forEach((p, i) => { if (lessonOf(rt, i)) lastEnd = Math.max(lastEnd, toMin(p.end)); });
      if (lastEnd >= 0 && nm >= lastEnd) { day = rt === 5 ? 1 : rt + 1; title = rt === 5 ? "Pazartesi dersleri" : "Yarınki dersler"; }
    }
    $("td-ltitle").textContent = title;
    let nowI = -1, nextI = -1;
    if (day === rt) periods.forEach((p, i) => { if (lessonOf(day, i)) { if (nowI < 0 && toMin(p.start) <= nm && nm < toMin(p.end)) nowI = i; if (nextI < 0 && toMin(p.start) > nm) nextI = i; } });
    let shown = 0;
    periods.forEach((p, i) => {
      const c = lessonOf(day, i); if (!c) return; shown++;
      const r = el("div", "tdrow" + (i === nowI ? " now" : ""));
      const tm = el("div", "tm"); tm.appendChild(el("b", "", p.start)); tm.appendChild(document.createTextNode(p.end)); r.appendChild(tm);
      const tt = el("div", "tt"); tt.appendChild(el("b", "", c.subject));
      const sub2 = [c.teacher, c.room].filter(Boolean).join(" · "); if (sub2) tt.appendChild(el("small", "", sub2));
      r.appendChild(tt);
      if (i === nowI) r.appendChild(el("span", "tag", "Şimdi")); else if (i === nextI) r.appendChild(el("span", "tag next", "Sıradaki"));
      lbox.appendChild(r);
    });
    if (!shown) lbox.appendChild(el("p", "muted", "Bu gün için ders girilmemiş."));
  }
  // Yaklaşan ödevler (yapmadıkların)
  const hbox = $("td-hw"); hbox.textContent = "";
  const upc = S.hw.filter((h) => h.due && !isExpired(h.due) && !S.done.has(h.id)).sort((a, b) => a.due.localeCompare(b.due) || (a.createdAt || 0) - (b.createdAt || 0));
  if (!S.hwLoaded) hbox.appendChild(el("p", "muted", "Yükleniyor…"));
  else if (!upc.length) hbox.appendChild(el("p", "muted", "Yapmadığın ödev yok. Harika."));
  else {
    upc.slice(0, 5).forEach((h) => {
      const r = el("div", "tdrow"); r.appendChild(countBlock(Math.max(0, dayDiff(h.due))));
      const tt = el("div", "tt"); tt.appendChild(el("b", "", h.title || "Ödev")); tt.appendChild(el("small", "", (h.subject || "Diğer") + " · " + fmtDate(h.due))); r.appendChild(tt);
      const mb = el("button", "btn btn-quiet btn-small", "Yaptım"); mb.type = "button"; mb.addEventListener("click", () => toggleDone(h.id)); r.appendChild(mb);
      hbox.appendChild(r);
    });
    if (upc.length > 5) hbox.appendChild(el("p", "muted", "Ve " + (upc.length - 5) + " ödev daha."));
  }
  // Sınav geri sayımı
  const ebox = $("td-ex"); ebox.textContent = "";
  const ups = S.ex.filter((x) => x.date && dayDiff(x.date) >= 0).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 3);
  if (!S.exLoaded) ebox.appendChild(el("p", "muted", "Yükleniyor…"));
  else if (!ups.length) ebox.appendChild(el("p", "muted", "Yaklaşan sınav yok."));
  else ups.forEach((x) => {
    const r = el("div", "tdrow"); r.appendChild(countBlock(dayDiff(x.date)));
    const tt = el("div", "tt"); tt.appendChild(el("b", "", (x.subject || "Sınav") + " · " + (x.title || "sınav")));
    const items = splitItems(x.topics), k = items.filter((_, i) => (S.prog[x.id] || []).indexOf(i) >= 0).length;
    tt.appendChild(el("small", "", fmtDate(x.date) + (x.time ? " · " + x.time : "") + (items.length >= 2 ? " · konu " + k + "/" + items.length : "")));
    r.appendChild(tt); ebox.appendChild(r);
  });
  // Haftalık özet kartı renderWeek() ile çizilir.
  // Nöbetçi
  const cur = dutyAt(0), dbx = $("td-duty-box");
  dbx.hidden = !cur;
  if (cur) {
    const d = $("td-duty"); d.textContent = "";
    const me = (S.profile.name || "").toLocaleLowerCase("tr") === cur.toLocaleLowerCase("tr");
    d.appendChild(el("p", "", "Bu hafta nöbetçi: " + cur + (me ? " (sensin!)" : "")));
    const nx = dutyAt(1); if (nx) d.appendChild(el("p", "muted", "Gelecek hafta: " + nx));
  }
  // Son duyuru
  const a = S.ann[0], abx = $("td-ann-box"); abx.hidden = !a;
  if (a) {
    const d = $("td-ann"); d.textContent = "";
    d.appendChild(el("b", "", (a.important ? "Önemli: " : "") + (a.title || "Duyuru")));
    d.appendChild(el("p", "muted", (a.body || "").slice(0, 160) + ((a.body || "").length > 160 ? "…" : "")));
    const g = el("button", "lnk", "Duyurulara git ›"); g.type = "button"; g.addEventListener("click", () => setView("ann")); d.appendChild(g);
  }
}

/* ---------- ÇALIŞMA SAYACI ---------- */
const studyMin = (ds) => (S.study[ds] ? S.study[ds].min : 0);
function renderStudy() {
  if (!$("st-today")) return;
  const t = todayStr(), items = []; let wk = 0;
  for (let i = 6; i >= 0; i--) { const ds = addDays(t, -i), p = parts(ds), v = studyMin(ds); wk += v; items.push({ x: DOW[new Date(p.y, p.m - 1, p.d).getDay()], v }); }
  $("st-today").textContent = String(studyMin(t)); $("st-week").textContent = String(wk);
  let streak = 0, i = studyMin(t) > 0 ? 0 : 1;
  while (i < 70 && studyMin(addDays(t, -i)) > 0) { streak++; i++; }
  $("st-streak").textContent = String(streak);
  barChart($("st-chart"), items);
}
async function addStudy(min, subj) {
  min = Math.round(min); if (!(min >= 1)) return false;
  const day = todayStr(), cur = S.study[day] || { min: 0, by: {} }, key = subj || "Diğer";
  const by = { ...cur.by, [key]: (Number(cur.by[key]) || 0) + min }, total = Math.min(1440, cur.min + min);
  try {
    await setDoc(doc(db, "users", S.user.uid, "study", day), { d: day, min: total, by });
    { const sk = studyStreakNow(), ck = "odev-fun-streak"; if (sk >= 7 && sk % 7 === 0 && lsGet(ck) !== todayStr()) { lsSet(ck, todayStr()); celebrate("streak", sk); } }
    S.study[day] = { min: total, by }; renderStudy(); renderToday(); return true;
  } catch (e) { toast("Çalışma süresi kaydedilemedi."); return false; }
}
const ST = { mode: "focus", run: false, endAt: 0, left: 1500, int: null };
const ST_LENS = { focus: [15, 20, 25, 30, 45, 50, 60, 90], short: [5, 10], long: [15, 20, 30] };
const ST_DEF = { focus: 25, short: 5, long: 15 };
const stLen = () => Number($("st-len").value) || ST_DEF[ST.mode];
function stFill() {
  const sel = $("st-len"); sel.textContent = "";
  ST_LENS[ST.mode].forEach((n) => { const o = el("option", "", n + " dk"); o.value = String(n); sel.appendChild(o); });
  sel.value = String(ST_DEF[ST.mode]); ST.left = ST_DEF[ST.mode] * 60;
}
function stShow() {
  const tm = document.querySelector("#v-study .timer");
  $("st-time").textContent = pad(Math.floor(ST.left / 60)) + ":" + pad(ST.left % 60);
  tm.dataset.run = ST.run ? "1" : "0"; tm.dataset.mode = ST.mode;
  $("st-go").textContent = ST.run ? "Duraklat" : (ST.left < stLen() * 60 ? "Devam et" : "Başlat");
  Array.from($("st-mode").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === ST.mode ? "true" : "false"));
  $("st-sub").disabled = ST.mode !== "focus";
}
function stStop() { if (ST.int) { clearInterval(ST.int); ST.int = null; } ST.run = false; }
function stReset() { stStop(); ST.left = stLen() * 60; stShow(); }
function stNotify(t, b) {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  if (lsGet("odev-sound") !== "0") beep();
  try { if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification(t, { body: b, icon: "icons/icon-192.png" }); } catch (e) {}
}
async function stDone() {
  stStop();
  if (ST.mode === "focus") {
    const mins = stLen(), ok = await addStudy(mins, $("st-sub").value);
    toast(ok ? "Odak süresi bitti, " + mins + " dk kaydedildi." : "Odak süresi bitti.");
    stNotify("Odak süresi bitti", mins + " dakika çalıştın. Mola ver.");
    ST.mode = "short";
  } else {
    toast("Mola bitti. Çalışmaya dön.");
    stNotify("Mola bitti", "Yeni bir odak turu başlat.");
    ST.mode = "focus";
  }
  stFill(); stShow();
}
function stTick() { ST.left = Math.max(0, Math.ceil((ST.endAt - Date.now()) / 1000)); stShow(); if (ST.left <= 0) stDone(); }
$("st-mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; stStop(); ST.mode = b.dataset.m; stFill(); stShow(); });
$("st-len").addEventListener("change", () => { if (!ST.run) { ST.left = stLen() * 60; stShow(); } });
$("st-go").addEventListener("click", () => {
  if (ST.run) { ST.left = Math.max(0, Math.ceil((ST.endAt - Date.now()) / 1000)); stStop(); stShow(); return; }
  if (ST.left <= 0) ST.left = stLen() * 60;
  ST.endAt = Date.now() + ST.left * 1000; ST.run = true; ST.int = setInterval(stTick, 500); stShow();
});
$("st-reset").addEventListener("click", stReset);
$("st-add").addEventListener("click", async () => {
  const m = Number($("st-man").value);
  if (!Number.isInteger(m) || m < 1 || m > 600) { setMsg("st-msg", "Süre 1 ile 600 dakika arasında olmalı."); return; }
  setMsg("st-msg", "");
  if (await addStudy(m, $("st-mansub").value)) { $("st-man").value = ""; setMsg("st-msg", m + " dakika eklendi.", true); }
});

/* ---------- DENEME SINAVLARI (kişisel) ---------- */
const trNet = (r) => r.c - r.w / 4; // 4 yanlış 1 doğruyu götürür
const fmtNet = (n) => (Math.round(n * 100) / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const fmtSigned = (n) => (n > 0 ? "+" : "") + fmtNet(n);
function trGroups() {
  const m = new Map();
  S.trials.forEach((r) => { if (!m.has(r.grp)) m.set(r.grp, { grp: r.grp, title: r.title, date: r.date, rows: [] }); m.get(r.grp).rows.push(r); });
  const out = Array.from(m.values());
  out.forEach((g) => { g.rows.sort((a, b) => TRIAL_SUBJECTS.indexOf(a.subject) - TRIAL_SUBJECTS.indexOf(b.subject)); g.net = g.rows.reduce((s, r) => s + trNet(r), 0); });
  out.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.grp.localeCompare(b.grp));
  return out; // eskiden yeniye
}
function buildTrRows() {
  const box = $("tr-rows"); box.textContent = "";
  const head = el("div", "trhead"); ["Ders", "Doğru", "Yanlış", "Boş"].forEach((t) => head.appendChild(el("span", "", t))); box.appendChild(head);
  TRIAL_SUBJECTS.forEach((s, i) => {
    const r = el("div", "trrow"); r.appendChild(el("span", "nm", s));
    [["c", "doğru"], ["w", "yanlış"], ["b", "boş"]].forEach(([k, lbl]) => {
      const inp = document.createElement("input"); inp.type = "number"; inp.inputMode = "numeric"; inp.min = "0"; inp.max = "200"; inp.id = "tr-" + k + "-" + i;
      inp.setAttribute("aria-label", s + " " + lbl); r.appendChild(inp);
    });
    box.appendChild(r);
  });
}
function renderTrials() {
  const box = $("tr-list"); if (!box) return; box.textContent = "";
  if (S.trErr) { $("tr-avg").textContent = "–"; $("tr-last").textContent = "–"; $("tr-diff").textContent = "–"; $("tr-chartbox").hidden = true; box.appendChild(emptyBox("Deneme sonuçların yüklenemedi", S.trErr)); return; }
  const gs = trGroups();
  $("tr-avg").textContent = gs.length ? fmtNet(gs.reduce((a, g) => a + g.net, 0) / gs.length) : "–";
  $("tr-last").textContent = gs.length ? fmtNet(gs[gs.length - 1].net) : "–";
  $("tr-diff").textContent = gs.length > 1 ? fmtSigned(gs[gs.length - 1].net - gs[gs.length - 2].net) : "–";
  $("tr-chartbox").hidden = !gs.length;
  if (!gs.length) { box.appendChild(emptyBox("Henüz deneme eklemedin", "“Deneme ekle” ile doğru, yanlış ve boş sayılarını gir. Net otomatik hesaplanır.")); return; }
  // Grafik: toplam net ya da seçilen dersin neti
  const subs = TRIAL_SUBJECTS.filter((s) => S.trials.some((r) => r.subject === s));
  if (S.trSub !== "all" && subs.indexOf(S.trSub) < 0) S.trSub = "all";
  const sel = $("tr-chartsub"); sel.textContent = "";
  [["all", "Toplam net"]].concat(subs.map((s) => [s, s])).forEach(([v, t]) => { const o = el("option", "", t); o.value = v; sel.appendChild(o); });
  sel.value = S.trSub;
  const pts = [];
  gs.forEach((g) => {
    if (S.trSub === "all") pts.push({ x: fmtDate(g.date), y: g.net, v: fmtNet(g.net) });
    else { const r = g.rows.find((q) => q.subject === S.trSub); if (r) pts.push({ x: fmtDate(g.date), y: trNet(r), v: fmtNet(trNet(r)) }); }
  });
  lineChart($("tr-chart"), pts.slice(-12));
  const ul = el("ul", "list");
  gs.slice().reverse().forEach((g) => {
    const li = el("li", "tcard");
    const head = el("div", "ghead"), left = el("div"); left.appendChild(el("h3", "title", g.title)); left.appendChild(el("span", "hint", fmtDate(g.date)));
    head.appendChild(left);
    const sc = el("div", "gscore", fmtNet(g.net)); sc.appendChild(el("small", "", "toplam net")); head.appendChild(sc); li.appendChild(head);
    const grid = el("div", "tgrid");
    ["Ders", "Doğru", "Yanlış", "Boş", "Net"].forEach((t) => grid.appendChild(el("span", "h", t)));
    g.rows.forEach((r) => [r.subject, r.c, r.w, r.b, fmtNet(trNet(r))].forEach((v) => grid.appendChild(el("span", "", String(v)))));
    li.appendChild(grid);
    const meta = el("div", "meta");
    meta.appendChild(delButton("tr:" + g.grp, () => { const b = writeBatch(db); S.trials.filter((r) => r.grp === g.grp).forEach((r) => b.delete(doc(db, "users", S.user.uid, "trials", r.id))); return b.commit(); }));
    li.appendChild(meta); ul.appendChild(li);
  });
  box.appendChild(ul);
}
$("tr-chartsub").addEventListener("change", function () { S.trSub = this.value; renderTrials(); });
function resetTrForm() {
  $("tr-title").value = ""; $("tr-date").value = todayStr(); setMsg("tr-msg", "");
  TRIAL_SUBJECTS.forEach((_, i) => ["c", "w", "b"].forEach((k) => { $("tr-" + k + "-" + i).value = ""; }));
}
function showTrForm(open) {
  $("tr-panel").hidden = !open; $("tr-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("tr-panel").scrollIntoView({ block: "nearest" }); $("tr-title").focus(); }
}
$("tr-add").addEventListener("click", () => { if ($("tr-panel").hidden) { resetTrForm(); showTrForm(true); } else showTrForm(false); });
$("tr-cancel").addEventListener("click", () => { resetTrForm(); showTrForm(false); });
$("tr-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const title = $("tr-title").value.trim(), date = $("tr-date").value;
  if (!title) { setMsg("tr-msg", "Deneme adını yaz."); $("tr-title").focus(); return; }
  if (!date) { setMsg("tr-msg", "Tarihi seç."); $("tr-date").focus(); return; }
  const rows = []; let bad = "";
  TRIAL_SUBJECTS.forEach((s, i) => {
    const v = ["c", "w", "b"].map((k) => $("tr-" + k + "-" + i).value.trim());
    if (v.every((x) => x === "")) return;
    const n = v.map((x) => (x === "" ? 0 : Number(x)));
    if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 200)) { bad = s; return; }
    if (n[0] + n[1] + n[2] > 0) rows.push({ subject: s, c: n[0], w: n[1], b: n[2] });
  });
  if (bad) { setMsg("tr-msg", bad + " için 0 ile 200 arasında tam sayı yaz."); return; }
  if (!rows.length) { setMsg("tr-msg", "En az bir dersin doğru, yanlış ya da boş sayısını yaz."); return; }
  setMsg("tr-msg", "");
  const btn = $("tr-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Kaydediliyor…";
  try {
    const grp = Date.now().toString(36), b = writeBatch(db);
    rows.forEach((r) => b.set(doc(collection(db, "users", S.user.uid, "trials")), { grp, title, date, subject: r.subject, c: r.c, w: r.w, b: r.b, createdAt: nowMs() }));
    await b.commit();
    resetTrForm(); showTrForm(false);
  } catch (e) { setMsg("tr-msg", e && e.code === "permission-denied" ? "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Deneme kaydedilemedi. Biraz sonra tekrar dene."); }
  btn.disabled = false; btn.textContent = label;
});

/* ---------- SORU KÖŞESİ ---------- */
function qaCard(q) {
  const li = el("li", "qcard" + (q.solved ? " solved" : ""));
  const top = el("div", "top"); top.appendChild(subjectChip(q.subject));
  if (q.solved) top.appendChild(el("span", "chip good", "Çözüldü"));
  if (q.createdAt) top.appendChild(el("span", "chip plain", fmtStamp(q.createdAt)));
  li.appendChild(top);
  li.appendChild(el("h3", "title", q.title || "Soru"));
  if (q.body) li.appendChild(el("p", "desc", q.body));
  const key = "qa:" + q.id, open = S.cmOpen.has(key);
  const tb = el("button", "tlink", open ? "Yanıtları gizle" : "Yanıtlar"); tb.type = "button";
  tb.addEventListener("click", () => toggleThread(key, ["qa", q.id, "answers"], renderQa));
  li.appendChild(tb);
  if (S.aiOn !== false) {
    const dr = S.qaDraft[q.id];
    const mb = el("button", "tlink", dr && dr.loading ? "Mobi yazıyor…" : "Mobi taslağı"); mb.type = "button"; mb.disabled = !!(dr && dr.loading);
    mb.addEventListener("click", () => qaDraft(q)); li.appendChild(mb);
    if (dr && (dr.text || dr.err)) {
      const bx = el("div", "qa-draft"); bx.appendChild(el("small", "", dr.text ? "Mobi'nin taslağı. Yanlışı olabilir, kontrol et." : "Taslak alınamadı"));
      bx.appendChild(document.createTextNode(dr.text || dr.err));
      const row = el("div", "nc-acts");
      if (dr.text && S.canAdd) { const pb = el("button", "btn btn-quiet btn-small", "Yanıt olarak ekle"); pb.type = "button"; pb.addEventListener("click", () => qaPostDraft(q)); row.appendChild(pb); }
      const cb = el("button", "btn btn-quiet btn-small", "Kapat"); cb.type = "button"; cb.addEventListener("click", () => { delete S.qaDraft[q.id]; renderQa(); }); row.appendChild(cb);
      bx.appendChild(row); li.appendChild(bx);
    }
  }
  if (open) li.appendChild(threadBox(key, ["qa", q.id, "answers"], { max: 1000, ph: "Yanıtını yaz…", btn: "Yanıtla" }));
  const meta = el("div", "meta"); const who = el("span", "", "Soran: "); who.appendChild(el("span", "who", q.author || "?")); meta.appendChild(who);
  if (canModify(q)) {
    const sv = el("button", "lnk", q.solved ? "Çözülmedi yap" : "Çözüldü işaretle"); sv.type = "button";
    sv.addEventListener("click", () => updateDoc(doc(db, "qa", q.id), { solved: !q.solved }).catch(() => toast("Değiştirilemedi.")));
    meta.appendChild(sv);
    meta.appendChild(delButton("qa:" + q.id, () => deleteQa(q)));
  }
  li.appendChild(meta);
  return li;
}
async function deleteQa(q) {
  const b = writeBatch(db);
  if (can("mod")) { try { const s = await getDocs(collection(db, "qa", q.id, "answers")); s.docs.forEach((d) => b.delete(d.ref)); } catch (e) {} }
  b.delete(doc(db, "qa", q.id)); addLog(b, "del", "qa", q.title);
  closeThreadKey("qa:" + q.id);
  return b.commit();
}
function renderQa() {
  const box = $("qa-list"); if (!box) return;
  Array.from($("qa-subs").children).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === S.qaF.sub ? "true" : "false"));
  $("qa-open").setAttribute("aria-pressed", S.qaF.open ? "true" : "false");
  if (deferIfTyping("qa-list", renderQa)) return;
  box.textContent = "";
  if (S.qaErr) { box.appendChild(emptyBox("Soru köşesi yüklenemedi", S.qaErr)); return; }
  const items = S.qa.filter((q) => (S.qaF.sub === "all" || (q.subject || "Diğer") === S.qaF.sub) && (!S.qaF.open || !q.solved));
  if (!items.length) {
    box.appendChild(S.qa.length ? emptyBox("Filtreye uyan soru yok", "", "Filtreleri temizle", () => { S.qaF = { sub: "all", open: false }; renderQa(); })
      : emptyBox("Henüz soru yok", "Anlamadığın bir şeyi “Soru sor” ile yazabilirsin."));
    return;
  }
  const ul = el("ul", "list"); items.forEach((q) => ul.appendChild(qaCard(q))); box.appendChild(ul);
}
$("qa-open").addEventListener("click", () => { S.qaF.open = !S.qaF.open; renderQa(); });
function showQaForm(open) {
  $("qa-panel").hidden = !open; $("qa-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("qa-panel").scrollIntoView({ block: "nearest" }); $("qa-title").focus(); }
}
$("qa-add").addEventListener("click", () => { if ($("qa-panel").hidden) { $("qa-title").value = ""; $("qa-body").value = ""; $("qa-sub").value = ""; setMsg("qa-msg", ""); showQaForm(true); } else showQaForm(false); });
$("qa-cancel").addEventListener("click", () => showQaForm(false));
$("qa-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const title = $("qa-title").value.trim(), body = $("qa-body").value.trim(), subject = $("qa-sub").value;
  if (!title) { setMsg("qa-msg", "Soru başlığını yaz."); $("qa-title").focus(); return; }
  if (!subject) { setMsg("qa-msg", "Dersi seç."); $("qa-sub").focus(); return; }
  if (!S.canAdd) { setMsg("qa-msg", "Ekleme iznin kapalı. Yöneticiyle konuş."); return; }
  setMsg("qa-msg", "");
  const btn = $("qa-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Gönderiliyor…";
  try {
    const b = writeBatch(db);
    b.set(doc(collection(db, "qa")), { title, body, subject, solved: false, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
    addLog(b, "add", "qa", title);
    await b.commit(); showQaForm(false);
  } catch (e) { setMsg("qa-msg", e && e.code === "permission-denied" ? "Bu işlem için yetkin yok. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Soru gönderilemedi. Biraz sonra tekrar dene."); }
  btn.disabled = false; btn.textContent = label;
});

/* ---------- ANKETLER ---------- */
function syncVoteListeners() {
  const want = new Set(S.polls.map((p) => p.id));
  Array.from(live.keys()).forEach((k) => {
    if (k.indexOf("v:") === 0 && !want.has(k.slice(2))) { const u = live.get(k); try { u(); } catch (e) {} live.delete(k); delete S.votes[k.slice(2)]; }
  });
  want.forEach((id) => {
    const k = "v:" + id; if (live.has(k)) return;
    live.set(k, onSnapshot(collection(db, "polls", id, "votes"),
      (s) => { S.votes[id] = s.docs.map((d) => ({ ...d.data(), id: d.id })); renderPolls(); },
      () => { S.votes[id] = []; renderPolls(); }));
  });
}
const pollClosed = (p) => !!p.closed || !!(p.closes && p.closes < todayStr());
function myVote(p) { const v = (S.votes[p.id] || []).find((x) => S.user && x.id === S.user.uid); return v && Array.isArray(v.c) ? v.c : []; }
async function castVote(p, i) {
  if (pollClosed(p)) return;
  const mine = myVote(p);
  const c = p.multi ? (mine.indexOf(i) >= 0 ? mine.filter((x) => x !== i) : mine.concat(i)) : (mine.indexOf(i) >= 0 ? [] : [i]);
  const ref = doc(db, "polls", p.id, "votes", S.user.uid);
  try {
    if (!c.length) await deleteDoc(ref);
    else { const v = { c, at: nowMs() }; if (p.names) v.name = S.profile.name; await setDoc(ref, v); }
  } catch (e) { toast("Oyun kaydedilemedi."); }
}
async function deletePoll(p) {
  const b = writeBatch(db);
  if (can("mod")) { try { const s = await getDocs(collection(db, "polls", p.id, "votes")); s.docs.forEach((d) => b.delete(d.ref)); } catch (e) {} }
  b.delete(doc(db, "polls", p.id)); addLog(b, "del", "poll", p.q);
  return b.commit();
}
function pollCard(p) {
  const li = el("li", "pcard"), closed = pollClosed(p), votes = S.votes[p.id] || [], mine = myVote(p);
  const top = el("div", "top");
  top.appendChild(el("span", "chip " + (closed ? "plain" : "good"), closed ? "Kapalı" : "Açık"));
  if (p.multi) top.appendChild(el("span", "chip plain", "Birden fazla seçilebilir"));
  if (p.closes && !p.closed) top.appendChild(el("span", "chip plain", "Son oy: " + fmtDate(p.closes)));
  li.appendChild(top);
  li.appendChild(el("h3", "title", p.q));
  const total = votes.filter((v) => Array.isArray(v.c) && v.c.length).length;
  p.opts.forEach((o, i) => {
    const vs = votes.filter((v) => Array.isArray(v.c) && v.c.indexOf(i) >= 0), pct = total ? Math.round((100 * vs.length) / total) : 0;
    const b = el("button", "popt"); b.type = "button"; b.disabled = closed; b.setAttribute("aria-pressed", mine.indexOf(i) >= 0 ? "true" : "false");
    const fill = el("span", "fill"); fill.style.width = pct + "%"; b.appendChild(fill);
    b.appendChild(el("span", "", o)); b.appendChild(el("span", "pc", vs.length + " oy · %" + pct));
    b.addEventListener("click", () => castVote(p, i));
    li.appendChild(b);
    if (p.names && vs.length) li.appendChild(el("p", "pnames", vs.map((v) => v.name || "?").join(", ")));
  });
  const meta = el("div", "meta"); const who = el("span", "", "Açan: "); who.appendChild(el("span", "who", p.author || "?")); meta.appendChild(who);
  meta.appendChild(el("span", "", total + " kişi oy verdi"));
  if (canModify(p)) {
    const cl = el("button", "lnk", p.closed ? "Anketi yeniden aç" : "Anketi kapat"); cl.type = "button";
    cl.addEventListener("click", () => updateDoc(doc(db, "polls", p.id), { closed: !p.closed }).catch(() => toast("Değiştirilemedi.")));
    meta.appendChild(cl);
    meta.appendChild(delButton("poll:" + p.id, () => deletePoll(p)));
  }
  li.appendChild(meta);
  return li;
}
function renderPolls() {
  const box = $("poll-list"); if (!box) return; box.textContent = "";
  if (S.pollErr) { box.appendChild(emptyBox("Anketler yüklenemedi", S.pollErr)); return; }
  if (!S.polls.length) { box.appendChild(emptyBox("Henüz anket yok", "Sınıfla karar vermek için “Anket aç” düğmesini kullan.")); return; }
  const ul = el("ul", "list"); S.polls.forEach((p) => ul.appendChild(pollCard(p))); box.appendChild(ul);
}
function showPollForm(open) {
  $("poll-panel").hidden = !open; $("poll-add").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("p-closes").min = todayStr(); $("poll-panel").scrollIntoView({ block: "nearest" }); $("p-q").focus(); }
}
$("poll-add").addEventListener("click", () => {
  if ($("poll-panel").hidden) { $("p-q").value = ""; $("p-opts").value = ""; $("p-multi").checked = false; $("p-names").checked = false; $("p-closes").value = ""; setMsg("p-msg", ""); showPollForm(true); }
  else showPollForm(false);
});
$("p-cancel").addEventListener("click", () => showPollForm(false));
$("poll-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const q = $("p-q").value.trim(), opts = $("p-opts").value.split("\n").map((s) => s.trim()).filter(Boolean), closes = $("p-closes").value;
  if (!q) { setMsg("p-msg", "Anket sorusunu yaz."); $("p-q").focus(); return; }
  if (opts.length < 2 || opts.length > 6) { setMsg("p-msg", "2 ile 6 arasında seçenek yaz (her satıra bir tane)."); $("p-opts").focus(); return; }
  if (opts.some((o) => o.length > 40)) { setMsg("p-msg", "Her seçenek en fazla 40 karakter olmalı."); $("p-opts").focus(); return; }
  if (closes && closes < todayStr()) { setMsg("p-msg", "Son oy tarihi bugünden önce olamaz."); $("p-closes").focus(); return; }
  if (!S.canAdd) { setMsg("p-msg", "Ekleme iznin kapalı. Yöneticiyle konuş."); return; }
  setMsg("p-msg", "");
  const btn = $("p-submit"), label = btn.textContent; btn.disabled = true; btn.textContent = "Açılıyor…";
  try {
    const b = writeBatch(db);
    b.set(doc(collection(db, "polls")), { q, opts, multi: $("p-multi").checked, names: $("p-names").checked, closes: closes || "", closed: false, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() });
    addLog(b, "add", "poll", q);
    await b.commit(); showPollForm(false);
  } catch (e) { setMsg("p-msg", e && e.code === "permission-denied" ? "Bu işlem için yetkin yok. Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "Anket açılamadı. Biraz sonra tekrar dene."); }
  btn.disabled = false; btn.textContent = label;
});

/* ---------- SINIF BİLGİSİ ---------- */
function nextBirthday(md) {
  const n = nowD(), y = n.getFullYear(), m = Number(md.slice(0, 2)), d = Number(md.slice(3, 5));
  const t0 = new Date(y, n.getMonth(), n.getDate());
  let dt = new Date(y, m - 1, d); if (dt < t0) dt = new Date(y + 1, m - 1, d);
  return { days: Math.round((dt - t0) / 86400000), date: dt };
}
function renderInfo() {
  if (!$("in-duty")) return;
  const I = S.info;
  // Nöbetçi sırası
  const dBox = $("in-duty"); dBox.textContent = "";
  if (!I.duty.length || !I.dutyStart) dBox.appendChild(el("p", "muted", "Nöbetçi sırası henüz girilmemiş."));
  else {
    const mon = new Date(); const p0 = parts(todayStr()); const t = new Date(p0.y, p0.m - 1, p0.d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    for (let k = 0; k < Math.min(I.duty.length, 6); k++) {
      const w = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7 * k), r = el("div", "bdrow");
      r.appendChild(el("b", "", dutyAt(k)));
      r.appendChild(el("span", "chip " + (k === 0 ? "" : "plain"), k === 0 ? "Bu hafta" : k === 1 ? "Gelecek hafta" : w.getDate() + " " + MONTHS[w.getMonth()] + " haftası"));
      dBox.appendChild(r);
    }
  }
  // Kurallar
  const rBox = $("in-rules"); rBox.textContent = "";
  if (!I.rules.length) rBox.appendChild(el("p", "muted", "Sınıf kuralları henüz girilmemiş."));
  else { const ol = el("ol", "rules"); I.rules.forEach((t) => ol.appendChild(el("li", "", t))); rBox.appendChild(ol); }
  // Bağlantılar
  const lBox = $("in-links"); lBox.textContent = "";
  const links = I.links.filter((l) => l && /^https:\/\/[^\s]+$/i.test(l.u || ""));
  if (!links.length) lBox.appendChild(el("p", "muted", "Bağlantı eklenmemiş."));
  else {
    const w = el("div", "lnklist");
    links.forEach((l) => { const a = el("a", "btn btn-quiet linkbtn", l.t || l.u); a.href = l.u; a.target = "_blank"; a.rel = "noopener noreferrer"; w.appendChild(a); });
    lBox.appendChild(w);
  }
  // Doğum günleri
  const bBox = $("in-bd"); bBox.textContent = "";
  const list = S.bd.filter((b) => /^\d\d-\d\d$/.test(b.md || "")).map((b) => ({ b, nb: nextBirthday(b.md) })).sort((a, c) => a.nb.days - c.nb.days);
  if (!list.length) bBox.appendChild(el("p", "muted", "Henüz kimse doğum gününü eklemedi. Ayarlar > Doğum günüm."));
  else list.slice(0, 12).forEach(({ b, nb }) => {
    const r = el("div", "bdrow"); r.appendChild(el("b", "", b.name || "?"));
    r.appendChild(el("span", "", nb.date.getDate() + " " + MONTHS[nb.date.getMonth()] + " · " + (nb.days === 0 ? "bugün" : nb.days === 1 ? "yarın" : nb.days + " gün sonra")));
    bBox.appendChild(r);
  });
  // Yönetici formu (yazılırken ezilmesin)
  $("in-admin").hidden = !can("info");
  if (can("info") && !S.infoDirty) {
    $("in-rules-t").value = I.rules.join("\n"); $("in-links-t").value = I.links.map((l) => (l.t || "") + " | " + (l.u || "")).join("\n");
    $("in-duty-t").value = I.duty.join("\n"); $("in-duty-d").value = I.dutyStart || "";
  }
}
["in-rules-t", "in-links-t", "in-duty-t", "in-duty-d"].forEach((id) => $(id).addEventListener("input", () => { S.infoDirty = true; }));
$("in-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!can("info")) return;
  const rules = $("in-rules-t").value.split("\n").map((s) => s.trim()).filter(Boolean);
  const duty = $("in-duty-t").value.split("\n").map((s) => s.trim()).filter(Boolean), dutyStart = $("in-duty-d").value;
  const links = []; let bad = "";
  $("in-links-t").value.split("\n").map((s) => s.trim()).filter(Boolean).forEach((line) => {
    const i = line.lastIndexOf("|"), t = i >= 0 ? line.slice(0, i).trim() : "", u = (i >= 0 ? line.slice(i + 1) : line).trim();
    if (!/^https:\/\/[^\s]+$/i.test(u) || u.length > 300) { bad = line; return; }
    links.push({ t: (t || u).slice(0, 60), u });
  });
  if (bad) { setMsg("in-msg", "Bağlantı biçimi yanlış: “" + bad.slice(0, 40) + "”. Başlık | https://adres şeklinde yaz."); return; }
  if (rules.length > 30 || rules.some((r) => r.length > 200)) { setMsg("in-msg", "En fazla 30 kural, her biri en fazla 200 karakter."); return; }
  if (links.length > 20) { setMsg("in-msg", "En fazla 20 bağlantı ekleyebilirsin."); return; }
  if (duty.length > 40 || duty.some((d) => d.length > 40)) { setMsg("in-msg", "Nöbetçi listesinde en fazla 40 kişi olabilir."); return; }
  if (duty.length && !dutyStart) { setMsg("in-msg", "Nöbetçi sırası için ilk nöbetçinin haftasından bir tarih seç."); $("in-duty-d").focus(); return; }
  setMsg("in-msg", "");
  const btn = $("in-save"); btn.disabled = true;
  try { await setDoc(doc(db, "config", "info"), { rules, links, duty, dutyStart: dutyStart || "", updatedAt: nowMs() }); S.infoDirty = false; setMsg("in-msg", "Kaydedildi. Herkes görebilir.", true); }
  catch (e) { setMsg("in-msg", "Kaydedilemedi. Yetkini ve güvenlik kurallarını kontrol et."); }
  btn.disabled = false;
});

/* ---------- DOĞUM GÜNÜM (ayarlar) ---------- */
let bdTouched = false;
function fillBd() {
  const d = $("bd-d"), m = $("bd-m");
  [d, m].forEach((x) => { const o = el("option", "", "Seç"); o.value = ""; x.appendChild(o); });
  for (let i = 1; i <= 31; i++) { const o = el("option", "", String(i)); o.value = String(i); d.appendChild(o); }
  MONTHS_LONG.forEach((t, i) => { const o = el("option", "", t); o.value = String(i + 1); m.appendChild(o); });
  d.addEventListener("change", () => { bdTouched = true; }); m.addEventListener("change", () => { bdTouched = true; });
}
function syncBirthday() {
  if (bdTouched || !S.user) return;
  const mine = S.bd.find((b) => b.id === S.user.uid);
  if (mine && /^\d\d-\d\d$/.test(mine.md || "")) { $("bd-m").value = String(Number(mine.md.slice(0, 2))); $("bd-d").value = String(Number(mine.md.slice(3, 5))); }
}
$("bd-save").addEventListener("click", async () => {
  const m = Number($("bd-m").value), d = Number($("bd-d").value);
  if (!m || !d || new Date(2024, m - 1, d).getMonth() !== m - 1) { setMsg("bd-msg", "Geçerli bir gün ve ay seç."); return; }
  try { await setDoc(doc(db, "birthdays", S.user.uid), { name: S.profile.name, md: pad(m) + "-" + pad(d) }); bdTouched = false; setMsg("bd-msg", "Doğum günün kaydedildi.", true); }
  catch (e) { setMsg("bd-msg", "Kaydedilemedi. Güvenlik kurallarını yeniden yayınla (README 1. adım)."); }
});
$("bd-clear").addEventListener("click", async () => {
  try { await deleteDoc(doc(db, "birthdays", S.user.uid)); bdTouched = false; $("bd-d").value = ""; $("bd-m").value = ""; setMsg("bd-msg", "Doğum günün kaldırıldı.", true); }
  catch (e) { setMsg("bd-msg", "Kaldırılamadı."); }
});

/* ---------- DERS RENKLERİ ---------- */
function renderHues() {
  const box = $("hues"); box.textContent = "";
  SUBJECTS.forEach((s) => {
    const r = el("div", "hrow"); r.appendChild(subjectChip(s.n));
    const inp = document.createElement("input"); inp.type = "range"; inp.min = "0"; inp.max = "360"; inp.step = "5"; inp.value = String(subHue(s.n));
    inp.setAttribute("aria-label", s.n + " rengi");
    inp.addEventListener("input", () => {
      hueOv[s.n] = Number(inp.value); lsSet("odev-hues", JSON.stringify(hueOv));
      r.firstChild.style.setProperty("--h", inp.value); renderAll(); // sadece bu satırı yenilemek için renderHues çağrılmaz
    });
    r.appendChild(inp); box.appendChild(r);
  });
}
$("hues-reset").addEventListener("click", () => { hueOv = {}; lsSet("odev-hues", null); renderHues(); if (S.profile) renderAll(); });

/* ---------- VERİLERİM (kişisel dışa aktarma) ---------- */
function csvRow(a) { return a.map((v) => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";"); }
$("me-csv").addEventListener("click", () => {
  const L = [csvRow(["NOTLAR"]), csvRow(["Ders", "Başlık", "Tür", "Dönem", "Puan", "Tarih"])];
  S.grades.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach((g) => L.push(csvRow([g.subject, g.title, KIND_LABEL[g.kind] || g.kind, g.term, g.score, g.date])));
  L.push("", csvRow(["DENEME SINAVLARI"]), csvRow(["Deneme", "Tarih", "Ders", "Doğru", "Yanlış", "Boş", "Net"]));
  trGroups().forEach((g) => g.rows.forEach((r) => L.push(csvRow([g.title, g.date, r.subject, r.c, r.w, r.b, fmtNet(trNet(r))]))));
  L.push("", csvRow(["ÇALIŞMA SÜRESİ"]), csvRow(["Tarih", "Dakika"]));
  Object.keys(S.study).sort().forEach((d) => L.push(csvRow([d, S.study[d].min])));
  download("sinif-paneli-verilerim.csv", "﻿" + L.join("\r\n"), "text/csv;charset=utf-8");
});
$("me-json").addEventListener("click", () => {
  const out = { uygulama: "9 Fen B Sınıf Paneli", tarih: new Date(nowMs()).toISOString(), ad: S.profile ? S.profile.name : "", notlar: S.grades.map(stripId), denemeler: S.trials.map(stripId), calisma: S.study };
  download("sinif-paneli-verilerim.json", JSON.stringify(out, null, 2), "application/json");
});

/* ---------- YÖNETİM: çöp kutusu ---------- */
const TRASH_KIND = { hw: "Ödev", ex: "Sınav", ev: "Etkinlik", note: "Ders notu" };
const TRASH_COL = { hw: "homework", ex: "exams", ev: "events", note: "notes" };
function renderTrash() {
  if (!S.isAdmin) return;
  $("n-trash").textContent = String(S.trash.length);
  const box = $("trash-list"); if (!box) return; box.textContent = "";
  if (!S.trash.length) { box.appendChild(emptyBox("Çöp kutusu boş", "Silinen ödev, sınav, etkinlik ve notlar burada 30 gün durur.")); return; }
  S.trash.forEach((t) => {
    const d = t.data || {}, r = el("div", "urow"), top = el("div", "u-top");
    top.appendChild(el("span", "chip plain", TRASH_KIND[t.kind] || "Kayıt"));
    top.appendChild(el("span", "u-name", d.title || "(adsız)"));
    r.appendChild(top);
    r.appendChild(el("div", "u-mail", "Silen: " + (t.by || "?") + " · " + agoText(t.at) + (d.author ? " · İlk sahibi: " + d.author : "")));
    const act = el("div", "u-act");
    const rs = el("button", "lnk", "Geri al"); rs.type = "button";
    rs.addEventListener("click", async () => { rs.disabled = true; try { await restoreTrash(t); toast("Geri alındı."); } catch (e) { toast("Geri alınamadı."); rs.disabled = false; } });
    act.appendChild(rs);
    act.appendChild(delButton("t:" + t.id, () => deleteDoc(doc(db, "trash", t.id))));
    r.appendChild(act); box.appendChild(r);
  });
}
async function restoreTrash(t) {
  const col = TRASH_COL[t.kind]; if (!col) throw new Error("tür");
  const data = { ...t.data }, b = writeBatch(db);
  if (t.kind === "note") data.photoCount = 0; // not fotoğrafları çöpte tutulmaz
  if (t.kind === "hw") {
    if (t.photo) { data.hasPhoto = true; data.photo = ""; b.set(doc(db, "photos", t.docId), { data: t.photo, uid: data.uid }); }
    else if (!data.photo) data.hasPhoto = false;
  }
  b.set(doc(db, col, t.docId), data);
  b.delete(doc(db, "trash", t.id));
  addLog(b, "add", t.kind, data.title);
  return b.commit();
}

/* ---------- YÖNETİM: takvimi toplu yükle ---------- */
let ciRows = null;
const CI_KINDS = { etkinlik: "etkinlik", gezi: "gezi", tatil: "tatil", "toplantı": "toplanti", toplanti: "toplanti", "diğer": "diger", diger: "diger" };
function parseCal(text) {
  const out = [], errs = [], isD = (s) => /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim(); if (!line) return;
    const p = line.split("|").map((s) => s.trim()), no = i + 1;
    let start = "", end = "", kind = "etkinlik", title = "";
    if (p.length === 2) { start = p[0]; title = p[1]; }
    else if (p.length === 3) {
      start = p[0]; title = p[2];
      const k = CI_KINDS[p[1].toLocaleLowerCase("tr")];
      if (isD(p[1])) end = p[1]; else if (k) kind = k; else { errs.push(no + ". satır: “" + p[1] + "” ne tarih ne tür."); return; }
    } else if (p.length === 4) {
      start = p[0]; end = p[1]; title = p[3];
      const k = p[2] ? CI_KINDS[p[2].toLocaleLowerCase("tr")] : "etkinlik";
      if (!k) { errs.push(no + ". satır: tür tanınmadı (etkinlik, gezi, tatil, toplantı)."); return; }
      kind = k;
    } else { errs.push(no + ". satır: biçim anlaşılmadı."); return; }
    if (!isD(start)) { errs.push(no + ". satır: başlangıç tarihi YYYY-AA-GG olmalı."); return; }
    if (end && (!isD(end) || end < start)) { errs.push(no + ". satır: bitiş tarihi geçersiz ya da başlangıçtan önce."); return; }
    if (!title || title.length > 80) { errs.push(no + ". satır: başlık 1-80 karakter olmalı."); return; }
    out.push({ title, kind, date: start, endDate: end, time: "", note: "" });
  });
  return { out, errs };
}
function ciCheck() {
  const { out, errs } = parseCal($("ci-text").value), list = $("ci-list"); list.textContent = "";
  ciRows = null; $("ci-go").disabled = true;
  if (!out.length && !errs.length) { setMsg("ci-msg", "Önce satırları yaz."); return; }
  if (out.length > 100) { setMsg("ci-msg", "Bir seferde en fazla 100 kayıt yüklenir."); return; }
  out.forEach((e) => {
    const r = el("div", "urow"); const top = el("div", "u-top");
    top.appendChild(el("span", "chip plain", EV_KIND[e.kind] || "Etkinlik")); top.appendChild(el("span", "u-name", e.title)); r.appendChild(top);
    r.appendChild(el("div", "u-mail", fmtDate(e.date) + (e.endDate && e.endDate > e.date ? " – " + fmtDate(e.endDate) : "")));
    list.appendChild(r);
  });
  if (errs.length) { setMsg("ci-msg", errs.slice(0, 5).join(" ") + (errs.length > 5 ? " (+" + (errs.length - 5) + " hata daha)" : "") + " Düzeltmeden yükleme yapılmaz."); return; }
  ciRows = out; $("ci-go").disabled = false;
  setMsg("ci-msg", out.length + " kayıt hazır. “Takvime ekle” ile yükle.", true);
}
$("ci-prev").addEventListener("click", ciCheck);
$("ci-text").addEventListener("input", () => { ciRows = null; $("ci-go").disabled = true; });
$("ci-go").addEventListener("click", async () => {
  if (!can("cal") || !ciRows || !ciRows.length) return;
  const btn = $("ci-go"), rows = ciRows; btn.disabled = true; btn.textContent = "Yükleniyor…";
  try {
    // Güvenlik kuralları bir toplu yazmada en fazla 20 belge okuyabildiği için 5'erli gruplar halinde yazılır.
    for (let i = 0; i < rows.length; i += 5) {
      const b = writeBatch(db);
      rows.slice(i, i + 5).forEach((e) => b.set(doc(collection(db, "events")), { ...e, author: S.profile.name, uid: S.user.uid, createdAt: nowMs() }));
      await b.commit();
    }
    const lb = writeBatch(db); addLog(lb, "add", "ev", "Toplu yükleme: " + rows.length + " kayıt"); await lb.commit();
    $("ci-text").value = ""; $("ci-list").textContent = ""; ciRows = null;
    setMsg("ci-msg", rows.length + " kayıt takvime eklendi.", true);
  } catch (e) { setMsg("ci-msg", "Yükleme yarıda kaldı. Takvime bakıp eksikleri yeniden yükle. " + (e && e.code === "permission-denied" ? "Güvenlik kurallarını yeniden yayınla (README 1. adım)." : "")); }
  btn.textContent = "Takvime ekle"; btn.disabled = true;
});

/* ---------- YÖNETİM: yedek ---------- */
$("m-backup").addEventListener("click", async () => {
  if (!S.isAdmin) return;
  const btn = $("m-backup"); btn.disabled = true; btn.textContent = "Hazırlanıyor…"; setMsg("m-bk-msg", "");
  try {
    const out = { uygulama: "9 Fen B Sınıf Paneli", tarih: new Date(nowMs()).toISOString(), veri: {} };
    for (const c of ["homework", "exams", "events", "notes", "announcements", "qa", "polls", "birthdays"]) {
      const s = await getDocs(collection(db, c));
      out.veri[c] = s.docs.map((d) => { const x = { id: d.id, ...d.data() }; if (x.photo) x.photo = "(fotoğraf yedeğe dahil değil)"; return x; });
    }
    out.veri.config = {};
    for (const c of ["schedule", "settings", "info"]) { const s = await getDoc(doc(db, "config", c)); if (s.exists()) out.veri.config[c] = s.data(); }
    out.veri.kullanicilar = S.users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, canAdd: u.canAdd !== false }));
    download("sinif-paneli-yedek-" + todayStr() + ".json", JSON.stringify(out, null, 2), "application/json");
    setMsg("m-bk-msg", "Yedek indirildi.", true);
  } catch (e) { setMsg("m-bk-msg", "Yedek alınamadı. Bağlantını ve yetkini kontrol et."); }
  btn.textContent = "Yedeği indir (JSON)"; btn.disabled = false;
});

/* ---------- Başlangıç ---------- */
fillSubjectSelect("h-sub", "Ders seç");
fillSubjectSelect("e-sub", "Ders seç");
fillSubjectSelect("c-sub", "Boş");
fillSubjectSelect("g-sub", "Ders seç");
fillSubjectSelect("nt-sub", "Ders seç");
makeSubPills("hw-subs", () => S.hwF.sub, (v) => { S.hwF.sub = v; }, renderHw);
makeSubPills("ex-subs", () => S.exF.sub, (v) => { S.exF.sub = v; }, renderEx);
makeSubPills("nt-subs", () => S.ntF.sub, (v) => { S.ntF.sub = v; }, renderNotes);
fillSubjectSelect("qa-sub", "Ders seç");
makeSubPills("qa-subs", () => S.qaF.sub, (v) => { S.qaF.sub = v; }, renderQa);
fillSubjectSelect("st-sub", "Genel");
fillSubjectSelect("st-mansub", "Genel");
stFill(); stShow();
buildTrRows(); fillBd(); renderHues();
resetGForm();
S.schDay = realToday() || 1;
setInterval(() => { if (S.profile) { renderHw(); renderEx(); renderSch(); renderCal(); renderBadges(); if (S.isAdmin) renderLast(); } }, 60000);
boot();
