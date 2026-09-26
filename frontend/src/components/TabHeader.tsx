import React from "react";
import { Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsWide } from "@/src/lib/layout";
import { largeTitle, makeStyles, spacing, fonts } from "@/src/theme";

/** Top of every tab: an iOS-style 34pt large title, one line of context, actions on the right. */
export function TabHeader({ title, sub, right, testID }: { title: string; sub?: string | null; right?: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  return (
    <View style={[s.wrap, { paddingTop: wide ? spacing.xl : insets.top + spacing.lg }]} testID={testID}>
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { ...largeTitle, color: colors.onSurface, flexShrink: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 21 },
}));
