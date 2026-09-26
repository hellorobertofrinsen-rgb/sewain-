import React from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

// Light, flat illustrations for empty states: the brand blue plus a few warm, homey
// tones (sand, peach, sage); drawn in code so they are crisp at any size and weigh nothing.

const C = {
  terra: "#2457D6", // brand blue (names kept from the first palette)
  terraLight: "#6E9BF0",
  peach: "#F7D9C4",
  sand: "#EFE3D3",
  sage: "#8DB38F",
  sageLight: "#D8E8D5",
  sky: "#D6E6F4",
  ink: "#2D2A26",
  white: "#FFFFFF",
  ground: "#E9E4DD",
};

export type IllustrationName = "units" | "leads" | "tenants" | "done" | "issues" | "report" | "welcome";

function Units() {
  return (
    <G>
      <Circle cx={160} cy={30} r={14} fill={C.peach} />
      <Ellipse cx={100} cy={128} rx={84} ry={8} fill={C.ground} />
      <Rect x={34} y={40} width={62} height={88} rx={6} fill={C.terraLight} />
      <Rect x={96} y={62} width={70} height={66} rx={6} fill={C.sand} />
      {[0, 1, 2, 3].map((r) =>
        [0, 1].map((c) => <Rect key={`a${r}${c}`} x={44 + c * 24} y={52 + r * 17} width={14} height={10} rx={2} fill={C.white} opacity={0.9} />),
      )}
      {[0, 1, 2].map((c) => <Rect key={`b${c}`} x={106 + c * 20} y={74} width={12} height={12} rx={2} fill={C.sky} />)}
      {[0, 1, 2].map((c) => <Rect key={`c${c}`} x={106 + c * 20} y={94} width={12} height={12} rx={2} fill={C.sky} />)}
      <Rect x={124} y={110} width={14} height={18} rx={2} fill={C.terra} />
      <Circle cx={22} cy={116} r={10} fill={C.sageLight} />
      <Circle cx={180} cy={114} r={12} fill={C.sage} />
    </G>
  );
}

function Leads() {
  return (
    <G>
      <Ellipse cx={100} cy={128} rx={70} ry={7} fill={C.ground} />
      <Rect x={26} y={22} width={92} height={48} rx={16} fill={C.white} stroke={C.sand} strokeWidth={2} />
      <Path d="M44 70 L40 84 L58 70 Z" fill={C.white} />
      <Rect x={40} y={36} width={56} height={7} rx={3.5} fill={C.sand} />
      <Rect x={40} y={50} width={36} height={7} rx={3.5} fill={C.peach} />
      <Rect x={96} y={58} width={80} height={42} rx={16} fill={C.terra} />
      <Path d="M158 100 L164 112 L146 100 Z" fill={C.terra} />
      <Rect x={110} y={71} width={50} height={7} rx={3.5} fill={C.white} opacity={0.9} />
      <Rect x={110} y={84} width={30} height={7} rx={3.5} fill={C.white} opacity={0.6} />
      <Circle cx={36} cy={108} r={11} fill={C.peach} />
      <Path d="M20 128 C20 116 52 116 52 128 Z" fill={C.terraLight} />
    </G>
  );
}

function Tenants() {
  return (
    <G>
      <Ellipse cx={100} cy={128} rx={80} ry={7} fill={C.ground} />
      <Path d="M40 66 L90 30 L140 66 Z" fill={C.terra} />
      <Rect x={50} y={64} width={80} height={64} rx={4} fill={C.sand} />
      <Rect x={82} y={92} width={18} height={36} rx={3} fill={C.terraLight} />
      <Rect x={60} y={78} width={14} height={14} rx={2} fill={C.sky} />
      <Rect x={108} y={78} width={14} height={14} rx={2} fill={C.sky} />
      <G rotation={-20} origin="160, 70">
        <Circle cx={160} cy={58} r={14} fill="none" stroke={C.terra} strokeWidth={6} />
        <Rect x={157} y={70} width={6} height={36} rx={3} fill={C.terra} />
        <Rect x={163} y={92} width={10} height={5} rx={2} fill={C.terra} />
        <Rect x={163} y={100} width={7} height={5} rx={2} fill={C.terra} />
      </G>
      <Circle cx={28} cy={116} r={11} fill={C.sage} />
    </G>
  );
}

function Done() {
  return (
    <G>
      <Ellipse cx={100} cy={128} rx={60} ry={7} fill={C.ground} />
      <Circle cx={100} cy={66} r={44} fill={C.sageLight} />
      <Circle cx={100} cy={66} r={32} fill={C.sage} />
      <Path d="M84 66 L95 77 L117 55" fill="none" stroke={C.white} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M36 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill={C.terraLight} />
      <Path d="M160 20 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 z" fill={C.peach} />
      <Path d="M168 96 l2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 7 -2.5 z" fill={C.terra} />
      <Circle cx={40} cy={100} r={5} fill={C.peach} />
    </G>
  );
}

function Issues() {
  return (
    <G>
      <Ellipse cx={100} cy={128} rx={72} ry={7} fill={C.ground} />
      <Rect x={44} y={62} width={112} height={62} rx={10} fill={C.terraLight} />
      <Rect x={44} y={62} width={112} height={18} rx={9} fill={C.terra} />
      <Path d="M80 62 V52 a6 6 0 0 1 6 -6 h28 a6 6 0 0 1 6 6 V62" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      <Rect x={92} y={76} width={16} height={12} rx={3} fill={C.sand} />
      <G rotation={35} origin="150, 40">
        <Rect x={146} y={22} width={8} height={40} rx={4} fill={C.ink} opacity={0.75} />
        <Circle cx={150} cy={22} r={10} fill={C.ink} opacity={0.75} />
        <Rect x={146} y={10} width={8} height={10} fill={C.sand} />
      </G>
      <Circle cx={30} cy={52} r={9} fill={C.sky} />
    </G>
  );
}

function Report() {
  return (
    <G>
      <Ellipse cx={100} cy={128} rx={76} ry={7} fill={C.ground} />
      <Rect x={30} y={24} width={140} height={100} rx={14} fill={C.white} stroke={C.sand} strokeWidth={2} />
      <Rect x={50} y={84} width={16} height={26} rx={4} fill={C.peach} />
      <Rect x={76} y={70} width={16} height={40} rx={4} fill={C.terraLight} />
      <Rect x={102} y={56} width={16} height={54} rx={4} fill={C.terra} />
      <Rect x={128} y={44} width={16} height={66} rx={4} fill={C.sage} />
      <Path d="M52 70 L84 54 L110 42 L140 32" fill="none" stroke={C.ink} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 7" />
    </G>
  );
}

function Welcome() {
  return (
    <G>
      <Circle cx={150} cy={34} r={16} fill={C.peach} />
      <Ellipse cx={100} cy={128} rx={86} ry={8} fill={C.ground} />
      <Path d="M44 70 L100 28 L156 70 Z" fill={C.terra} />
      <Rect x={56} y={68} width={88} height={60} rx={4} fill={C.white} stroke={C.sand} strokeWidth={2} />
      <Rect x={88} y={90} width={24} height={38} rx={3} fill={C.terraLight} />
      <Circle cx={106} cy={110} r={2.5} fill={C.white} />
      <Rect x={66} y={80} width={14} height={14} rx={2} fill={C.sky} />
      <Rect x={120} y={80} width={14} height={14} rx={2} fill={C.sky} />
      <Circle cx={28} cy={114} r={12} fill={C.sage} />
      <Circle cx={176} cy={116} r={9} fill={C.sageLight} />
    </G>
  );
}

const SCENES: Record<IllustrationName, () => React.JSX.Element> = {
  units: Units,
  leads: Leads,
  tenants: Tenants,
  done: Done,
  issues: Issues,
  report: Report,
  welcome: Welcome,
};

export function Illustration({ name, width = 200 }: { name: IllustrationName; width?: number }) {
  const Scene = SCENES[name];
  return (
    <Svg width={width} height={(width * 140) / 200} viewBox="0 0 200 140" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Scene />
    </Svg>
  );
}
