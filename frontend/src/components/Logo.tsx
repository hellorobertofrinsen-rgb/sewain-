import React from "react";
import { Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { fonts, useTheme } from "@/src/theme";

// Sewain logo (placeholder until the final logo arrives): a lowercase "s" whose
// negative space hides a doorway, white on a blue tile so it reads on any
// background.
export function LogoMark({ size = 32, color, bg }: { size?: number; color?: string; bg?: string }) {
  const { colors } = useTheme();
  const tile = bg ?? colors.brandPrimary;
  const ink = color ?? "#FFFFFF";
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Rect x={0} y={0} width={48} height={48} rx={13} fill={tile} />
      <Path
        d="M33.2 14.4C31.4 11.6 27.9 10.2 24.2 10.7c-4 .6-6.7 3.3-6.2 6.5.6 3.6 4.7 4.8 8.7 6.2 4 1.3 6.8 3.3 6.3 6.9-.5 3.8-5.3 6.5-10.1 5.8-3.3-.4-6.1-2.2-7.5-4.7"
        stroke={ink}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <Rect x={21.6} y={21.8} width={4.8} height={11.6} rx={2.4} fill={tile} />
    </Svg>
  );
}

export function LogoFull({ size = 28 }: { size?: number; color?: string; bg?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} />
      <Text style={{ color: colors.onSurface, ...fonts.bold, fontSize: size * 0.8, letterSpacing: -0.5 }}>Sewain</Text>
    </View>
  );
}
