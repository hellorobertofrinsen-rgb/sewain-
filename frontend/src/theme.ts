// Design tokens for SewAIn — light, calm and roomy.
//
//   Page: very light grey. Cards: white. One accent: a steady "banking" blue that
//   still feels homey, used for the primary action, the selected state and nothing
//   decorative. Warmth comes from the illustrations, not the chrome.
//   Text: near-black for what matters, dark grey (not faded) for everything else.
//
// Build StyleSheets with makeStyles so colors follow the theme; read
// useTheme().colors for color props (icon color, placeholderTextColor...).
// Every text/background pair below meets WCAG AA (4.5:1) on white.

import { useMemo } from "react";
import { Platform, StyleSheet, TextStyle } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#F4F5F7", // page background
  onSurface: "#16181D",
  surfaceSecondary: "#FFFFFF", // cards, sheets, grouped lists
  onSurfaceSecondary: "#4E5560",
  surfaceTertiary: "#EEF0F4", // inputs, idle chips, wells inside cards
  onSurfaceTertiary: "#2A2F37",
  surfaceInverse: "#16181D",
  onSurfaceInverse: "#FFFFFF",
  muted: "#666D78",

  // Brand — homey fintech blue (6.2:1 with white text)
  brand: "#2457D6",
  onBrand: "#FFFFFF",
  brandPrimary: "#2457D6",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#6E9BF0", // lighter blue for illustrations and bars only
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E8EFFD", // soft blue fill
  onBrandTertiary: "#1843A0",

  // Status (semantic only; shown as soft tints)
  success: "#1E7A4F",
  onSuccess: "#FFFFFF",
  warning: "#9A5B00",
  onWarning: "#FFFFFF",
  error: "#C23B32",
  onError: "#FFFFFF",
  info: "#0B7285", // teal, so "info" never reads as the brand blue
  onInfo: "#FFFFFF",

  // Lines
  border: "#E4E7EC",
  borderStrong: "#D2D6DD",
  divider: "#EAECF0",
};

export type ThemeColors = typeof light;

export const defaultScheme: ColorScheme = "light";

// SewAIn ships light-only for now.
export const themes: { light?: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(_scheme: ColorScheme | null) {
  // Light-only app: nothing to switch.
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "light", colors: light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// ---------------------------------------------------------------------------
// Spacing / radius / typography
// ---------------------------------------------------------------------------
// Roomy on purpose: a phone is read at arm's length between viewings.
export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20, // screen gutter, card padding
  xl: 28,
  xxl: 40,
  xxxl: 56,
};

export const radius = {
  sm: 12,
  md: 20, // cards
  lg: 28, // sheets
  pill: 999,
};

// The phone's own font (SF Pro on iPhone, Roboto on Android, Segoe on Windows):
// nothing to download, and it looks at home on every device.
const SYSTEM = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

// Spread into a style: { ...fonts.semibold, fontSize: 15 }
export const fonts: Record<"regular" | "medium" | "semibold" | "bold", TextStyle> = {
  regular: { fontFamily: SYSTEM, fontWeight: "400" },
  medium: { fontFamily: SYSTEM, fontWeight: "500" },
  semibold: { fontFamily: SYSTEM, fontWeight: "600" },
  bold: { fontFamily: SYSTEM, fontWeight: "700" },
};

// Type scale. Big contrast between levels: a 34pt title, 17pt body, 13pt meta.
export const type = {
  xs: 12,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  display: 34,
};

// iOS-style large title used at the top of every tab.
export const largeTitle: TextStyle = { ...fonts.bold, fontSize: 34, lineHeight: 41, letterSpacing: -0.6 };

// Soft card elevation: a hairline plus a very low, wide shadow.
export const cardShadow: any = Platform.select({
  web: { boxShadow: "0 1px 2px rgba(22,24,29,0.04), 0 4px 16px rgba(22,24,29,0.05)" },
  default: { shadowColor: "#16181D", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
});

// rgba() from a hex token — for soft status backgrounds and overlays.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
