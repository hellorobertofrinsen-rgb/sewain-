import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  ScrollView,
  StyleProp,
  Switch,
  Text as RNText,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";
import { CSS_EASE_OUT, DURATION, PRESS_SCALE, PRESS_SCALE_SOFT, STATE_TRANSITION } from "@/src/motion";
import { Icon, IconName } from "./Icon";

// ------------------------------ PressableScale ---------------------------------
// Every tappable thing in the app. Feedback lands on press-in (finger down), not on
// release: a 3% scale over 120ms with a strong ease-out — near-imperceptible, which
// is the ceiling for something touched tens of times a day. Reduced motion swaps the
// movement for a dim. A Reanimated CSS transition runs it on the UI thread / CSS.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_TRANSITION: any = {
  transitionProperty: ["transform", "opacity"],
  transitionDuration: DURATION.press,
  transitionTimingFunction: CSS_EASE_OUT,
};

export function PressableScale({
  style,
  soft,
  disabled,
  children,
  role = "button",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  soft?: boolean; // large surfaces (cards) scale less
  role?: "button" | "link" | "tab";
  children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const pressedStyle = reduced ? { opacity: 0.7 } : { transform: [{ scale: soft ? PRESS_SCALE_SOFT : PRESS_SCALE }] };
  return (
    <AnimatedPressable
      accessibilityRole={role}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      pressRetentionOffset={16}
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        rest.onPressOut?.(e);
      }}
      style={[PRESS_TRANSITION, { transform: [{ scale: 1 }] }, style, pressed && !disabled && pressedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

// --------------------------------- Button -----------------------------------

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon,
  testID,
  style,
}: {
  title?: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  testID?: string;
  style?: any;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const disabledAll = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabledAll}
      style={[
        s.btn,
        s[variant],
        size === "sm" && s.btnSm,
        size === "lg" && s.btnLg,
        disabledAll && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.onBrandPrimary : colors.onSurfaceSecondary}
        />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} color={s[`${variant}Text`].color} /> : null}
          {title ? (
            <RNText style={[s.btnText, s[`${variant}Text`], size === "sm" && { fontSize: 12 }]}>
              {title}
            </RNText>
          ) : null}
        </>
      )}
    </PressableScale>
  );
}

// --------------------------------- Inputs -----------------------------------

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      {label ? <RNText style={s.label}>{label}</RNText> : null}
      {children}
      {hint ? <RNText style={s.hint}>{hint}</RNText> : null}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput> & { testID?: string }) {
  const s = useStyles();
  return (
    <TextInput
      placeholderTextColor="#71717A"
      {...props}
      style={[s.input, props.style]}
    />
  );
}

export function Textarea(props: React.ComponentProps<typeof TextInput> & { testID?: string }) {
  const s = useStyles();
  return (
    <TextInput
      multiline
      placeholderTextColor="#71717A"
      {...props}
      style={[s.input, s.textarea, props.style]}
    />
  );
}

export function SwitchRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      <RNText style={{ color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: 14 }}>{label}</RNText>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceTertiary, true: withAlpha(colors.success, 0.5) }}
        thumbColor={value ? colors.success : colors.brandSecondary}
      />
    </View>
  );
}

// ---------------------------------- Chips ------------------------------------
// Filter chips are chrome: one horizontal scroller, fixed 36pt height,
// flexShrink 0, selection changes color/border only.

export function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const s = useStyles();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={[STATE_TRANSITION, s.chip, active && s.chipActive]}
    >
      <RNText style={[s.chipText, active && s.chipTextActive]} numberOfLines={1}>
        {label}
      </RNText>
    </PressableScale>
  );
}

export function ChipRow({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const s = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.chipRow}
      style={{ flexGrow: 0, flexShrink: 0 }}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

// --------------------------------- Surface -----------------------------------

export function Card({
  children,
  style,
  testID,
  onPress,
}: {
  children: React.ReactNode;
  style?: any;
  testID?: string;
  onPress?: () => void;
}) {
  const s = useStyles();
  if (onPress) {
    return (
      <PressableScale testID={testID} onPress={onPress} soft style={[s.card, style]}>
        {children}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

// -------------------------------- StatusPill ---------------------------------

export type Tone = "success" | "warning" | "error" | "info" | "neutral" | "brand";

export function StatusPill({ label, tone = "neutral", testID }: { label: string; tone?: Tone; testID?: string }) {
  const { colors } = useTheme();
  const map: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: withAlpha(colors.success, 0.16), fg: colors.success },
    warning: { bg: withAlpha(colors.warning, 0.16), fg: colors.warning },
    error: { bg: withAlpha(colors.error, 0.16), fg: colors.error },
    info: { bg: withAlpha(colors.info, 0.16), fg: colors.info },
    neutral: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
    brand: { bg: colors.brandPrimary, fg: colors.onBrandPrimary },
  };
  const t = map[tone];
  return (
    <View testID={testID} style={{ backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" }}>
      <RNText style={{ color: t.fg, fontSize: 11, fontFamily: fonts.semibold, letterSpacing: 0.2 }}>{label}</RNText>
    </View>
  );
}

// -------------------------------- Misc ---------------------------------------

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: any }) {
  const s = useStyles();
  return <RNText style={[s.sectionTitle, style]}>{children}</RNText>;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View testID={testID} style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={26} color={colors.onSurfaceSecondary} />
      </View>
      <RNText style={s.emptyTitle}>{title}</RNText>
      {subtitle ? <RNText style={s.emptySubtitle}>{subtitle}</RNText> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.spinner} testID={label ? "spinner-labeled" : "spinner"}>
      <ActivityIndicator color={colors.onSurfaceSecondary} />
      {label ? <RNText style={s.hint}>{label}</RNText> : null}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const s = useStyles();
  return (
    <View style={s.errorBox} testID="error-box">
      <Icon name="alert" size={16} color={s.errorText.color} />
      <RNText style={s.errorText}>{message}</RNText>
      {onRetry ? (
        <Button title="Coba lagi" variant="ghost" size="sm" onPress={onRetry} testID="error-retry-button" />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  btnSm: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  btnLg: { minHeight: 54, borderRadius: radius.md + 2 },
  primary: { backgroundColor: colors.brandPrimary },
  secondary: { backgroundColor: colors.surfaceTertiary },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: withAlpha(colors.error, 0.5) },
  primaryText: { color: colors.onBrandPrimary },
  secondaryText: { color: colors.onSurfaceTertiary },
  ghostText: { color: colors.onSurfaceTertiary },
  dangerText: { color: colors.error },
  btnText: { fontFamily: fonts.semibold, fontSize: 14 },
  label: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  input: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  textarea: { minHeight: 100, paddingTop: 10, textAlignVertical: "top", lineHeight: 20 },
  chip: {
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
  chipTextActive: { color: colors.onBrandPrimary, fontFamily: fonts.semibold },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, alignItems: "center" },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  empty: { alignItems: "center", paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 16, textAlign: "center" },
  emptySubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", lineHeight: 19 },
  spinner: { alignItems: "center", justifyContent: "center", padding: spacing.xxxl, gap: spacing.md },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: withAlpha(colors.error, 0.12),
    borderColor: withAlpha(colors.error, 0.4),
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { color: colors.error, fontFamily: fonts.medium, fontSize: 13, flex: 1 },
}));
