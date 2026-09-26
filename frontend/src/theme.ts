// Design tokens for Sewain — dark charcoal, restrained (ChatGPT x Apple direction).
// Keys match the "color" block of /app/design_guidelines.json.
//
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Build StyleSheets with makeStyles so colors follow the theme; read
// useTheme().colors for color props (icon color, placeholderTextColor...).

import { useMemo } from "react";
import { StyleSheet } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  // Surfaces
  surface: "#121214",
  onSurface: "#F4F4F6",
  surfaceSecondary: "#1A1A1E",
  onSurfaceSecondary: "#A1A1AA",
  surfaceTertiary: "#26262C",
  onSurfaceTertiary: "#D4D4D8",
  surfaceInverse: "#FAFAFA",
  onSurfaceInverse: "#121214",
  muted: "#71717A",

  // Brand (monochrome, restrained)
  brand: "#E4E4E7",
  onBrand: "#121214",
  brandPrimary: "#FAFAFA",
  onBrandPrimary: "#121214",
  brandSecondary: "#A1A1AA",
  onBrandSecondary: "#121214",
  brandTertiary: "#27272A",
  onBrandTertiary: "#FAFAFA",

  // Status (semantic only)
  success: "#34D399",
  onSuccess: "#064E3B",
  warning: "#FBBF24",
  onWarning: "#78350F",
  error: "#F87171",
  onError: "#7F1D1D",
  info: "#60A5FA",
  onInfo: "#1E3A8A",

  // Lines
  border: "#27272A",
  borderStrong: "#3F3F46",
  divider: "#1E1E24",
};

export type ThemeColors = typeof dark;

export const defaultScheme: ColorScheme = "dark";

// Sewain ships dark-only: the calm charcoal look is the product.
export const themes: { light?: ThemeColors; dark?: ThemeColors } = { dark };

export function setColorScheme(_scheme: ColorScheme | null) {
  // Dark-only app: nothing to switch.
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "dark", colors: dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// ---------------------------------------------------------------------------
// Spacing / radius / typography tokens (from design_guidelines.json)
// ---------------------------------------------------------------------------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
};

export const fonts = {
  regular: "Rubik-Regular",
  medium: "Rubik-Medium",
  semibold: "Rubik-Semibold",
  bold: "Rubik-Bold",
};

export const type = {
  xs: 11,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  display: 30,
};

// rgba() from a hex token — for soft status backgrounds and overlays.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
