import { getLang, t } from "./i18n";
import type { Tone } from "@/src/components/ui";

const MON_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "30 Apr", or "Apr 2027" when it is more than a year away: short enough for one line on a card. */
function short(d?: string | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map((x) => parseInt(x, 10));
  const months = getLang() === "en" ? MON_EN : MON_ID;
  const far = new Date(y, m - 1, day).getTime() - Date.now() > 365 * 86400000;
  return far ? `${months[m - 1]} ${y}` : `${day} ${months[m - 1]}`;
}

/** "Available" / "Booked sampai 31 Des 2026" / "Renovating…" for a unit card. */
export function availability(u: { status?: string; booked_until?: string | null; available_date?: string | null }): { label: string; tone: Tone } {
  if (u.status === "maintenance") return { label: t("Renovating…"), tone: "neutral" };
  if (u.status === "terisi" || u.status === "reserved") {
    const until = short(u.booked_until || (u.status === "reserved" ? u.available_date : null));
    return { label: until ? t("Booked s/d {date}", { date: until }) : t("Booked"), tone: "warning" };
  }
  return { label: t("Available"), tone: "success" };
}
