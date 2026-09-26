import React from "react";
import { Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { fonts, useTheme } from "@/src/theme";

// Sewain logo — a lowercase "s" whose negative space hides a doorway/room.
// Monochrome, symbol-first, works at 20px.
export function LogoMark({
  size = 32,
  color,
  bg,
}: {
  size?: number;
  color?: string;
  bg?: string;
}) {
  const { colors } = useTheme();
  const c = color ?? colors.onSurface;
  const b = bg ?? colors.surface;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M34.2 13.4C32.2 10.2 28.3 8.6 24.1 9.2c-4.5.7-7.5 3.7-6.9 7.3.7 4 5.2 5.4 9.7 6.9 4.5 1.5 7.6 3.7 7 7.7-.6 4.3-5.9 7.3-11.3 6.5-3.7-.5-6.8-2.5-8.4-5.3"
        stroke={c}
        strokeWidth={5.6}
        strokeLinecap="round"
      />
      <Rect x={21.2} y={21.6} width={5.2} height={12.8} rx={2.6} fill={b} />
    </Svg>
  );
}

export function LogoFull({ size = 28, color, bg }: { size?: number; color?: string; bg?: string }) {
  const { colors } = useTheme();
  const c = color ?? colors.onSurface;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} color={c} bg={bg} />
      <Text
        style={{
          color: c,
          fontFamily: fonts.bold,
          fontSize: size * 0.82,
          letterSpacing: -0.5,
        }}
      >
        Sewain
      </Text>
    </View>
  );
}
