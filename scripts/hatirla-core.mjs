// Hatırlatma mantığı (Firebase'e bağlı değil, o yüzden ayrı test edilebilir).

const TZ = "Europe/Istanbul";

export function istanbulNow(date = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(date)) % 24;
  return { today: day, hour };
}

export function slotFor(hour) {
  return hour < 19 ? "h17" : "h20";
}

function dayDiff(from, to) {
  const a = from.split("-").map(Number), b = to.split("-").map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

function rel(d) {
  if (d === 0) return "bugün";
  if (d === 1) return "yarın";
  return d + " gün sonra";
}

// Sadece bitişine en fazla bu kadar gün kalan ödevler hatırlatılır (haftalarca uzaktaki ödev bildirimi şişirmesin).
export const WINDOW_DAYS = 3;

// Bildirim metni öğrencilerin yazdığı serbest metinden değil, sadece ders adından üretilir.
const KNOWN = ["Fizik", "Kimya", "Biyoloji", "Matematik", "Türkçe", "İngilizce", "Tarih", "Coğrafya", "Din Kültürü", "Beden Eğitimi", "Görsel Sanatlar"];
const label = (s) => (KNOWN.includes(s) ? s : "Ödev");

/**
 * users:    [{ id, name, tokens: [], notify: {h17, h20}, done: Set<string> }]
 * homework: [{ id, subject, due }]
 * exams:    [{ id, subject, date }]
 * Dönen: [{ userId, tokens, title, body, count }]
 */
export function buildMessages({ users, homework, exams, today, slot, windowDays }) {
  const win = Number.isInteger(windowDays) && windowDays >= 1 && windowDays <= 14 ? windowDays : WINDOW_DAYS;
  const active = homework.filter((h) => h.due && dayDiff(today, h.due) >= 0 && dayDiff(today, h.due) <= win);
  const soonExams = exams.filter((x) => x.date && dayDiff(today, x.date) >= 0 && dayDiff(today, x.date) <= 2);
  const out = [];
  for (const u of users) {
    const tokens = Array.isArray(u.tokens) ? u.tokens.filter(Boolean) : [];
    if (!tokens.length) continue;
    const notify = u.notify || {};
    if (notify[slot] === false) continue;
    const done = u.done instanceof Set ? u.done : new Set(u.done || []);
    // "Sadece seçtiğim dersler" açıksa yalnız o derslerin ödevleri hatırlatılır.
    const only = Array.isArray(notify.subs) && notify.subs.length ? new Set(notify.subs) : null;
    const undone = active.filter((h) => !done.has(h.id) && (!only || only.has(h.subject))).sort((a, b) => a.due.localeCompare(b.due));
    if (!undone.length) continue;
    const first = (u.name || "").split(" ")[0];
    const title = slot === "h17"
      ? (first ? first + ", " : "") + undone.length + " yapmadığın ödev var"
      : "Akşam hatırlatması: " + undone.length + " ödev yapılmadı";
    const lines = undone.slice(0, 3).map((h) => label(h.subject) + " (" + rel(dayDiff(today, h.due)) + ")");
    let body = lines.join(", ");
    if (undone.length > 3) body += " ve " + (undone.length - 3) + " ödev daha";
    if (soonExams.length && notify.exam !== false) {
      const x = soonExams.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
      body += ". Sınav: " + (KNOWN.includes(x.subject) ? x.subject : "Sınav") + " " + rel(dayDiff(today, x.date));
    }
    out.push({ userId: u.id, tokens, title, body, count: undone.length, vib: notify.vib !== false });
  }
  return out;
}

const tokensOf = (u) => (Array.isArray(u.tokens) ? u.tokens.filter(Boolean) : []);

/**
 * Pazar akşamı haftalık özet: önümüzdeki 7 günde biten yapılmamış ödevler ve sınavlar.
 * Kişi ayarlarında "week" kapalıysa gönderilmez; hiçbir şey yoksa gönderilmez.
 */
export function buildWeekly({ users, homework, exams, today }) {
  const hw = homework.filter((h) => h.due && dayDiff(today, h.due) >= 1 && dayDiff(today, h.due) <= 7);
  const ex = exams.filter((x) => x.date && dayDiff(today, x.date) >= 1 && dayDiff(today, x.date) <= 7);
  const out = [];
  for (const u of users) {
    const tokens = tokensOf(u), notify = u.notify || {};
    if (!tokens.length || notify.week === false) continue;
    const done = u.done instanceof Set ? u.done : new Set(u.done || []);
    const undone = hw.filter((h) => !done.has(h.id));
    if (!undone.length && !ex.length) continue;
    const first = (u.name || "").split(" ")[0];
    const parts = [];
    if (undone.length) parts.push(undone.length + " ödev");
    if (ex.length) parts.push(ex.length + " sınav");
    const next = ex.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
    let body = "Önümüzdeki 7 günde " + parts.join(" ve ") + " var.";
    if (next) body += " İlk sınav: " + (KNOWN.includes(next.subject) ? next.subject : "Sınav") + " (" + rel(dayDiff(today, next.date)) + ").";
    out.push({ userId: u.id, tokens, title: (first ? first + ", y" : "Y") + "eni hafta başlıyor", body, count: undone.length, vib: notify.vib !== false });
  }
  return out;
}

/**
 * Doğum günü bildirimi: bugün doğum günü olanı herkese duyurur, kişinin kendisine de kutlama gönderir.
 * birthdays: [{ id (kullanıcı kimliği), name, md: "AA-GG" }]
 */
export function buildBirthdays({ users, birthdays, today }) {
  const md = today.slice(5);
  const todays = birthdays.filter((b) => b.md === md);
  if (!todays.length) return [];
  const out = [];
  for (const u of users) {
    const tokens = tokensOf(u), notify = u.notify || {};
    if (!tokens.length || notify.bday === false) continue;
    const mine = todays.some((b) => b.id === u.id);
    const others = todays.filter((b) => b.id !== u.id).map((b) => b.name);
    if (!mine && !others.length) continue;
    const title = mine ? "Doğum günün kutlu olsun!" : "Bugün doğum günü var";
    const body = mine ? (others.length ? "Bugün " + others.join(", ") + " için de doğum günü." : "Sınıf arkadaşların seni kutlar.") : others.join(", ") + " için bugün doğum günü. Kutlamayı unutma.";
    out.push({ userId: u.id, tokens, title, body, count: 0, vib: notify.vib !== false });
  }
  return out;
}
