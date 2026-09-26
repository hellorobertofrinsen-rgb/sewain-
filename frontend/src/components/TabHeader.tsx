import React from "react";
import { Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "./Icon";
import { PressableScale } from "./ui";
import { t } from "@/src/lib/i18n";
import { useIsWide } from "@/src/lib/layout";
import { useMenu } from "@/src/lib/menu";
import { cardShadow, largeTitle, makeStyles, spacing, fonts, useTheme } from "@/src/theme";

/**
 * Top of every tab: an iOS-style 34pt large title, one line of context, actions on the right.
 * `menu`: screens reached from ☰ (Laporan, To-do, Testimoni) get the ☰ button back on
 * phones, where the sidebar is hidden.
 */
export function TabHeader({ title, sub, right, testID, menu }: { title: string; sub?: string | null; right?: React.ReactNode; testID?: string; menu?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  const { openMenu } = useMenu();
  return (
    <View style={[s.wrap, { paddingTop: wide ? spacing.xl : insets.top + spacing.lg }]} testID={testID}>
      {menu && !wide ? (
        <PressableScale testID="tab-menu-button" onPress={openMenu} style={s.menuBtn} accessibilityLabel={t("Menu")}>
          <Icon name="menu" size={22} color={colors.onSurface} />
        </PressableScale>
      ) : null}
      <View style={s.row}>
        <RNText style={s.title} numberOfLines={1} accessibilityRole="header">{title}</RNText>
        {right ? <View style={s.right}>{right}</View> : null}
      </View>
      {sub ? <RNText style={s.sub}>{sub}</RNText> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 4 },
  menuBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, marginBottom: spacing.sm, ...cardShadow,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { ...largeTitle, color: colors.onSurface, flexShrink: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 21 },
}));
