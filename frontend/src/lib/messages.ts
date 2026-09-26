// Ready-to-send WhatsApp messages, built from data Sewain already has.
// Plain templates (no AI call): instant, free, and the agent can still edit before sending.
import { dateLabel, periodLabel, rupiah } from "./format";

function firstName(name?: string | null) {
  return (name || "").trim().split(/\s+/)[0] || "kak";
}

type UnitInfo = { name: string; unit_type?: string; monthly_price?: number; property_name?: string } | null | undefined;

export type FollowupLead = {
  name: string;
  status?: string;
  unit_type?: string | null;
  budget_max?: number | null;
  negotiation?: { agreed_price?: number | null; contract_months?: number | null } | null;
  unit?: UnitInfo;
};

export function followupMessage(lead: FollowupLead): string {
  const n = firstName(lead.name);
  const u = lead.unit;
  const where = u ? `unit ${u.name}${u.property_name ? ` di ${u.property_name}` : ""}` : "";
  if (lead.status === "negotiation" && u) {
    const price = lead.negotiation?.agreed_price ? ` dengan harga ${rupiah(lead.negotiation.agreed_price)}/bulan` : "";
    const months = lead.negotiation?.contract_months ? ` untuk ${lead.negotiation.contract_months} bulan` : "";
    return `Halo ${n}, mau lanjut soal ${where}${price}${months} ya. Kalau sudah oke, aku siapkan jadwal serah terima dan detail pembayarannya. Gimana, bisa kita lanjut minggu ini?`;
  }
  if (lead.status === "viewing" && u) {
    return `Halo ${n}, gimana kesannya setelah lihat ${where}? Kalau ada yang mau ditanyakan soal harga atau fasilitas, kabari aja ya 🙂`;
  }
  if (u) {
    const price = u.monthly_price ? `, harganya ${rupiah(u.monthly_price)}/bulan` : "";
    return `Halo ${n}, aku mau kabari lagi soal ${where}${u.unit_type ? ` (${u.unit_type})` : ""}${price}. Unitnya masih tersedia. Kalau masih cari, mau aku bantu jadwalkan lihat unitnya minggu ini?`;
  }
  const want = [lead.unit_type, lead.budget_max ? `budget sekitar ${rupiah(lead.budget_max)}` : null].filter(Boolean).join(", ");
  return `Halo ${n}, aku mau follow-up soal hunian yang kamu cari${want ? ` (${want})` : ""}. Boleh info lagi lokasi, budget, dan kapan rencana pindahnya? Nanti aku carikan unit yang paling pas.`;
}

export function paymentReminderMessage(p: { name: string; unit_name: string; amount: number; due_date: string; period?: string; months?: number; days_late?: number }): string {
  const n = firstName(p.name);
  const period = p.period ? ` ${periodLabel(p.period, p.months)}` : "";
  const late = (p.days_late ?? 0) > 0;
  return late
    ? `Halo ${n}, mau mengingatkan sewa unit ${p.unit_name}${period} sebesar ${rupiah(p.amount)} sudah lewat jatuh tempo (${dateLabel(p.due_date + "T00:00:00")}). Mohon dibantu transfernya ya, dan kirim bukti transfer kalau sudah. Terima kasih 🙏`
    : `Halo ${n}, sekadar mengingatkan sewa unit ${p.unit_name}${period} sebesar ${rupiah(p.amount)} jatuh tempo ${dateLabel(p.due_date + "T00:00:00")}. Kalau sudah transfer, boleh kirim buktinya ke sini ya. Terima kasih 🙏`;
}

export function leaseRenewalMessage(t: { name: string; unit_name: string; end_date: string }): string {
  return `Halo ${firstName(t.name)}, kontrak sewa unit ${t.unit_name} akan berakhir ${dateLabel(t.end_date + "T00:00:00")}. Rencananya mau diperpanjang? Kabari aja ya, nanti aku siapkan perpanjangannya 🙂`;
}

export function ownerReportMessage(o: { name: string; units: number; terisi: number; kosong: number; paid: number; overdue: number }, days: number): string {
  const lines = [
    `Halo ${o.name}, update unit ${days} hari terakhir:`,
    `• ${o.units} unit: ${o.terisi} terisi, ${o.kosong} kosong`,
    `• Sewa masuk: ${rupiah(o.paid)}`,
    o.overdue > 0 ? `• Belum masuk (lewat jatuh tempo): ${rupiah(o.overdue)} — sedang saya tagih` : `• Tidak ada tunggakan`,
    "",
    "Kalau ada pertanyaan, kabari saya ya 🙏",
  ];
  return lines.join("\n");
}

export function upgradeMessage(planLabel: string, price: number, email?: string): string {
  return `Halo Sewain! Saya mau upgrade ke Premium paket ${planLabel} (${rupiah(price)}).${email ? ` Email akun saya: ${email}.` : ""} Mohon info cara pembayarannya ya 🙏`;
}

export function waLink(phone?: string | null, text?: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
