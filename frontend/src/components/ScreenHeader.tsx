import { PressableScale } from "@/src/components/ui";
import React from "react";
import { Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "./Icon";
import { cardShadow, fonts, makeStyles, spacing, useTheme } from "@/src/theme";

/**
 * Header for pushed screens (detail pages, forms). When the screen is shown inside
 * the desktop split view (`embedded`), there is nothing to go back to, so the back
 * button is dropped (or replaced by a close button when `onClose` is given).
 */
export function ScreenHeader({
  title,
  right,
  backTestID,
  embedded,
  onClose,
}: {
  title: string;
  right?: React.ReactNode;
  backTestID?: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const showBack = !embedded || !!onClose;
  return (
    <View style={[s.header, { paddingTop: (embedded ? 0 : insets.top) + spacing.sm }, embedded && s.embedded]}>
      {showBack ? (
        <PressableScale
          testID={backTestID || "back-button"}
          onPress={() => (onClose ? onClose() : router.canGoBack() ? router.back() : router.replace("/today"))}
          style={s.back}
          accessibilityLabel={onClose ? "Tutup" : "Kembali"}
        >
          <Icon name={onClose ? "x" : "chevron-left"} size={22} color={colors.onSurface} />
        </PressableScale>
      ) : null}
      <RNText style={[s.title, !showBack && { paddingLeft: spacing.sm }]} numberOfLines={1}>{title}</RNText>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  embedded: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  back: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: colors.surfaceSecondary,
    ...cardShadow,
  },
  title: { color: colors.onSurface, ...fonts.bold, fontSize: 20, letterSpacing: -0.3, flex: 1 },
}));
