import React from "react";
import { Text as RNText, View } from "react-native";
import { Chip, Field, Input } from "./ui";
import { t } from "@/src/lib/i18n";
import { moneyInput, parseMoney } from "@/src/lib/format";
import { CATEGORIES, Category, TYPES_BY_CATEGORY } from "@/src/lib/unitKinds";
import { fonts, makeStyles, spacing } from "@/src/theme";

// A unit is the property itself: what it is, where it is, and its prices.
// Only the three prices are optional (no price at all = "Renovating…").

export type UnitFormValue = {
  name: string;
  category: Category | null;
  unit_type: string;
  address: string;
  monthly_price: string;
  daily_price: string;
  yearly_price: string;
};

export const emptyUnitForm: UnitFormValue = { name: "", category: null, unit_type: "", address: "", monthly_price: "", daily_price: "", yearly_price: "" };

export function unitToForm(u: any): UnitFormValue {
  const category: Category | null = u.category === "apartemen" || u.category === "rumah" ? u.category : null;
  return {
    name: u.name || "",
    category,
    unit_type: category && TYPES_BY_CATEGORY[category].includes(u.unit_type) ? u.unit_type : "",
    address: u.address || u.location || "",
    monthly_price: moneyInput(u.monthly_price),
    daily_price: moneyInput(u.daily_price),
    yearly_price: moneyInput(u.yearly_price),
  };
}

export const unitFormValid = (f: UnitFormValue) => !!f.name.trim() && !!f.category && !!f.unit_type && f.address.trim().length >= 3;

export function unitFormBody(f: UnitFormValue) {
  const beds = f.unit_type === "Studio" ? 1 : parseInt(f.unit_type, 10) || 1;
  return {
    name: f.name.trim(),
    category: f.category,
    unit_type: f.unit_type,
    address: f.address.trim(),
    bedrooms: beds,
    monthly_price: parseMoney(f.monthly_price) || 0,
    daily_price: parseMoney(f.daily_price) || null,
    yearly_price: parseMoney(f.yearly_price) || null,
  };
}

export function UnitForm({ value, onChange, prefix = "unit" }: { value: UnitFormValue; onChange: (v: UnitFormValue) => void; prefix?: string }) {
  const s = useStyles();
  const set = (patch: Partial<UnitFormValue>) => onChange({ ...value, ...patch });
  const money = (k: "monthly_price" | "daily_price" | "yearly_price") => (v: string) => set({ [k]: moneyInput(parseMoney(v)) });
  return (
    <View style={{ gap: spacing.md }}>
      <Field label={t("Nama unit")}>
        <Input testID={`${prefix}-name-input`} value={value.name} onChangeText={(v) => set({ name: v })} placeholder={t("mis. Tokyo Riverside A-12")} />
      </Field>
      <Field label={t("Jenis")}>
        <View style={s.wrap}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={t(c.label)}
              active={value.category === c.key}
              onPress={() => set({ category: c.key, unit_type: TYPES_BY_CATEGORY[c.key].includes(value.unit_type) ? value.unit_type : "" })}
              testID={`${prefix}-cat-${c.key}`}
            />
          ))}
        </View>
      </Field>
      {value.category ? (
        <Field label={t("Tipe")}>
          <View style={s.wrap}>
            {TYPES_BY_CATEGORY[value.category].map((ty) => (
              <Chip key={ty} label={t(ty)} active={value.unit_type === ty} onPress={() => set({ unit_type: ty })} testID={`${prefix}-type-${ty.replace(/ /g, "-")}`} />
            ))}
          </View>
        </Field>
      ) : null}
      <Field label={t("Alamat / lokasi")} hint={t("Dikirim ke prospek saat undang viewing.")}>
        <Input testID={`${prefix}-address-input`} value={value.address} onChangeText={(v) => set({ address: v })} placeholder={t("mis. Jl. Pantai Indah Kapuk, Jakarta Utara")} />
      </Field>

      <View style={s.prices}>
        <RNText style={s.groupTitle}>
          {t("Harga")} <RNText style={s.optional}>{t("(opsional)")}</RNText>
        </RNText>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label={t("Per bulan")}>
              <Input testID={`${prefix}-price-input`} value={value.monthly_price} onChangeText={money("monthly_price")} placeholder="3.200.000" keyboardType="numeric" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Per malam")}>
              <Input testID={`${prefix}-daily-price-input`} value={value.daily_price} onChangeText={money("daily_price")} placeholder="750.000" keyboardType="numeric" />
            </Field>
          </View>
        </View>
        <Field label={t("Per tahun")}>
          <Input testID={`${prefix}-yearly-price-input`} value={value.yearly_price} onChangeText={money("yearly_price")} placeholder="36.000.000" keyboardType="numeric" />
        </Field>
        <RNText style={s.hint}>{t("Tanpa harga sama sekali, unit tampil sebagai Renovating…")}</RNText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  prices: { gap: spacing.sm },
  groupTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 15 },
  optional: { color: colors.muted, ...fonts.regular, fontSize: 14 },
  hint: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 19 },
}));
