import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";

// Minimal stroke icon set (lucide-style geometry) so icons render identically
// on web, iOS and Android with zero font-loading risk.
type IconName =
  | "home" | "grid" | "users" | "user-check" | "wrench" | "chat" | "chart"
  | "sliders" | "plus" | "x" | "check" | "chevron-left" | "chevron-right"
  | "copy" | "alert" | "clock" | "calendar-check" | "upload" | "file"
  | "send" | "refresh" | "wallet" | "search" | "logout" | "arrow-right"
  | "pencil" | "phone" | "trash" | "eye" | "user" | "key" | "zap" | "trending-up"
  | "lock" | "globe" | "shield" | "clipboard" | "building" | "message" | "whatsapp" | "person"
  | "menu" | "image" | "camera" | "list-check" | "language" | "crop" | "download" | "share";

// d: stroked paths, c: stroked circles, r: stroked rects, f: filled dots.
// The tab icons (home, building, person, key) follow the logo: thin lines plus a dot.
const GEOM: Record<string, { d?: string[]; c?: [number, number, number][]; r?: [number, number, number, number, number][]; f?: [number, number, number][] }> = {
  home: { d: ["M4 20V10.2L12 4l8 6.2V20H4z"], f: [[12, 14.5, 1.4]] },
  menu: { d: ["M4 7h16", "M4 12h16", "M4 17h10"] },
  download: { d: ["M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 19.5h14"] },
  share: { d: ["M12 15V4", "M8 7.5L12 3.5l4 4", "M7 11H6a1.5 1.5 0 00-1.5 1.5v6A1.5 1.5 0 006 20h12a1.5 1.5 0 001.5-1.5v-6A1.5 1.5 0 0018 11h-1"] },
  image: { r: [[3.5, 4.5, 17, 15, 2.5]], d: ["M3.5 16l4.5-4.5 4 4 3-3 5.5 5.5"], f: [[15.5, 9, 1.4]] },
  camera: { d: ["M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z"], c: [[12, 13, 3.2]] },
  "list-check": { d: ["M10 7h10", "M10 12h10", "M10 17h10", "M3.5 7l1.3 1.3L7 6", "M3.5 12l1.3 1.3L7 11"], f: [[5, 17, 1.2]] },
  language: { c: [[12, 12, 8.5]], d: ["M3.5 12h17", "M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z"] },
  crop: { d: ["M6.5 2.5v14a1 1 0 0 0 1 1h14", "M2.5 6.5h14a1 1 0 0 1 1 1v14"] },
  person: { c: [[12, 8.5, 3.5]], d: ["M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"], f: [[19, 5, 1.2]] },
  whatsapp: {
    d: [
      "M20.5 11.6a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.3A8.5 8.5 0 1 1 20.5 11.6z",
      "M9 8.3c-.3 3.4 3.2 7 6.7 6.7l.9-1.5-2-1.1-.9.8c-1.2-.5-2.3-1.6-2.8-2.8l.8-.9-1.1-2z",
    ],
  },
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
  key: { c: [[6.5, 12, 3.5]], d: ["M10 12h11", "M17 12v3", "M20.5 12v3"] },
  zap: { d: ["M13 2.5L4 14h7l-1 7.5L19 10h-7l1-7.5z"] },
  "trending-up": { d: ["M2.5 17.5l6.5-6.5 4 4 8.5-8.5", "M15.5 6.5h6v6"] },
  lock: { r: [[4, 11, 16, 10, 2]], d: ["M8 11V7.5a4 4 0 0 1 8 0V11"] },
  globe: { c: [[12, 12, 9]], d: ["M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"] },
  shield: { d: ["M12 21.5s8-3.6 8-10V5l-8-2.5L4 5v6.5c0 6.4 8 10 8 10z"] },
  clipboard: { r: [[5, 4, 14, 17.5, 2]], d: ["M9 2.5h6v3H9z", "M9 11h6", "M9 15h4"] },
  building: { r: [[5.5, 3.5, 13, 16.5, 2]], d: ["M3.5 20h17"], f: [[9.5, 8, 1.1], [14.5, 8, 1.1], [9.5, 12, 1.1], [14.5, 12, 1.1], [12, 16.2, 1.1]] },
  message: { d: ["M20.5 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z", "M8 9h8", "M8 12.5h5"] },
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
      {(g.f ?? []).map(([cx, cy, r], i) => (
        <Circle key={`f${i}`} cx={cx} cy={cy} r={r} fill={color} />
      ))}
    </Svg>
  );
}

export type { IconName };
