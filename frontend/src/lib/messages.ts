// Ready-to-send WhatsApp messages, built from data SewAIn already has.
// Plain templates (no AI call): instant, free, and the agent can still edit before sending.
import { dateLabel, periodLabel, rupiah } from "./format";
import { getLang, t } from "./i18n";
import { FACILITIES, furnishingLabel, prefSummary, unitKind } from "./unitKinds";

function firstName(name?: string | null) {
  return (name || "").trim().split(/\s+/)[0] || t("kak");
}

type UnitInfo = { name: string; category?: string | null; unit_type?: string; monthly_price?: number; daily_price?: number | null; yearly_price?: number | null } | null | undefined;

export type FollowupLead = {
  name: string;
  status?: string;
  pref_category?: string | null;
  pref_types?: string[] | null;
  pref_terms?: string[] | null;
  negotiation?: { agreed_price?: number | null; contract_months?: number | null } | null;
  unit?: UnitInfo;
};

export function followupMessage(lead: FollowupLead): string {
  const n = firstName(lead.name);
  const u = lead.unit;
  const where = u ? t("unit {name}", { name: u.name }) : "";
  if (lead.status === "negotiation" && u) {
    const price = lead.negotiation?.agreed_price ? t(" dengan harga {amount}/bulan", { amount: rupiah(lead.negotiation.agreed_price) }) : "";
    const months = lead.negotiation?.contract_months ? t(" untuk {n} bulan", { n: lead.negotiation.contract_months }) : "";
    return t("Halo {n}, mau lanjut soal {where}{price}{months} ya. Kalau sudah oke, aku siapkan jadwal serah terima dan detail pembayarannya. Gimana, bisa kita lanjut minggu ini?", { n, where, price, months });
  }
  if (lead.status === "viewing" && u) {
    return t("Halo {n}, gimana kesannya setelah lihat {where}? Kalau ada yang mau ditanyakan soal harga atau fasilitas, kabari aja ya 🙂", { n, where });
  }
  if (u) {
    const price = u.monthly_price ? t(", harganya {amount}/bulan", { amount: rupiah(u.monthly_price) })
      : u.daily_price ? t(", harganya {amount}/hari", { amount: rupiah(u.daily_price) })
      : u.yearly_price ? t(", harganya {amount}/tahun", { amount: rupiah(u.yearly_price) }) : "";
    const kind = unitKind(u);
    return t("Halo {n}, aku mau kabari lagi soal {where}{kind}{price}. Unitnya masih tersedia. Kalau masih cari, mau aku bantu jadwalkan lihat unitnya minggu ini?", { n, where, kind: kind ? ` (${kind})` : "", price });
  }
  const want = prefSummary(lead);
  return t("Halo {n}, aku mau follow-up soal hunian yang kamu cari{want}. Boleh info lagi lokasi, budget, dan kapan rencana pindahnya? Nanti aku carikan unit yang paling pas.", { n, want: want ? ` (${want})` : "" });
}

export function paymentReminderMessage(p: { name: string; unit_name: string; amount: number; due_date: string; period?: string; months?: number; days_late?: number }): string {
  const n = firstName(p.name);
  const period = p.period ? ` ${periodLabel(p.period, p.months)}` : "";
  const late = (p.days_late ?? 0) > 0;
  const vars = { n, unit: p.unit_name, period, amount: rupiah(p.amount), date: dateLabel(p.due_date + "T00:00:00") };
  return late
    ? t("Halo {n}, mau mengingatkan sewa unit {unit}{period} sebesar {amount} sudah lewat jatuh tempo ({date}). Mohon dibantu transfernya ya, dan kirim bukti transfer kalau sudah. Terima kasih 🙏", vars)
    : t("Halo {n}, sekadar mengingatkan sewa unit {unit}{period} sebesar {amount} jatuh tempo {date}. Kalau sudah transfer, boleh kirim buktinya ke sini ya. Terima kasih 🙏", vars);
}

export function leaseRenewalMessage(tn: { name: string; unit_name: string; end_date: string }): string {
  return t("Halo {n}, kontrak sewa unit {unit} berakhir {date}. Mau diperpanjang? Kalau iya, saya siapkan perpanjangannya. Kalau tidak, kabari saya supaya jadwal serah terima kuncinya bisa diatur.", { n: firstName(tn.name), unit: tn.unit_name, date: dateLabel(tn.end_date + "T00:00:00") });
}

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Sabtu, 4 Oktober 2026" and "14.00" from an ISO datetime, in the device's time. */
function whenParts(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
  return { day: `${(getLang() === "en" ? DAYS_EN : DAYS_ID)[d.getDay()]}, ${dateLabel(iso)}`, time };
}

export function mapsLink(location?: string | null): string | null {
  return location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : null;
}

export type ViewingInfo = {
  name: string; unit_name: string; scheduled_at: string; location?: string | null;
  units?: { name: string; location?: string | null }[]; // one trip, several units
};

export function viewingInviteMessage(v: ViewingInfo): string {
  const { day, time } = whenParts(v.scheduled_at);
  if (v.units && v.units.length > 1) {
    return [
      t("Halo {n}, jadwal viewing {count} unit:", { n: firstName(v.name), count: v.units.length }),
      t("Hari: {day}", { day }),
      t("Jam: {time}", { time }),
      "",
      ...v.units.flatMap((u, i) => [
        `${i + 1}. ${t("Unit {name}", { name: u.name })}`,
        u.location ? `   ${t("Lokasi: {loc}", { loc: u.location })}` : null,
        mapsLink(u.location) ? `   Maps: ${mapsLink(u.location)}` : null,
      ]),
      "",
      t("Kalau ada perubahan jadwal, kabari saya ya."),
    ].filter((x) => x !== null).join("\n");
  }
  const maps = mapsLink(v.location);
  return [
    t("Halo {n}, jadwal viewing unit {unit}:", { n: firstName(v.name), unit: v.unit_name }),
    t("Hari: {day}", { day }),
    t("Jam: {time}", { time }),
    v.location ? t("Lokasi: {loc}", { loc: v.location }) : null,
    maps ? `Maps: ${maps}` : null,
    "",
    t("Kalau ada perubahan jadwal, kabari saya ya."),
  ].filter((x) => x !== null).join("\n");
}

/** Any pre-filled Google Calendar event (opens the Calendar app or site). */
export function calendarLink(e: { title: string; start: string; minutes?: number; location?: string | null; details?: string }): string {
  const start = new Date(e.start);
  const end = new Date(start.getTime() + (e.minutes ?? 60) * 60_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: e.details || "",
    location: e.location || "",
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export type TodoInfo = { description: string; unit_name?: string | null; tenant_name?: string | null; scheduled_at: string; location?: string | null };

export function todoCalendarLink(td: TodoInfo): string {
  return calendarLink({
    title: `${td.description}${td.unit_name ? ` · ${td.unit_name}` : ""}`,
    start: td.scheduled_at,
    location: td.location,
    details: [td.tenant_name ? `Tenant: ${td.tenant_name}` : null, td.unit_name ? `Unit: ${td.unit_name}` : null].filter(Boolean).join("\n"),
  });
}

export function todoInformMessage(td: TodoInfo): string {
  const { day, time } = whenParts(td.scheduled_at);
  return [
    t("Halo {n}, soal {what}{unit} sudah saya jadwalkan:", { n: firstName(td.tenant_name), what: td.description.toLowerCase(), unit: td.unit_name ? t(" di unit {name}", { name: td.unit_name }) : "" }),
    t("Hari: {day}", { day }),
    t("Jam: {time}", { time }),
    "",
    t("Kalau waktunya tidak cocok, kabari saya ya."),
  ].join("\n");
}

/** Google Calendar "add event" link, pre-filled; opens the Calendar app or site. */
export function googleCalendarLink(v: ViewingInfo & { phone?: string | null }, minutes = 60): string {
  const start = new Date(v.scheduled_at);
  const end = new Date(start.getTime() + minutes * 60_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Viewing ${v.unit_name} - ${v.name}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: [t("Prospek: {name}", { name: v.name }), v.phone ? `WhatsApp: ${v.phone}` : null].filter(Boolean).join("\n"),
    location: v.location || "",
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export type ShareUnit = {
  name: string; category?: string | null; unit_type?: string; size_m2?: number | null; residence?: string | null; furnishing?: string | null; view?: string | null;
  location?: string | null; monthly_price?: number; deposit?: number;
  daily_price?: number | null; yearly_price?: number | null;
  bedrooms?: number; bathrooms?: number; furnished?: boolean; facilities?: string[]; status?: string; available_date?: string | null;
};

export function unitShareMessage(u: ShareUnit): string {
  // Newer units say it in their type ("Rumah · 3 Bedroom"); older ones listed rooms separately.
  const rooms = u.category ? "" : [u.bedrooms ? t("{n} kamar tidur", { n: u.bedrooms }) : null, u.bathrooms ? t("{n} kamar mandi", { n: u.bathrooms }) : null, u.furnished ? "furnished" : null]
    .filter(Boolean).join(", ");
  const kind = unitKind(u);
  const facilities = u.category || u.furnishing ? (u.facilities || []).filter((f) => FACILITIES.includes(f)) : u.facilities || [];
  const status = u.status === "kosong" ? t("Kosong, bisa langsung ditempati.")
    : u.status === "reserved" && u.available_date ? t("Tersedia mulai {date}.", { date: dateLabel(u.available_date + "T00:00:00") })
    : u.status === "terisi" ? t("Saat ini masih terisi.") : null;
  return [
    `${t("Unit {name}", { name: u.name })}${kind ? ` · ${kind}` : ""}`,
    u.location || null,
    [furnishingLabel(u.furnishing), u.view].filter(Boolean).join(" · ") || null,
    u.monthly_price ? t("Sewa {amount}/bulan", { amount: rupiah(u.monthly_price) }) : null,
    u.yearly_price ? t("Sewa {amount}/tahun", { amount: rupiah(u.yearly_price) }) : null,
    u.daily_price ? t("Harian {amount}/hari", { amount: rupiah(u.daily_price) }) : null,
    u.deposit ? t("Deposit {amount}", { amount: rupiah(u.deposit) }) : null,
    rooms || null,
    facilities.length ? t("Fasilitas: {list}", { list: facilities.join(", ") }) : null,
    status,
    "",
    t("Mau lihat unitnya? Balas pesan ini, nanti saya atur jadwal viewing."),
  ].filter((x) => x !== null).join("\n");
}

export type BankAccount = { bank: string; account: string; holder?: string | null };

export function invoiceMessage(
  p: { name: string; unit_name: string; amount: number; due_date: string; period?: string; months?: number },
  bank: BankAccount,
  from?: { name?: string | null; agency?: string | null },
): string {
  const sign = [from?.name, from?.agency].filter(Boolean).join(" · ");
  return [
    t("Halo {n}, berikut tagihan sewa unit {unit}:", { n: firstName(p.name), unit: p.unit_name }),
    p.period ? t("Periode: {period}", { period: periodLabel(p.period, p.months) }) : null,
    t("Jumlah: {amount}", { amount: rupiah(p.amount) }),
    t("Jatuh tempo: {date}", { date: dateLabel(p.due_date + "T00:00:00") }),
    "",
    t("Transfer ke:"),
    `${bank.bank} ${bank.account}`,
    bank.holder ? t("a.n. {name}", { name: bank.holder }) : null,
    "",
    t("Kalau sudah transfer, kirim buktinya di sini ya. Terima kasih."),
    sign ? `\n${sign}` : null,
  ].filter((x) => x !== null).join("\n");
}

/** wa.me without a number: WhatsApp asks which chat to send it to. */
export function waShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function ownerReportMessage(o: { name: string; units: number; terisi: number; kosong: number; paid: number; overdue: number }, days: number): string {
  const lines = [
    t("Halo {n}, update unit {days} hari terakhir:", { n: o.name, days }),
    `• ${t("{units} unit: {a} terisi, {b} kosong", { units: o.units, a: o.terisi, b: o.kosong })}`,
    `• ${t("Sewa masuk: {amount}", { amount: rupiah(o.paid) })}`,
    o.overdue > 0 ? `• ${t("Belum masuk (lewat jatuh tempo): {amount} — sedang saya tagih", { amount: rupiah(o.overdue) })}` : `• ${t("Tidak ada tunggakan")}`,
    "",
    t("Kalau ada pertanyaan, kabari saya ya 🙏"),
  ];
  return lines.join("\n");
}

export function upgradeMessage(planLabel: string, price: number, email?: string): string {
  return `Halo SewAIn! Saya mau upgrade ke Premium paket ${planLabel} (${rupiah(price)}).${email ? ` Email akun saya: ${email}.` : ""} Mohon info cara pembayarannya ya 🙏`;
}

export function waLink(phone?: string | null, text?: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
