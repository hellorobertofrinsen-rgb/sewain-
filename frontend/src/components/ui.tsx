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
import { cardShadow, fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";
import { CSS_EASE_OUT, DURATION, PRESS_SCALE, PRESS_SCALE_SOFT, STATE_TRANSITION } from "@/src/motion";
import { Icon, IconName } from "./Icon";
import { Illustration, IllustrationName } from "./Illustration";
import { t } from "@/src/lib/i18n";

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
  role?: "button" | "link" | "tab" | "checkbox";
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
// Pill-shaped. Primary is solid brand blue; secondary is a soft blue tint;
// ghost is a white pill with a hairline (for use on the grey page or white cards).

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
  const s = useStyles();
  const disabledAll = disabled || loading;
  const fg = s[`${variant}Text`].color as string;
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
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 15 : 18} color={fg} /> : null}
          {title ? (
            <RNText style={[s.btnText, s[`${variant}Text`], size === "sm" && { fontSize: 14 }, size === "lg" && { fontSize: 17 }]}>
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
    <View style={{ gap: 8 }}>
      {label ? <RNText style={s.label}>{label}</RNText> : null}
      {children}
      {hint ? <RNText style={s.hint}>{hint}</RNText> : null}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput> & { testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[s.input, props.style]} />;
}

export function Textarea(props: React.ComponentProps<typeof TextInput> & { testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return <TextInput multiline placeholderTextColor={colors.muted} {...props} style={[s.input, s.textarea, props.style]} />;
}

export function SwitchRow({
  label,
  sub,
  value,
  onChange,
  testID,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <RNText style={{ color: colors.onSurface, ...fonts.regular, fontSize: 16 }}>{label}</RNText>
        {sub ? <RNText style={{ color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 18 }}>{sub}</RNText> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.borderStrong, true: colors.success }}
        thumbColor="#FFFFFF"
        {...({ activeThumbColor: "#FFFFFF" } as any)}
      />
    </View>
  );
}

// ---------------------------------- Chips ------------------------------------
// Filter chips are chrome: one horizontal scroller, fixed height, flexShrink 0,
// selection changes color only.

export function Chip({
  label,
  active,
  onPress,
  testID,
  check,
}: {
  label: string;
  active: boolean;
  onPress?: () => void;
  testID?: string;
  /** Checklist chip (several can be on): shows a tick and reads as a checkbox. */
  check?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      role={check ? "checkbox" : "button"}
      accessibilityState={check ? { checked: active } : { selected: active }}
      {...((check ? { "aria-checked": active } : { "aria-pressed": active }) as any)}
      style={[STATE_TRANSITION, s.chip, check && s.chipCheck, active && (check ? s.chipCheckOn : s.chipActive)]}
    >
      {check ? (
        <View style={[s.tick, active && s.tickOn]}>
          {active ? <Icon name="check" size={11} color={colors.onBrandPrimary} strokeWidth={3} /> : null}
        </View>
      ) : null}
      <RNText style={[s.chipText, active && (check ? s.chipTextCheckOn : s.chipTextActive)]} numberOfLines={1}>
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

// ------------------------------ Grouped lists --------------------------------
// iOS-style inset grouped list for detail screens: a white rounded block of rows
// separated by inset hairlines, with an optional small header above it.

export function ListGroup({ title, children, footer, testID }: { title?: string; children: React.ReactNode; footer?: string; testID?: string }) {
  const s = useStyles();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {title ? <RNText style={s.groupTitle}>{title}</RNText> : null}
      <View style={s.group}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={s.groupDivider} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? <RNText style={s.groupFooter}>{footer}</RNText> : null}
    </View>
  );
}

export function ListRow({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  onPress,
  right,
  testID,
  destructive,
}: {
  label: string;
  value?: string | null;
  sub?: string | null;
  icon?: IconName;
  tone?: Tone;
  onPress?: () => void;
  right?: React.ReactNode;
  testID?: string;
  destructive?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const body = (
    <>
      {icon ? <IconCircle icon={icon} tone={tone} size={34} /> : null}
      <View style={s.rowText}>
        <RNText style={[s.rowLabel, destructive && { color: colors.error }]}>{label}</RNText>
        {sub ? <RNText style={s.rowSub}>{sub}</RNText> : null}
      </View>
      {value ? <RNText style={s.rowValue} numberOfLines={1}>{value}</RNText> : null}
      {right}
      {onPress ? <Icon name="chevron-right" size={18} color={colors.borderStrong} /> : null}
    </>
  );
  if (onPress) {
    return (
      <PressableScale soft testID={testID} onPress={onPress} style={s.row}>
        {body}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={s.row}>
      {body}
    </View>
  );
}

// ------------------------------ Icon circle ----------------------------------

export function IconCircle({ icon, tone = "brand", size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const { colors } = useTheme();
  const tc = toneColors(colors, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tc.bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={Math.round(size * 0.48)} color={tc.fg} />
    </View>
  );
}

// -------------------------------- StatusPill ---------------------------------

export type Tone = "success" | "warning" | "error" | "info" | "neutral" | "brand";

export function toneColors(colors: ReturnType<typeof useTheme>["colors"], tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case "success":
      return { bg: withAlpha(colors.success, 0.12), fg: colors.success };
    case "warning":
      return { bg: withAlpha("#E8A33D", 0.18), fg: colors.warning };
    case "error":
      return { bg: withAlpha(colors.error, 0.11), fg: colors.error };
    case "info":
      return { bg: withAlpha(colors.info, 0.11), fg: colors.info };
    case "brand":
      return { bg: colors.brandTertiary, fg: colors.onBrandTertiary };
    default:
      return { bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary };
  }
}

/** `solid`: white backing for use on top of photos, where a soft tint would vanish. */
export function StatusPill({ label, tone = "neutral", testID, solid }: { label: string; tone?: Tone; testID?: string; solid?: boolean }) {
  const { colors } = useTheme();
  const tc = toneColors(colors, tone);
  return (
    <View testID={testID} style={[{ backgroundColor: solid ? "rgba(255,255,255,0.95)" : tc.bg, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5, alignSelf: "flex-start", maxWidth: "100%" }, solid && cardShadow]}>
      <RNText style={{ color: tc.fg, fontSize: 12.5, ...fonts.semibold }} numberOfLines={1}>{label}</RNText>
    </View>
  );
}

// -------------------------------- Misc ---------------------------------------

export function SectionTitle({ children, style, right }: { children: React.ReactNode; style?: any; right?: React.ReactNode }) {
  const s = useStyles();
  if (right) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
        <RNText style={[s.sectionTitle, style]}>{children}</RNText>
        {right}
      </View>
    );
  }
  return <RNText style={[s.sectionTitle, style]}>{children}</RNText>;
}

export function EmptyState({
  icon,
  art,
  title,
  subtitle,
  action,
  testID,
}: {
  icon?: IconName;
  art?: IllustrationName;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  testID?: string;
}) {
  const s = useStyles();
  return (
    <View testID={testID} style={s.empty}>
      {art ? <Illustration name={art} /> : icon ? <IconCircle icon={icon} tone="brand" size={64} /> : null}
      <RNText style={s.emptyTitle}>{title}</RNText>
      {subtitle ? <RNText style={s.emptySubtitle}>{subtitle}</RNText> : null}
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.spinner} testID={label ? "spinner-labeled" : "spinner"}>
      <ActivityIndicator color={colors.brandPrimary} />
      {label ? <RNText style={s.hint}>{label}</RNText> : null}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const s = useStyles();
  return (
    <View style={s.errorBox} testID="error-box">
      <Icon name="alert" size={18} color={s.errorText.color as string} />
      <RNText style={s.errorText}>{message}</RNText>
      {onRetry ? (
        <Button title={t("Coba lagi")} variant="ghost" size="sm" onPress={onRetry} testID="error-retry-button" />
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
    borderRadius: radius.pill,
    minHeight: 50,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  btnSm: { minHeight: 38, paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  btnLg: { minHeight: 56, paddingHorizontal: 26 },
  primary: { backgroundColor: colors.brandPrimary },
  secondary: { backgroundColor: colors.brandTertiary },
  ghost: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong },
  danger: { backgroundColor: withAlpha(colors.error, 0.1) },
  primaryText: { color: colors.onBrandPrimary },
  secondaryText: { color: colors.onBrandTertiary },
  ghostText: { color: colors.onSurface },
  dangerText: { color: colors.error },
  btnText: { ...fonts.semibold, fontSize: 16 },
  label: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  hint: { color: colors.muted, ...fonts.regular, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    color: colors.onSurface,
    ...fonts.regular,
    fontSize: 16,
  },
  textarea: { minHeight: 110, paddingTop: 13, textAlignVertical: "top", lineHeight: 22 },
  chip: {
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14 },
  chipTextActive: { color: colors.onBrandPrimary, ...fonts.semibold },
  chipCheck: { flexDirection: "row", gap: 8, paddingLeft: 12 },
  chipCheckOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipTextCheckOn: { color: colors.onBrandTertiary, ...fonts.semibold },
  tick: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary,
  },
  tickOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, alignItems: "center" },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...cardShadow,
  },
  group: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, overflow: "hidden", ...cardShadow },
  groupTitle: { color: colors.muted, ...fonts.semibold, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", paddingHorizontal: spacing.lg },
  groupFooter: { color: colors.muted, ...fonts.regular, fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.lg },
  groupDivider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14, minHeight: 54 },
  rowLabel: { color: colors.onSurface, ...fonts.regular, fontSize: 16 },
  rowSub: { color: colors.muted, ...fonts.regular, fontSize: 13, lineHeight: 18 },
  rowText: { flexGrow: 1, flexShrink: 1, minWidth: 96, gap: 2 },
  rowValue: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 16, flexShrink: 1, textAlign: "right" },
  sectionTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 22, letterSpacing: -0.3 },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 19, textAlign: "center", marginTop: spacing.sm },
  emptySubtitle: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, textAlign: "center", lineHeight: 22, maxWidth: 380 },
  spinner: { alignItems: "center", justifyContent: "center", padding: spacing.xxxl, gap: spacing.md },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: withAlpha(colors.error, 0.08),
    borderRadius: 16,
    padding: spacing.md,
  },
  errorText: { color: colors.error, ...fonts.medium, fontSize: 14, flex: 1, lineHeight: 20 },
}));
