const sessionKey = "date-quilt:session:v1";
const visitKey = "date-quilt:last-visit:v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const makeId = () => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replaceAll(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const sessionId = (() => {
  const stored = localStorage.getItem(sessionKey);
  if (stored && uuidPattern.test(stored)) {
    return stored;
  }
  const created = makeId();
  localStorage.setItem(sessionKey, created);
  return created;
})();

export const trackVisit = (context = "home") => {
  const today = new Date().toISOString().slice(0, 10);
  const lastVisit = localStorage.getItem(visitKey);
  track("visited", context);
  if (lastVisit && lastVisit !== today) {
    track("returned", context);
  }
  localStorage.setItem(visitKey, today);
};

export const track = (name, context = "") => {
  void fetch("/api/telemetry", {
    body: JSON.stringify({ context, name, sessionId }),
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
};

export const apiJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "request_failed");
    error.status = response.status;
    throw error;
  }
  return body;
};

export const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("copy_failed");
  }
};

const weekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
});

export const formatSlot = (startsAt, durationMinutes) => {
  const [datePart = "", timePart = ""] = startsAt.split("T");
  const [year = "", month = "", day = ""] = datePart.split("-");
  const [hour = "00", minute = "00"] = timePart.split(":");
  const startDate = new Date(`${datePart}T${hour}:${minute}:00+09:00`);
  const endDate = new Date(startDate.getTime() + Number(durationMinutes) * 60_000);
  const endTime = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(endDate);
  const weekday = Number.isNaN(startDate.getTime()) ? "" : weekdayFormatter.format(startDate);
  return {
    dateLabel: `${Number(month)}/${Number(day)}（${weekday}）`,
    fullLabel: `${year}年${Number(month)}月${Number(day)}日（${weekday}） ${hour}:${minute}〜${endTime}`,
    timeLabel: `${hour}:${minute}〜${endTime}`,
  };
};

export const setStatus = (element, message, kind = "") => {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.textContent = message;
  element.dataset.kind = kind;
};

export const tokyoDateTime = (daysFromToday, time) => {
  const target = new Date(Date.now() + daysFromToday * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(target);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${time}`;
};

export const addTokyoDays = (startsAt, days) => {
  const [datePart, timePart] = startsAt.split("T");
  const target = new Date(`${datePart}T${timePart}:00+09:00`);
  target.setUTCDate(target.getUTCDate() + days);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(target);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${timePart}`;
};
