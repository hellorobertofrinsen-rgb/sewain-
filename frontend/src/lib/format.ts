const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function rupiah(n: number | null | undefined): string {
  if (n == null) return "-";
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp${s}`;
}

export function rupiahShort(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `Rp${(v % 1 === 0 ? v.toFixed(0) : v.toFixed(1).replace(".", ","))} jt`;
  }
  return rupiah(n);
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} minggu lalu`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan lalu`;
  return `${Math.floor(months / 12)} tahun lalu`;
}

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
  const diff = daysFromNow(iso) ?? 0;
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
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

/** "Hari ini", "Besok", "Kemarin", else "23 Sep". */
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = daysFromNow(iso) ?? 0;
  if (diff === 0) return "hari ini";
  if (diff === 1) return "besok";
  if (diff === -1) return "kemarin";
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
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

// ----------------------------- status labels --------------------------------

export const UNIT_STATUS: Record<string, string> = {
  kosong: "Kosong",
  terisi: "Terisi",
  reserved: "Reserved",
  maintenance: "Maintenance",
};

export const LEAD_STATUS: Record<string, string> = {
  baru: "Baru",
  sedang_ngobrol: "Dihubungi",
  perlu_followup: "Perlu follow-up",
  viewing: "Viewing",
  negotiation: "Negosiasi",
  deal: "Deal",
  tidak_jadi: "Tidak jadi",
};

export const INTEREST_LABEL: Record<string, string> = {
  high: "Minat tinggi",
  medium: "Minat sedang",
  low: "Minat rendah",
};

export const VIEWING_STATUS: Record<string, string> = {
  menunggu: "Menunggu konfirmasi",
  terjadwal: "Terjadwal",
  selesai: "Selesai",
  batal: "Batal",
};

export const MAINT_STATUS: Record<string, string> = {
  baru: "Baru",
  sedang: "Sedang dikerjakan",
  selesai: "Selesai",
};

export const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  normal: "Normal",
  rendah: "Rendah",
};

// ----------------------------- lease / money ---------------------------------

/** "Sisa 4 bulan" / "Habis dalam 12 hari" / "Habis hari ini" / "Lewat 3 hari". */
export function leaseLeftLabel(daysLeft: number | null | undefined): string {
  if (daysLeft == null) return "Tanpa tanggal selesai";
  if (daysLeft < 0) return `Kontrak lewat ${-daysLeft} hari`;
  if (daysLeft === 0) return "Kontrak habis hari ini";
  if (daysLeft <= 45) return `Habis dalam ${daysLeft} hari`;
  return `Sisa ${Math.round(daysLeft / 30)} bulan`;
}

/** Digits-only parse for money inputs ("3.200.000" -> 3200000). Empty -> null. */
export function parseMoney(v: string): number | null {
  const digits = (v || "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/** Show a number in a money input with thousand separators. */
export function moneyInput(n: number | null | undefined): string {
  return n ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}
