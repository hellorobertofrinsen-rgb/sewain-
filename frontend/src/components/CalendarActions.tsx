import React, { useEffect } from "react";
import { Text as RNText, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Icon, IconName } from "./Icon";
import { PressableScale } from "./ui";
import { t } from "@/src/lib/i18n";
import { EASE_IN_OUT } from "@/src/motion";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";

// "Tambah ke Kalender" is one wide button. Once the event is in Google Calendar it
// morphs into two: the wide button shrinks into the right-hand primary action (its
// colour deepens and its label cross-fades), while "Batal" grows in from the left.
// One continuous 260ms ease-in-out move: nothing pops in, nothing jumps.
// Reduced motion: the widths change instantly and only the labels cross-fade.

const MORPH_MS = 260;

export function CalendarActions({
  added,
  onAdd,
  onCancel,
  primaryLabel,
  primaryIcon = "whatsapp",
  onPrimary,
  testID,
  size = "md",
  cancelLabel,
}: {
  added: boolean;
  onAdd: () => void;
  onCancel: () => void;
  primaryLabel: string;
  primaryIcon?: IconName;
  onPrimary?: (() => void) | null;
  testID: string;
  size?: "sm" | "md";
  cancelLabel?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(added ? 1 : 0); // first render: no animation
  const height = size === "sm" ? 40 : 50;
  const fontSize = size === "sm" ? 14 : 16;
  const iconSize = size === "sm" ? 15 : 18;

  useEffect(() => {
    const to = added ? 1 : 0;
    if (p.get() === to) return;
    p.set(reduced ? withTiming(to, { duration: 160 }) : withTiming(to, { duration: MORPH_MS, easing: EASE_IN_OUT }));
  }, [added, reduced, p]);

  const leftStyle = useAnimatedStyle(() => ({
    flexGrow: reduced ? (p.get() > 0.5 ? 1 : 0) : p.get(),
    marginRight: 8 * (reduced ? (p.get() > 0.5 ? 1 : 0) : p.get()),
    opacity: interpolate(p.get(), [0.25, 1], [0, 1], "clamp"),
  }));
  const rightStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.get(), [0, 1], [colors.brandTertiary, colors.brandPrimary]),
  }));
  const addLabel = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0, 0.5], [1, 0], "clamp") }));
  const primaryLabelStyle = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.5, 1], [0, 1], "clamp") }));

  const primaryDisabled = added && !onPrimary;

  return (
    <View style={[s.row, { height }]}>
      <Animated.View style={[s.left, leftStyle]} pointerEvents={added ? "auto" : "none"}>
        <PressableScale testID={`${testID}-cancel`} onPress={onCancel} disabled={!added} style={[s.cancel, { height }]} accessibilityElementsHidden={!added}>
          <RNText style={[s.cancelText, { fontSize }]} numberOfLines={1}>{cancelLabel || t("Batal")}</RNText>
        </PressableScale>
      </Animated.View>
      {/* The press scale and the colour morph live on the same element, so the whole pill reacts. */}
      <PressableScale
        testID={added ? `${testID}-primary` : `${testID}-add`}
        onPress={added ? onPrimary || undefined : onAdd}
        disabled={primaryDisabled}
        style={[s.right, s.fill, { height }, rightStyle as any, primaryDisabled && { opacity: 0.45 }]}
        accessibilityLabel={added ? primaryLabel : t("Tambah ke Kalender")}
      >
          <Animated.View style={[s.labelLayer, addLabel]} pointerEvents="none">
            <Icon name="calendar-check" size={iconSize} color={colors.onBrandTertiary} />
            <RNText style={[s.addText, { fontSize }]} numberOfLines={1}>{t("Tambah ke Kalender")}</RNText>
          </Animated.View>
          <Animated.View style={[s.labelLayer, primaryLabelStyle]} pointerEvents="none">
            <Icon name={primaryIcon} size={iconSize} color={colors.onBrandPrimary} />
            <RNText style={[s.primaryText, { fontSize }]} numberOfLines={1}>{primaryLabel}</RNText>
          </Animated.View>
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "stretch" },
  left: { flexBasis: 0, overflow: "hidden" },
  cancel: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  cancelText: { color: colors.onSurface, ...fonts.semibold },
  right: { flexGrow: 1, flexBasis: 0, borderRadius: radius.pill, overflow: "hidden" },
  fill: { alignItems: "center", justifyContent: "center" },
  labelLayer: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12,
  },
  addText: { color: colors.onBrandTertiary, ...fonts.semibold },
  primaryText: { color: colors.onBrandPrimary, ...fonts.semibold },
}));
