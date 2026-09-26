import React, { useState } from "react";
import { Linking, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { Sheet } from "./Sheet";
import { Illustration, IllustrationName } from "./Illustration";
import { Icon } from "./Icon";
import { Button, Card, PressableScale } from "./ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { t } from "@/src/lib/i18n";
import { unitShareMessage, waShareLink } from "@/src/lib/messages";
import { DURATION, EASE_OUT } from "@/src/motion";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

// First-run checklist on Home. Four steps, any order (an agent may already have
// tenants before adding a single prospect). About 2–3 minutes in total.

const SLIDE_IN = FadeIn.duration(DURATION.toastIn).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);

export function OnboardingCard({ units, leadsCount, tenantsCount }: { units: any[]; leadsCount: number; tenantsCount: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { user, setUserProfile } = useAuth();
  const [tourOpen, setTourOpen] = useState(false);
  if (!user || user.onboarding_dismissed) return null;

  const tourSeen = !!user.onboarding_tour_seen;
  const steps = [
    { key: "unit", done: units.length > 0, title: t("Tambah unit pertama"), sub: t("Lalu share ke calon penyewa lewat WhatsApp."), cta: t("Tambah Unit"), go: () => router.push("/units?add=1" as any) },
    { key: "lead", done: leadsCount > 0, title: t("Tambah prospek pertama"), sub: t("Orang yang tanya unit. Bisa tempel chat WhatsApp-nya."), cta: t("Tambah Prospek"), go: () => router.push("/lead/new" as any) },
    { key: "tenant", done: tenantsCount > 0, title: t("Tambah tenant yang sudah ada"), sub: units.length ? t("Penyewa yang sudah jalan kontraknya. Pilih unitnya dari daftar.") : t("Tambah unit dulu, lalu tenant yang menempatinya."), cta: t("Tambah Tenant"), go: () => router.push("/tenants?add=1" as any) },
    { key: "tour", done: tourSeen, title: t("Lihat cara kerjanya"), sub: t("Viewing, kalender, follow-up, dan invoice. 1 menit."), cta: t("Lihat"), go: () => setTourOpen(true) },
  ];
  const doneCount = steps.filter((x) => x.done).length;

  const patch = async (body: Record<string, boolean>) => {
    try {
      const u = await api<any>("/me", { method: "PATCH", body });
      await setUserProfile({ ...user, ...u });
    } catch {
      await setUserProfile({ ...user, ...body });
    }
  };

  if (doneCount === steps.length) return null;

  return (
    <Card testID="onboarding-card" style={{ gap: spacing.md }}>
      <View style={s.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <RNText style={s.title}>{t("Mulai di SewAIn")}</RNText>
          <RNText style={s.progressText}>{t("{a} dari {b} selesai", { a: doneCount, b: steps.length })}</RNText>
        </View>
        <PressableScale onPress={() => patch({ onboarding_dismissed: true })} testID="onboarding-skip" style={s.skip}>
          <RNText style={s.skipText}>{t("Lewati")}</RNText>
        </PressableScale>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${(doneCount / steps.length) * 100}%` }]} />
      </View>
      <View style={{ gap: 4 }}>
        {steps.map((st) => (
          <View key={st.key} style={s.step} testID={`onboarding-step-${st.key}`}>
            <View style={[s.check, st.done && s.checkDone]}>
              {st.done ? <Icon name="check" size={14} color={colors.onBrandPrimary} strokeWidth={2.6} /> : null}
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <RNText style={[s.stepTitle, st.done && s.stepTitleDone]}>{st.title}</RNText>
              {!st.done ? <RNText style={s.stepSub}>{st.sub}</RNText> : null}
              {st.key === "unit" && st.done ? (
                <PressableScale role="link" onPress={() => Linking.openURL(waShareLink(unitShareMessage(units[0])))} testID="onboarding-share-unit">
                  <RNText style={s.inlineLink}>{t("Coba share unit {name} ›", { name: units[0].name })}</RNText>
                </PressableScale>
              ) : null}
            </View>
            {!st.done ? <Button title={st.cta} size="sm" variant={st.key === "tour" ? "ghost" : "secondary"} onPress={st.go} testID={`onboarding-go-${st.key}`} /> : null}
          </View>
        ))}
      </View>
      <TourSheet open={tourOpen} onClose={() => setTourOpen(false)} onFinish={() => { setTourOpen(false); patch({ onboarding_tour_seen: true }); }} />
    </Card>
  );
}

const SLIDES: { art: IllustrationName; title: string; body: string }[] = [
  {
    art: "leads",
    title: "Viewing langsung ke kalender",
    body: "Di kartu prospek, tekan Jadwalkan Viewing. Setelah Tambah ke Kalender, tombolnya jadi Undang Viewing: jadwal dan lokasi unit terkirim ke WhatsApp prospek.",
  },
  {
    art: "tenants",
    title: "Tenant: sekali ketuk",
    body: "Di halaman tenant ada Follow-up Extend saat kontrak mau habis, dan Kirim Invoice dengan rekening pribadi atau kantor.",
  },
  {
    art: "report",
    title: "Semua dari yang kamu catat",
    body: "To-do list untuk kendala unit, Laporan untuk pemasukan dan unit terlaris. Buka lewat menu ☰ di kiri atas.",
  },
];

function TourSheet({ open, onClose, onFinish }: { open: boolean; onClose: () => void; onFinish: () => void }) {
  const s = useStyles();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <Sheet visible={open} onClose={onClose} testID="tour-sheet">
      <View style={{ gap: spacing.lg }}>
        <Animated.View key={i} entering={SLIDE_IN} style={s.slide}>
          <Illustration name={slide.art} width={170} />
          <RNText style={s.slideTitle}>{t(slide.title)}</RNText>
          <RNText style={s.slideBody}>{t(slide.body)}</RNText>
        </Animated.View>
        <View style={s.dots}>
          {SLIDES.map((_, k) => <View key={k} style={[s.dot, k === i && s.dotActive]} />)}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {i > 0 ? <Button title={t("Kembali")} variant="ghost" onPress={() => setI(i - 1)} testID="tour-back" style={{ flex: 1 }} /> : null}
          <Button title={last ? t("Mengerti") : t("Lanjut")} onPress={() => (last ? (setI(0), onFinish()) : setI(i + 1))} testID="tour-next" style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { color: colors.onSurface, ...fonts.bold, fontSize: 19 },
  progressText: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14 },
  skip: { paddingVertical: 6, paddingHorizontal: 8 },
  skipText: { color: colors.muted, ...fonts.medium, fontSize: 14.5 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brandPrimary },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 15.5 },
  stepTitleDone: { color: colors.muted, textDecorationLine: "line-through" },
  stepSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 13.5, lineHeight: 18 },
  inlineLink: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 14, paddingVertical: 2 },
  slide: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm },
  slideTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 21, textAlign: "center", marginTop: spacing.sm },
  slideBody: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15.5, lineHeight: 23, textAlign: "center", maxWidth: 420 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.brandPrimary },
}));
