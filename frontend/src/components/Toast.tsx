import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text as RNText, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutUp, LinearTransition, ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardShadow, fonts, makeStyles, spacing } from "@/src/theme";
import { Icon } from "./Icon";
import { DURATION, EASE_IN_OUT, EASE_OUT } from "@/src/motion";

// Toasts sit at the top: they drop in from above and leave the way they came (spatial
// consistency), exit ~20% faster than they enter, and the stack glides when one leaves.
// Reduced motion: the same timing as a plain fade (gentler, not zero), no travel.
const TOAST_ENTER = FadeInDown.duration(DURATION.toastIn).easing(EASE_OUT);
const TOAST_EXIT = FadeOutUp.duration(DURATION.toastOut).easing(EASE_OUT);
const TOAST_ENTER_REDUCED = FadeIn.duration(DURATION.toastIn).reduceMotion(ReduceMotion.Never);
const TOAST_EXIT_REDUCED = FadeOut.duration(DURATION.toastOut).reduceMotion(ReduceMotion.Never);
const TOAST_REFLOW = LinearTransition.duration(DURATION.reflow).easing(EASE_IN_OUT);

type ToastType = "ok" | "error" | "info";
type Toast = { id: number; msg: string; type: ToastType };

const Ctx = createContext<{ toast: (msg: string, type?: ToastType) => void }>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const toast = useCallback((msg: string, type: ToastType = "ok") => {
    const id = ++idRef.current;
    // The pill already shows a check icon; drop a trailing "✓" from older messages.
    setToasts((cur) => [...cur.slice(-2), { id, msg: msg.replace(/\s*✓\s*$/, ""), type }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <View pointerEvents="none" style={[s.wrap, { top: insets.top + spacing.sm, pointerEvents: "none" }]}>
        {toasts.map((item) => (
          <Animated.View key={item.id} entering={reduced ? TOAST_ENTER_REDUCED : TOAST_ENTER} exiting={reduced ? TOAST_EXIT_REDUCED : TOAST_EXIT} layout={TOAST_REFLOW} style={[s.toast, s[item.type]]}>
            <Icon name={item.type === "error" ? "alert" : "check"} size={17} color={item.type === "error" ? "#FF8A80" : item.type === "info" ? "#9CC3FF" : "#7BD3A0"} />
            <RNText style={[s.text, s[`${item.type}Text`]]} numberOfLines={3}>
              {item.msg}
            </RNText>
          </Animated.View>
        ))}
      </View>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 2000,
    gap: spacing.sm,
    alignItems: "center",
  },
  // Dark pill on a light app: the one place high contrast is the point.
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: 18,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 13,
    backgroundColor: colors.surfaceInverse,
    maxWidth: 480,
    width: "100%",
    ...cardShadow,
  },
  ok: {},
  error: {},
  info: {},
  okText: { color: "#FFFFFF" },
  errorText: { color: "#FFFFFF" },
  infoText: { color: "#FFFFFF" },
  text: { ...fonts.medium, fontSize: 15, flex: 1, lineHeight: 20 },
}));
