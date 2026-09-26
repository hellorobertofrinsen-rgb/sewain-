import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { fonts, useTheme } from "@/src/theme";

// SewAIn logo: a line-drawn owl carrying a key in its beak — watchful, trustworthy,
// and it holds the keys. Drawn in code (traced from the brand artwork) so it stays
// sharp from a 20px header to a 1024px app icon. White lines on a blue tile.

// Artwork coordinates: the owl sits inside a 216×216 box starting at (20, 34).
function Owl({ stroke, sw }: { stroke: string; sw: number }) {
  return (
    <>
      <G fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M91 97 V92 C91 64 112 43 137 43 C162 43 182 64 182 92 V97" />
        <Circle cx={52} cy={97} r={15} />
        <Path d="M67 97 H128 L137 112 L146 97 H220" />
        <Path d="M200 97 V110 M213 97 V110" />
        <Path d="M182 110 V150 C182 192 150 219 94 222" />
        <Path d="M29 222 C44 182 78 129 106 125 C127 122 136 141 128 166 C119 195 82 216 29 222 Z" />
        <Path d="M29 222 H72" />
        <Path d="M109 223 L119 240 M128 219 L139 240 M101 241 H156" />
      </G>
      <G fill={stroke}>
        <Circle cx={117} cy={79} r={sw * 0.92} />
        <Circle cx={157} cy={79} r={sw * 0.92} />
        <Circle cx={92} cy={109} r={sw * 0.55} />
        <Circle cx={81} cy={222} r={sw * 0.55} />
      </G>
    </>
  );
}

/** The app-icon tile. Lines get bolder as the mark gets smaller so they never vanish. */
export function LogoMark({ size = 32, color, bg }: { size?: number; color?: string; bg?: string }) {
  const { colors } = useTheme();
  const tile = bg ?? colors.brandPrimary;
  const ink = color ?? "#FFFFFF";
  const sw = size <= 28 ? 11 : size <= 48 ? 9 : size <= 96 ? 7.5 : 6;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Rect x={0} y={0} width={256} height={256} rx={64} fill={tile} />
      <G transform="translate(6.5,-6.8) scale(0.95)">
        <Owl stroke={ink} sw={sw} />
      </G>
    </Svg>
  );
}

export function LogoFull({ size = 28 }: { size?: number; color?: string; bg?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} />
      <Text style={{ color: colors.onSurface, ...fonts.bold, fontSize: size * 0.8, letterSpacing: -0.5 }}>SewAIn</Text>
    </View>
  );
}
