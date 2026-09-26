import React from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Card, ErrorBox, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { relTime } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";

const ICON_FOR: Record<string, { icon: any; label: string }> = {
  leads_analyzed: { icon: "users", label: "CALON PENYEWA DIANALISIS" },
  followups_found: { icon: "chat", label: "FOLLOW-UP YANG DITEMUKAN" },
  viewings_scheduled: { icon: "calendar-check", label: "VIEWING YANG DIJADWALKAN" },
  payments_reminded: { icon: "wallet", label: "PEMBAYARAN YANG DIINGATKAN" },
  maintenance_resolved: { icon: "wrench", label: "MASALAH YANG DITANGANI" },
};

export default function ImpactScreen() {
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["impact"],
    queryFn: () => api<any>("/impact"),
  });

  return (
    <View style={s.root}>
      <ScreenHeader title="Impact" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false} testID="impact-screen">
        {isLoading ? (
          <Spinner label="Menghitung impact…" />
        ) : error ? (
          <ErrorBox message={(error as any)?.message} onRetry={refetch} />
        ) : (
          <>
            {data.is_demo ? (
              <Card style={{ borderColor: withAlpha(colors.warning, 0.4) }} testID="demo-notice-card">
                <RNText style={s.demoNote}>
                  Kamu sedang pakai akun demo. Angka di bawah hanya dihitung dari aktivitas yang benar-benar kamu lakukan di sesi ini — data contoh bawaan tidak dihitung.
                </RNText>
              </Card>
            ) : null}

            <View style={s.grid}>
              {Object.entries(ICON_FOR).map(([key, meta]) => (
                <Card key={key} style={s.metricCard} testID={`impact-${key}`}>
                  <RNText style={s.metricLabel}>{meta.label}</RNText>
                  <RNText style={s.metricValue}>{data.counts[key] ?? 0}</RNText>
                </Card>
              ))}
              <Card style={[s.metricCard, s.timeCard]} testID="impact-minutes-saved">
                <RNText style={s.timeLabel}>ESTIMASI WAKTU ADMIN HEMAT</RNText>
                <RNText style={s.metricValue}>{data.minutes_saved} menit</RNText>
              </Card>
            </View>

            <Card testID="before-after-card">
              <RNText style={s.sectionKicker}>Sebelum / sesudah</RNText>
              <View style={s.baRow}>
                <View style={{ flex: 1 }}>
                  <RNText style={s.baValue}>{data.messages_read}</RNText>
                  <RNText style={s.baLabel}>chat perlu dibuka manual sebelum Sewain</RNText>
                </View>
                <RNText style={s.baArrow}>↓</RNText>
                <View style={{ flex: 1 }}>
                  <RNText style={[s.baValue, { color: colors.success }]}>{data.tasks_now}</RNText>
                  <RNText style={s.baLabel}>hal yang benar-benar perlu tindakan sekarang</RNText>
                </View>
              </View>
              <RNText style={s.formulaNote}>
                Dihitung dari pesan yang dianalisis AI vs antrean aktif hari ini. Estimasi waktu hemat: 2 menit per calon penyewa, 3 per follow-up, 10 per viewing, 3 per pengingat, 10 per masalah.
              </RNText>
            </Card>

            <View style={{ gap: spacing.md }}>
              <SectionTitle>Log aktivitas</SectionTitle>
              {data.activities?.length ? (
                data.activities.map((a: any) => (
                  <View key={a.id} style={s.feedRow} testID={`activity-${a.id}`}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <RNText style={s.feedTitle}>{a.title}</RNText>
                      <RNText style={s.feedTime}>{relTime(a.created_at)}</RNText>
                    </View>
                    {a.origin === "seed" ? <StatusPill label="contoh" tone="neutral" testID={`activity-seed-${a.id}`} /> : null}
                  </View>
                ))
              ) : (
                <RNText style={s.feedEmpty}>Belum ada aktivitas. Semua aksi kamu di Sewain tercatat di sini — bisa dilacak.</RNText>
              )}
            </View>

            <Card testID="about-sewain-card">
              <RNText style={s.sectionKicker}>Tentang Sewain</RNText>
              <RNText style={s.aboutTitle}>Masalahnya</RNText>
              <RNText style={s.aboutBody}>
                Bisnis sewa properti di Indonesia sering berjalan lewat chat yang menumpuk: pertanyaan calon penyewa hilang, follow-up kelupaan, viewing dikoordinasi manual, penagihan dan komplain bercampur di satu inbox.
              </RNText>
              <RNText style={s.aboutTitle}>Solusinya</RNText>
              <RNText style={s.aboutBody}>
                Sewain mengubah percakapan jadi tindakan terstruktur. AI membaca apa yang terjadi dan memberitahu admin apa yang harus dikerjakan berikutnya — dari unit kosong sampai tagihan yang belum masuk.
              </RNText>
              <RNText style={s.aboutTitle}>Skalanya</RNText>
              <RNText style={s.aboutBody}>
                Alur yang sama bekerja untuk 10 unit apartemen, 100 kamar kos, sampai 1.000 unit yang dikelola profesional — satu akun bisa punya banyak properti, unit, tenant, dan pengelola.
              </RNText>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metricCard: { flexBasis: "47%", flexGrow: 1, gap: 8 },
  metricLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 10.5, letterSpacing: 0.8, lineHeight: 14 },
  metricValue: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 28, letterSpacing: -0.5 },
  timeCard: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  timeLabel: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.8, opacity: 0.6 },
  sectionKicker: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.sm },
  baRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  baValue: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 30, letterSpacing: -0.5 },
  baLabel: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  baArrow: { color: colors.muted, fontFamily: fonts.bold, fontSize: 22 },
  formulaNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, marginTop: spacing.md },
  feedRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider },
  feedTitle: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  feedTime: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
  feedEmpty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  demoNote: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  aboutTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 14, marginTop: spacing.md },
  aboutBody: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 4 },
}));
