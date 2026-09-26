import { t } from "./i18n";

// One vocabulary for what a unit is and what a prospect is looking for, so the
// two can be matched. Mirrors backend/matching.py.

export type Category = "apartemen" | "rumah";
export type PrefCategory = Category | "keduanya";

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "apartemen", label: "Apartemen" },
  { key: "rumah", label: "Rumah" },
];

export const TYPES_BY_CATEGORY: Record<Category, string[]> = {
  apartemen: ["Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom"],
  rumah: ["1 Bedroom", "2 Bedroom", "3 Bedroom", "4 Bedroom"],
};

/** What a unit can be (the add-unit form). */
export const SIZES: { key: string; short: string }[] = [
  { key: "Studio", short: "Studio" },
  { key: "1 Bedroom", short: "1BR" },
  { key: "2 Bedroom", short: "2BR" },
  { key: "3 Bedroom", short: "3BR" },
];

export const FURNISHING: { key: string; label: string }[] = [
  { key: "furnished", label: "Furnished" },
  { key: "semi", label: "Semi-Furnished" },
  { key: "unfurnished", label: "Unfurnished" },
];
export const furnishingLabel = (k?: string | null) => (k ? t(FURNISHING.find((x) => x.key === k)?.label || k) : "");

/** Only these show on cards and details, and only when checked. */
export const FACILITIES = ["AC", "Wi-Fi", "Water Heater"];

export const TERMS: { key: string; label: string }[] = [
  { key: "harian", label: "Harian" },
  { key: "bulanan", label: "Bulanan" },
  { key: "tahunan", label: "Tahunan" },
];

export const categoryLabel = (c?: string | null) => (c === "apartemen" ? t("Apartemen") : c === "rumah" ? t("Rumah") : "");

/** "1 Bedroom (36 m²)"; older units may also carry "Apartemen" in front. */
export function unitKind(u: { category?: string | null; unit_type?: string | null; size_m2?: number | null }) {
  const type = [u.unit_type ? t(u.unit_type) : "", u.size_m2 ? `(${u.size_m2} m²)` : ""].filter(Boolean).join(" ");
  return [categoryLabel(u.category), type].filter(Boolean).join(" · ");
}

/** Size options for a preference: 4 for one category, all 8 (labelled) for both. */
export function prefOptions(cat: PrefCategory | null | undefined): { key: string; label: string }[] {
  if (!cat) return [];
  const cats: Category[] = cat === "keduanya" ? ["apartemen", "rumah"] : [cat];
  return cats.flatMap((c) =>
    TYPES_BY_CATEGORY[c].map((ty) => ({ key: `${c}:${ty}`, label: cat === "keduanya" ? `${categoryLabel(c)} ${t(ty)}` : t(ty) })),
  );
}

/** "Mencari: Harian, Bulanan" from the rent-term preference; null when none picked. */
export function lookingFor(l: { pref_terms?: string[] | null }): string | null {
  const terms = (l.pref_terms || []).map((k) => t(TERMS.find((x) => x.key === k)?.label || k));
  return terms.length ? t("Mencari: {terms}", { terms: terms.join(", ") }) : null;
}

/** Short summary of what a prospect wants: "Apartemen Studio, 1 Bedroom · Bulanan". */
export function prefSummary(l: { pref_category?: string | null; pref_types?: string[] | null; pref_terms?: string[] | null }) {
  const types = l.pref_types || [];
  let what = "";
  if (types.length) {
    const cats = Array.from(new Set(types.map((x) => x.split(":")[0])));
    what = cats
      .map((c) => `${categoryLabel(c)} ${types.filter((x) => x.startsWith(c + ":")).map((x) => t(x.split(":")[1])).join(", ")}`)
      .join(" / ");
  } else if (l.pref_category) {
    what = l.pref_category === "keduanya" ? `${t("Apartemen")} / ${t("Rumah")}` : categoryLabel(l.pref_category);
  }
  const terms = (l.pref_terms || []).map((k) => t(TERMS.find((x) => x.key === k)?.label || k));
  return [what, terms.join(", ")].filter(Boolean).join(" · ");
}
