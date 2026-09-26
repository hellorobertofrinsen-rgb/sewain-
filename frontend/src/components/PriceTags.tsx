import React from "react";
import { Text as RNText, View } from "react-native";
import { t } from "@/src/lib/i18n";
import { rupiah } from "@/src/lib/format";
import { fonts, radius, useTheme, withAlpha } from "@/src/theme";

// A unit can be priced per month, per night and/or per year. Each kind always has
// its own colour and suffix so they're never mixed up at a glance.
//   /bulan → brand blue   /malam → teal   /tahun → violet

const VIOLET = "#6D4AD6";

export type Priced = { monthly_price?: number | null; daily_price?: number | null; yearly_price?: number | null };

export function hasPrice(u: Priced) {
  return !!(u.monthly_price || u.daily_price || u.yearly_price);
}

export function PriceTags({ unit, size = "md", testID }: { unit: Priced; size?: "sm" | "md"; testID?: string }) {
  const { colors } = useTheme();
  const tags = [
    unit.monthly_price ? { v: unit.monthly_price, suffix: t("/bulan"), color: colors.brandPrimary, key: "m" } : null,
    unit.daily_price ? { v: unit.daily_price, suffix: t("/malam"), color: colors.info, key: "d" } : null,
    unit.yearly_price ? { v: unit.yearly_price, suffix: t("/tahun"), color: VIOLET, key: "y" } : null,
  ].filter(Boolean) as { v: number; suffix: string; color: string; key: string }[];
  if (!tags.length) return null;
  const fs = size === "sm" ? 13 : 14.5;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} testID={testID}>
      {tags.map((tg) => (
        <View key={tg.key} style={{ backgroundColor: withAlpha(tg.color, 0.1), borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
          <RNText style={{ color: tg.color, fontSize: fs, ...fonts.semibold }} numberOfLines={1}>
            {rupiah(tg.v)}
            <RNText style={{ ...fonts.medium, fontSize: fs - 1.5 }}>{tg.suffix}</RNText>
          </RNText>
        </View>
      ))}
    </View>
  );
}
