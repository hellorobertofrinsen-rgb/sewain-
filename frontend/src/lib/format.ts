import { getLang, t } from "./i18n";

const WEEKDAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Read at call time so a language switch applies without a reload.
const WEEKDAYS = new Proxy([] as string[], { get: (_, k) => (getLang() === "en" ? WEEKDAYS_EN : WEEKDAYS_ID)[k as any] });
const MONTHS = new Proxy([] as string[], { get: (_, k) => (getLang() === "en" ? MONTHS_EN : MONTHS_ID)[k as any] });

/** A label map whose values come out translated: UNIT_STATUS.kosong -> "Vacant" in English. */
function translated(map: Record<string, string>): Record<string, string> {
  return new Proxy(map, { get: (target, k) => (typeof k === "string" && k in target ? t(target[k]) : undefined) });
}

export function rupiah(n: number | null | undefined): string {
  if (n == null) return "-";
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp${s}`;
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("Baru saja");
  if (mins < 60) return t("{n} menit lalu", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("{n} jam lalu", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("{n} hari lalu", { n: days });
  const weeks = Math.floor(days / 7);
  if (days < 30) return t("{n} minggu lalu", { n: weeks });
  const months = Math.floor(days / 30);
  if (months < 12) return t("{n} bulan lalu", { n: months });
  return t("{n} tahun lalu", { n: Math.floor(months / 12) });
}

/** Whole days since `iso` (positive = in the past, negative = in the future). */
export function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = new Date();
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = -(daysFromNow(iso) ?? 0); // days until
  if (diff === 0) return t("Hari ini");
  if (diff === 1) return t("Besok");
  if (diff === -1) return t("Kemarin");
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${dayLabel(iso)} · ${hh}.${mm}`;
}

export function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${`${d.getHours()}`.padStart(2, "0")}.${`${d.getMinutes()}`.padStart(2, "0")}`;
}

/** "Expired 23 September" from a YYYY-MM-DD the agent entered; null for anything else. */
export function expiredLabel(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return t("Expired {date}", { date: `${d.getDate()} ${MONTHS[d.getMonth()]}` });
}

/** "3 hari lalu" / "hari ini" for a past ISO datetime (whole days). */
export function daysAgoLabel(iso: string | null | undefined): string {
  const n = daysFromNow(iso) ?? 0;
  if (n <= 0) return t("hari ini");
  if (n === 1) return t("kemarin");
  return t("{n} hari lalu", { n });
}

/** "Hari ini", "Besok", "Kemarin", else "23 Sep". */
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = -(daysFromNow(iso) ?? 0); // days until
  if (diff === 0) return t("hari ini");
  if (diff === 1) return t("besok");
  if (diff === -1) return t("kemarin");
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mei 2026", or for a bill covering several months "Mei 2026 – Okt 2026". */
export function periodLabel(period: string, months = 1): string {
  const [y, m] = period.split("-");
  const idx = parseInt(m, 10) - 1;
  if (months > 1 && idx >= 0) {
    const endIdx = (idx + months - 1) % 12;
    const endYear = parseInt(y, 10) + Math.floor((idx + months - 1) / 12);
    return `${(MONTHS[idx] ?? m).slice(0, 3)} ${y} – ${(MONTHS[endIdx] ?? "").slice(0, 3)} ${endYear}`;
  }
  return `${MONTHS[idx] ?? m} ${y}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return t("Selamat pagi");
  if (h < 15) return t("Selamat siang");
  if (h < 19) return t("Selamat sore");
  return t("Selamat malam");
}

export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

// ----------------------------- status labels --------------------------------

export const UNIT_STATUS: Record<string, string> = translated({
  kosong: "Kosong",
  terisi: "Terisi",
  reserved: "Reserved",
  maintenance: "Renovating…", // no price yet, or being fixed
});

/** "Rp3.200.000/bulan" for the first price a unit has (month, then night, then year). */
export function mainPrice(u: { monthly_price?: number | null; daily_price?: number | null; yearly_price?: number | null }, suffix: { m: string; d: string; y: string }): string | null {
  if (u.monthly_price) return `${rupiah(u.monthly_price)}${suffix.m}`;
  if (u.daily_price) return `${rupiah(u.daily_price)}${suffix.d}`;
  if (u.yearly_price) return `${rupiah(u.yearly_price)}${suffix.y}`;
  return null;
}

export const LEAD_STATUS: Record<string, string> = translated({
  baru: "Baru",
  sedang_ngobrol: "Dihubungi",
  perlu_followup: "Perlu follow-up",
  viewing: "Viewing",
  negotiation: "Negosiasi",
  deal: "Deal",
  tidak_jadi: "Tidak jadi",
});

export const INTEREST_LABEL: Record<string, string> = translated({
  high: "Minat tinggi",
  medium: "Minat sedang",
  low: "Minat rendah",
});

export const VIEWING_STATUS: Record<string, string> = translated({
  menunggu: "Menunggu konfirmasi",
  terjadwal: "Terjadwal",
  selesai: "Selesai",
  batal: "Batal",
});

export const MAINT_STATUS: Record<string, string> = translated({
  baru: "Baru",
  sedang: "Sedang dikerjakan",
  selesai: "Selesai",
});

export const PRIORITY_LABEL: Record<string, string> = translated({
  urgent: "Urgent",
  normal: "Normal",
  rendah: "Rendah",
});

// ----------------------------- lease / money ---------------------------------

/** When the contract ends: "Selesai dalam 12 hari" / "Selesai hari ini" / "Selesai 3 hari lalu". */
export function leaseLeftLabel(daysLeft: number | null | undefined): string {
  if (daysLeft == null) return t("Tanpa tanggal selesai");
  if (daysLeft < 0) return t("Selesai {n} hari lalu", { n: -daysLeft });
  if (daysLeft === 0) return t("Selesai hari ini");
  return t("Selesai dalam {n} hari", { n: daysLeft });
}

/** Digits-only parse for money inputs ("3.200.000" -> 3200000). Empty -> null. */
export function parseMoney(v: string): number | null {
  const digits = (v || "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/** What the agent typed into a money field, reformatted. Unlike moneyInput, a typed 0 stays "0". */
export function typeMoney(v: string): string {
  const n = parseMoney(v);
  return n === null ? "" : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Due day of the month: 1–28 so it exists in every month. */
export const dueDayOk = (v: string) => {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 28;
};

/** Show a number in a money input with thousand separators. */
export function moneyInput(n: number | null | undefined): string {
  return n ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}
