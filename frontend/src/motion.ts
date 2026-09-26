// Motion tokens — the only place curves and durations are defined, so every
// animation in the app shares one personality: crisp, quiet, fast (a work tool,
// not a toy). Values follow Emil Kowalski's design-engineering guidance.
import { Easing } from "react-native-reanimated";

// Curves (Reanimated). Never use ease-in on UI: it delays the moment the user watches.
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1); // entering / exiting, press feedback
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1); // moving / morphing on screen
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1); // iOS sheet curve

// The same curves as CSS strings, for Reanimated CSS transitions.
export const CSS_EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

export const DURATION = {
  press: 120, // press feedback: near-imperceptible, it happens tens of times a day
  state: 160, // chip / toggle / selection colour change
  toastIn: 240,
  toastOut: 190, // exits ~20% faster than it enters
  sheetIn: 300,
  sheetOut: 220,
  reflow: 220, // list items closing the gap after one is removed
} as const;

// Springs only where a finger was involved (Apple's duration/dampingRatio form).
export const SPRING_SETTLE = { duration: 300, dampingRatio: 0.8 } as const;

export const PRESS_SCALE = 0.97;
export const PRESS_SCALE_SOFT = 0.985; // large surfaces (cards) move less

// Selection is a state change: a short colour transition (plus the press scale).
export const STATE_TRANSITION: any = {
  transitionProperty: ["transform", "opacity", "backgroundColor", "borderColor"],
  transitionDuration: DURATION.state,
  transitionTimingFunction: CSS_EASE_OUT,
};
