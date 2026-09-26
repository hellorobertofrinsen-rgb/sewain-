import React from "react";
import { Text as RNText, View } from "react-native";
import { Chip, Field, Input, SwitchRow } from "./ui";
import { t } from "@/src/lib/i18n";
import { PrefCategory, TERMS, prefOptions } from "@/src/lib/unitKinds";
import { fonts, makeStyles, spacing } from "@/src/theme";

// A prospect is: a name, a WhatsApp number, whether they are a hot buyer, and
// (optionally) what they are looking for. Nothing else to fill in.

export type LeadFormValue = {
  name: string;
  phone: string;
  hot: boolean;
  pref_category: PrefCategory | null;
  pref_types: string[];
  pref_terms: string[];
};

export const emptyLeadForm: LeadFormValue = { name: "", phone: "", hot: false, pref_category: null, pref_types: [], pref_terms: [] };

export function leadToForm(l: any): LeadFormValue {
  return {
    name: l.name || "",
    phone: l.phone || "",
    hot: l.interest === "high",
    pref_category: l.pref_category || null,
    pref_types: l.pref_types || [],
    pref_terms: l.pref_terms || [],
  };
}

export const phoneOk = (p: string) => p.replace(/\D/g, "").length >= 8;
export const leadFormValid = (f: LeadFormValue) => !!f.name.trim() && phoneOk(f.phone);

export function formToBody(f: LeadFormValue) {
  return {
    name: f.name.trim(),
    phone: f.phone.trim(),
    interest: f.hot ? "high" : "medium",
    pref_category: f.pref_category,
    pref_types: f.pref_types,
    pref_terms: f.pref_terms,
  };
}

const CATS: { key: PrefCategory; label: string }[] = [
  { key: "apartemen", label: "Apartemen" },
  { key: "rumah", label: "Rumah" },
  { key: "keduanya", label: "Apartemen & Rumah" },
];

export function LeadForm({ value, onChange }: { value: LeadFormValue; onChange: (v: LeadFormValue) => void }) {
  const s = useStyles();
  const set = (patch: Partial<LeadFormValue>) => onChange({ ...value, ...patch });

  const pickCategory = (c: PrefCategory) => {
    if (value.pref_category === c) return set({ pref_category: null, pref_types: [] });
    // Keep only the sizes that still exist under the new choice.
    const allowed = new Set(prefOptions(c).map((o) => o.key));
    set({ pref_category: c, pref_types: value.pref_types.filter((k) => allowed.has(k)) });
  };
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const options = prefOptions(value.pref_category);
  const phoneBad = value.phone.trim().length > 0 && !phoneOk(value.phone);

  return (
    <View style={{ gap: spacing.md }}>
      <Field label={t("Nama")}>
        <Input testID="lead-name-input" value={value.name} onChangeText={(v) => set({ name: v })} placeholder={t("mis. Jessica")} autoCapitalize="words" />
      </Field>
      <Field label={t("No. WhatsApp")} hint={phoneBad ? t("Nomor terlalu pendek") : undefined}>
        <Input testID="lead-phone-input" value={value.phone} onChangeText={(v) => set({ phone: v })} placeholder="0812…" keyboardType="phone-pad" autoComplete="tel" />
      </Field>
      <SwitchRow
        label={t("Hot Buyer")}
        sub={t("Serius dan siap sewa. Tampil sebagai label Hot Buyer.")}
        value={value.hot}
        onChange={(v) => set({ hot: v })}
        testID="lead-hot-switch"
      />

      <View style={s.group}>
        <RNText style={s.groupTitle}>
          {t("Preferensi unit")} <RNText style={s.optional}>{t("(opsional)")}</RNText>
        </RNText>
        <View style={s.wrap}>
          {CATS.map((c) => (
            <Chip key={c.key} label={t(c.label)} active={value.pref_category === c.key} onPress={() => pickCategory(c.key)} testID={`lead-cat-${c.key}`} />
          ))}
        </View>
        {options.length ? (
          <View style={s.wrap} testID="lead-pref-types">
            {options.map((o) => (
              <Chip
                key={o.key}
                check
                label={o.label}
                active={value.pref_types.includes(o.key)}
                onPress={() => set({ pref_types: toggle(value.pref_types, o.key) })}
                testID={`lead-type-${o.key.replace(/[: ]/g, "-")}`}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View style={s.group}>
        <RNText style={s.groupTitle}>
          {t("Preferensi waktu sewa")} <RNText style={s.optional}>{t("(opsional)")}</RNText>
        </RNText>
        <View style={s.wrap}>
          {TERMS.map((o) => (
            <Chip
              key={o.key}
              check
              label={t(o.label)}
              active={value.pref_terms.includes(o.key)}
              onPress={() => set({ pref_terms: toggle(value.pref_terms, o.key) })}
              testID={`lead-term-${o.key}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { gap: spacing.sm },
  groupTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 15 },
  optional: { color: colors.muted, ...fonts.regular, fontSize: 14 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
}));
