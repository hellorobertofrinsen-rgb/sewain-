import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, Text as RNText, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./ui";
import { t } from "@/src/lib/i18n";
import { fonts, makeStyles, spacing } from "@/src/theme";

// A plain crop box: drag inside to move it, drag a corner to resize. Returns the
// crop in the image's own pixels. Nothing fancy (no filters, no rotation).

export type Crop = { x: number; y: number; w: number; h: number };
const MIN = 40; // smallest box, in screen px

export function CropEditor({ uri, initial, onDone, onCancel }: { uri: string; initial?: Crop | null; onDone: (c: Crop) => void; onCancel: () => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    Image.getSize(uri, (w, h) => setNatural({ w, h }), () => setNatural({ w: 1000, h: 1000 }));
  }, [uri]);

  // Displayed image size: fit inside the screen, leaving room for the buttons.
  const box = useMemo(() => {
    if (!natural) return null;
    const maxW = Math.min(winW - 32, 560);
    const maxH = winH - insets.top - insets.bottom - 180;
    const scale = Math.min(maxW / natural.w, maxH / natural.h);
    return { w: natural.w * scale, h: natural.h * scale, scale };
  }, [natural, winW, winH, insets.top, insets.bottom]);

  if (!box || !natural) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
        <View style={s.backdrop} />
      </Modal>
    );
  }
  return <Editor uri={uri} box={box} initial={initial} onDone={onDone} onCancel={onCancel} />;
}

function Editor({ uri, box, initial, onDone, onCancel }: { uri: string; box: { w: number; h: number; scale: number }; initial?: Crop | null; onDone: (c: Crop) => void; onCancel: () => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // Default: full width, the middle 40% of the height (where the praise usually is).
  const start = initial
    ? { x: initial.x * box.scale, y: initial.y * box.scale, w: initial.w * box.scale, h: initial.h * box.scale }
    : { x: 0, y: box.h * 0.3, w: box.w, h: box.h * 0.4 };
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const w = useSharedValue(start.w);
  const h = useSharedValue(start.h);
  const o = useSharedValue({ x: 0, y: 0, w: 0, h: 0 });

  const clamp = (v: number, lo: number, hi: number) => {
    "worklet";
    return Math.min(hi, Math.max(lo, v));
  };

  const move = Gesture.Pan()
    .onStart(() => o.set({ x: x.get(), y: y.get(), w: w.get(), h: h.get() }))
    .onUpdate((e) => {
      x.set(clamp(o.get().x + e.translationX, 0, box.w - w.get()));
      y.set(clamp(o.get().y + e.translationY, 0, box.h - h.get()));
    });

  const corner = (cx: -1 | 1, cy: -1 | 1) =>
    Gesture.Pan()
      .onStart(() => o.set({ x: x.get(), y: y.get(), w: w.get(), h: h.get() }))
      .onUpdate((e) => {
        const b = o.get();
        if (cx === 1) w.set(clamp(b.w + e.translationX, MIN, box.w - b.x));
        else {
          const nx = clamp(b.x + e.translationX, 0, b.x + b.w - MIN);
          x.set(nx);
          w.set(b.w + (b.x - nx));
        }
        if (cy === 1) h.set(clamp(b.h + e.translationY, MIN, box.h - b.y));
        else {
          const ny = clamp(b.y + e.translationY, 0, b.y + b.h - MIN);
          y.set(ny);
          h.set(b.h + (b.y - ny));
        }
      });

  const rect = useAnimatedStyle(() => ({ left: x.get(), top: y.get(), width: w.get(), height: h.get() }));
  // Dim everything outside the box with four panels.
  const topShade = useAnimatedStyle(() => ({ left: 0, top: 0, width: box.w, height: y.get() }));
  const bottomShade = useAnimatedStyle(() => ({ left: 0, top: y.get() + h.get(), width: box.w, height: box.h - y.get() - h.get() }));
  const leftShade = useAnimatedStyle(() => ({ left: 0, top: y.get(), width: x.get(), height: h.get() }));
  const rightShade = useAnimatedStyle(() => ({ left: x.get() + w.get(), top: y.get(), width: box.w - x.get() - w.get(), height: h.get() }));

  const done = () =>
    onDone({ x: x.get() / box.scale, y: y.get() / box.scale, w: w.get() / box.scale, h: h.get() / box.scale });

  const handle = (cx: -1 | 1, cy: -1 | 1, key: string) => (
    <GestureDetector gesture={corner(cx, cy)}>
      <View style={[s.handle, cy === -1 ? { top: -14 } : { bottom: -14 }, cx === -1 ? { left: -14 } : { right: -14 }]} testID={`crop-handle-${key}`}>
        <View style={s.handleDot} />
      </View>
    </GestureDetector>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={s.backdrop} {...({ dataSet: { noPtr: "1" } } as any)}>
          <View style={[s.wrap, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
            <RNText style={s.help}>{t("Geser kotak ke bagian pujiannya. Tarik sudutnya untuk ubah ukuran.")}</RNText>
            <View style={{ width: box.w, height: box.h }} testID="crop-area">
              <Image source={{ uri }} style={{ width: box.w, height: box.h }} resizeMode="stretch" />
              <Animated.View style={[s.shade, topShade]} pointerEvents="none" />
              <Animated.View style={[s.shade, bottomShade]} pointerEvents="none" />
              <Animated.View style={[s.shade, leftShade]} pointerEvents="none" />
              <Animated.View style={[s.shade, rightShade]} pointerEvents="none" />
              <GestureDetector gesture={move}>
                <Animated.View style={[s.rect, rect]} testID="crop-box">
                  {handle(-1, -1, "tl")}
                  {handle(1, -1, "tr")}
                  {handle(-1, 1, "bl")}
                  {handle(1, 1, "br")}
                </Animated.View>
              </GestureDetector>
            </View>
            <View style={s.buttons}>
              <Button title={t("Batal")} variant="ghost" onPress={onCancel} testID="crop-cancel" style={{ flex: 1 }} />
              <Button title={t("Pakai potongan ini")} onPress={done} testID="crop-done" style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.92)" },
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg, paddingHorizontal: spacing.md },
  help: { color: "#FFFFFF", ...fonts.medium, fontSize: 15, textAlign: "center", maxWidth: 420 },
  shade: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  rect: { position: "absolute", borderWidth: 2, borderColor: "#FFFFFF", cursor: "move" as any },
  handle: { position: "absolute", width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  handleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFFFFF", borderWidth: 3, borderColor: colors.brandPrimary },
  buttons: { flexDirection: "row", gap: spacing.sm, width: "100%", maxWidth: 480 },
}));
