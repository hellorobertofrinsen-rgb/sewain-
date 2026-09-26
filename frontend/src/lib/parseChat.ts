// Pull prospect details out of a pasted / shared WhatsApp chat — plain pattern
// matching, no AI: it is instant, free, works offline, and the agent checks the
// result before saving. Anything not found is simply left empty.

export type ParsedChat = {
  name?: string;
  phone?: string;
  budget?: number;
  unit_type?: string;
  move_in_date?: string;
  preferred_location?: string;
  notes?: string;
};

// "[26/09/26 10.21] Jessica: halo" (iPhone) or "26/09/26 10.21 - Jessica: halo" (Android)
const LINE = /^\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s?[AP]M)?\]?\s*(?:-\s*)?([^:]{1,40}):\s?(.*)$/i;
const SELF = /^(anda|you|saya|me)$/i;

const MONTHS = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];

export function normalizePhone(raw: string): string | undefined {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("620")) d = "62" + d.slice(3);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (d.startsWith("8") && d.length >= 9 && d.length <= 13) d = "62" + d;
  if (!/^628\d{7,11}$/.test(d)) return undefined;
  return `+${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 9)}-${d.slice(9)}`.replace(/-$/, "");
}

/** Rupiah amounts people type in chat: "3,5 jt", "3.5juta", "Rp 3.500.000", "3500000", "3jt an", "800rb". */
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  const t = text.toLowerCase();
  const unit = /(\d+(?:[.,]\d+)?)\s*(jt|juta|j\b|rb|ribu|k\b)/g;
  let m: RegExpExecArray | null;
  while ((m = unit.exec(t))) {
    const n = parseFloat(m[1].replace(",", "."));
    const mult = m[2].startsWith("j") ? 1_000_000 : 1_000;
    out.push(Math.round(n * mult));
  }
  const full = /(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3}){2,})(?!\d)/g; // 3.500.000
  while ((m = full.exec(t))) out.push(parseInt(m[1].replace(/[.,]/g, ""), 10));
  const plain = /rp\.?\s*(\d{6,9})\b|\b(\d{6,9})\s*(?:\/\s*(?:bln|bulan))/g; // Rp3500000, 3500000/bulan
  while ((m = plain.exec(t))) out.push(parseInt(m[1] || m[2], 10));
  // Monthly rents live between 300 rb and 200 jt; drop phone fragments and the like.
  return out.filter((n) => n >= 300_000 && n <= 200_000_000);
}

function unitType(t: string): string | undefined {
  if (/\bstudio\b/.test(t)) return "Studio";
  if (/\b(3\s?(br|bed|bedroom|kamar|kt))\b/.test(t)) return "3 Bedroom";
  if (/\b(2\s?(br|bed|bedroom|kamar|kt))\b/.test(t)) return "2 Bedroom";
  if (/\b(1\s?(br|bed|bedroom|kamar|kt))\b/.test(t)) return "1 Bedroom";
  if (/\bkos(t|an)?\b/.test(t)) return "Kost";
  if (/\bvilla\b/.test(t)) return "Villa";
  if (/\b(rumah|kontrakan)\b/.test(t)) return "Rumah";
  return undefined;
}

function moveIn(t: string): string | undefined {
  if (/bulan depan/.test(t)) return "Bulan depan";
  if (/(minggu|pekan) depan/.test(t)) return "Minggu depan";
  if (/bulan ini/.test(t)) return "Bulan ini";
  if (/secepatnya|asap|segera/.test(t)) return "Secepatnya";
  const month = MONTHS.find((mo) => new RegExp(`\\b${mo}\\b`).test(t));
  return month ? month.charAt(0).toUpperCase() + month.slice(1) : undefined;
}

// Matched on the original text so "PIK 2" keeps its capitals.
function location(t: string): string | undefined {
  const m = /\b(?:daerah|area|di sekitar|sekitar|dekat|deket|lokasi)\s+([a-z][a-z0-9 ]{2,30}?)(?=[,.?!\n]|\s(?:ada|yang|kak|budget|harga|untuk|buat)\b|$)/i.exec(t);
  if (!m) return undefined;
  return m[1].trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// "saya Rizky", "nama saya Rizky", "aku Dina" — only a capitalised word counts.
function selfIntro(t: string): string | undefined {
  const m = /\b(?:nama saya|namaku|nama aku|saya|aku)\s+([A-Z][a-z]{2,15})\b/.exec(t);
  return m ? m[1] : undefined;
}

export function parseChat(raw: string): ParsedChat {
  const text = (raw || "").trim();
  if (!text) return {};
  const lines = text.split(/\r?\n/);
  const senders: string[] = [];
  const theirLines: string[] = [];
  for (const line of lines) {
    const m = LINE.exec(line.trim());
    if (m) {
      const who = m[1].trim();
      if (!SELF.test(who)) {
        senders.push(who);
        theirLines.push(m[2]);
      }
    }
  }
  // Only what the prospect wrote (when we can tell), so the agent's own prices don't count.
  const theirsRaw = theirLines.length ? theirLines.join("\n") : text;
  const theirs = theirsRaw.toLowerCase();

  const out: ParsedChat = {};
  const sender = senders.find((x) => !/^\+?\d[\d\s-]+$/.test(x));
  const name = sender ? sender.replace(/[~]/g, "").trim() : selfIntro(theirsRaw);
  if (name) out.name = name;
  const phoneFromSender = senders.map(normalizePhone).find(Boolean);
  const phoneInText = (text.match(/(?:\+?62|0)8[\d\s.-]{7,15}\d/g) || []).map(normalizePhone).find(Boolean);
  out.phone = phoneFromSender || phoneInText;
  const amounts = parseAmounts(theirs);
  if (amounts.length) out.budget = Math.max(...amounts);
  out.unit_type = unitType(theirs);
  out.move_in_date = moveIn(theirs);
  out.preferred_location = location(theirsRaw);
  const quote = (theirLines.length ? theirLines : lines).map((l) => l.trim()).filter(Boolean).slice(-4).join(" / ");
  if (quote) out.notes = quote.length > 280 ? quote.slice(0, 277) + "…" : quote;
  return out;
}
