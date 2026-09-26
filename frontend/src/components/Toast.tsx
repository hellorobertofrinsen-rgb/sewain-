import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text as RNText, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutUp, LinearTransition, ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, makeStyles, radius, spacing, withAlpha } from "@/src/theme";
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
    setToasts((t) => [...t.slice(-2), { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <View pointerEvents="none" style={[s.wrap, { top: insets.top + spacing.sm, pointerEvents: "none" }]}>
        {toasts.map((t) => (
          <Animated.View key={t.id} entering={reduced ? TOAST_ENTER_REDUCED : TOAST_ENTER} exiting={reduced ? TOAST_EXIT_REDUCED : TOAST_EXIT} layout={TOAST_REFLOW} style={[s.toast, s[t.type]]}>
            <Icon name={t.type === "error" ? "alert" : "check"} size={15} color={s[`${t.type}Text`].color} />
            <RNText style={[s.text, s[`${t.type}Text`]]} numberOfLines={3}>
              {t.msg}
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
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.borderStrong,
  },
  ok: { borderColor: withAlpha(colors.success, 0.5) },
  error: { borderColor: withAlpha(colors.error, 0.5) },
  info: { borderColor: withAlpha(colors.info, 0.5) },
  okText: { color: colors.success },
  errorText: { color: colors.error },
  infoText: { color: colors.info },
  text: { fontFamily: fonts.medium, fontSize: 13, flex: 1 },
}));
