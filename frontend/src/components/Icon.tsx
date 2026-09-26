import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";

// Minimal stroke icon set (lucide-style geometry) so icons render identically
// on web, iOS and Android with zero font-loading risk.
type IconName =
  | "home" | "grid" | "users" | "user-check" | "wrench" | "chat" | "chart"
  | "sliders" | "plus" | "x" | "check" | "chevron-left" | "chevron-right"
  | "copy" | "alert" | "clock" | "calendar-check" | "upload" | "file"
  | "send" | "refresh" | "wallet" | "search" | "logout" | "arrow-right"
  | "pencil" | "phone" | "trash" | "eye" | "user";

const GEOM: Record<string, { d?: string[]; c?: [number, number, number][]; r?: [number, number, number, number, number][] }> = {
  home: { d: ["M3 10.5L12 3l9 7.5", "M5 9.7V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.7", "M9.5 21v-5.5h5V21"] },
  grid: { r: [[3, 3, 7, 7, 2], [14, 3, 7, 7, 2], [3, 14, 7, 7, 2], [14, 14, 7, 7, 2]] },
  users: { c: [[9, 7.5, 3.5]], d: ["M2.5 20c0-3.2 2.9-5.3 6.5-5.3s6.5 2.1 6.5 5.3", "M16.5 4.6a3.5 3.5 0 0 1 0 6.8", "M18.5 15.2c1.9.8 3 2.4 3 4.8"] },
  "user-check": { c: [[9, 7.5, 3.5]], d: ["M2.5 20c0-3.2 2.9-5.3 6.5-5.3s6.5 2.1 6.5 5.3", "M15.5 12.5l2 2 4-4.5"] },
  wrench: { d: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"] },
  chat: { d: ["M21 11.5a8.4 8.4 0 0 1-8.5 8.4c-1.6 0-3-.4-4.3-1.1L3 20l1.2-5.2A8.4 8.4 0 1 1 21 11.5z"] },
  chart: { d: ["M4 20.5V10.5", "M10 20.5V3.5", "M16 20.5v-7", "M2.5 20.5h19"] },
  sliders: { d: ["M3 7h8", "M17 7h4", "M3 17h4", "M13 17h8"], c: [[14, 7, 2], [10, 17, 2]] },
  plus: { d: ["M12 5v14", "M5 12h14"] },
  x: { d: ["M6 6l12 12", "M18 6L6 18"] },
  check: { d: ["M4.5 12.5l5 5L19.5 7"] },
  "chevron-left": { d: ["M15 5l-7 7 7 7"] },
  "chevron-right": { d: ["M9 5l7 7-7 7"] },
  copy: { r: [[9, 9, 11, 11, 2]], d: ["M5.5 15H4.8A1.8 1.8 0 0 1 3 13.2V4.8A1.8 1.8 0 0 1 4.8 3h8.4A1.8 1.8 0 0 1 15 4.8v.7"] },
  alert: { d: ["M12 3.5L2.5 20h19L12 3.5z", "M12 10v4.5", "M12 17.5h.01"] },
  clock: { c: [[12, 12, 8.5]], d: ["M12 7.5V12l3 2"] },
  "calendar-check": { r: [[3.5, 5, 17, 16, 2]], d: ["M8 3v4", "M16 3v4", "M3.5 10.5h17", "M9 15.5l2 2 4-4.5"] },
  upload: { d: ["M12 15V4", "M7 8.5l5-5 5 5", "M4.5 20.5h15"] },
  file: { d: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z", "M14 3v5h5", "M9 13h6", "M9 17h4"] },
  send: { d: ["M21.5 2.5L11 13", "M21.5 2.5L15 21l-4-8.5L2.5 9l19-6.5z"] },
  refresh: { d: ["M20.5 4v5h-5", "M3.5 20v-5h5", "M4 9a8 8 0 0 1 13.7-3.5L20.5 9", "M20 15a8 8 0 0 1-13.7 3.5L3.5 15"] },
  wallet: { r: [[2.5, 6, 19, 13, 2]], d: ["M2.5 10.5h19", "M15.5 15h.01"] },
  search: { c: [[11, 11, 7]], d: ["M16.5 16.5L21 21"] },
  logout: { d: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"] },
  "arrow-right": { d: ["M4.5 12h15", "M13.5 6l6 6-6 6"] },
  pencil: { d: ["M12.5 20h8.5", "M16.7 3.8a2.1 2.1 0 0 1 3 3L7.5 19 3 20l1-4.5L16.7 3.8z"] },
  phone: { d: ["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"] },
  trash: { d: ["M3.5 6.5h17", "M8 6.5V4a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 4v2.5", "M5.5 6.5l1 14h11l1-14", "M10 10.5v6", "M14 10.5v6"] },
  eye: { d: ["M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"], c: [[12, 12, 2.75]] },
  user: { c: [[12, 8, 4]], d: ["M4.5 21c0-3.7 3.4-6 7.5-6s7.5 2.3 7.5 6"] },
};

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const g = GEOM[name] ?? {};
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {(g.d ?? []).map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {(g.c ?? []).map(([cx, cy, r], i) => (
        <Circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} />
      ))}
      {(g.r ?? []).map(([x, y, w, h, rx = 0], i) => (
        <Rect key={`r${i}`} x={x} y={y} width={w} height={h} rx={rx} stroke={color} strokeWidth={strokeWidth} />
      ))}
    </Svg>
  );
}

export type { IconName };
