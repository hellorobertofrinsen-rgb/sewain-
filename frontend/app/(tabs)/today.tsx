import React, { useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";
import { LogoFull } from "@/src/components/Logo";
import { Sheet } from "@/src/components/Sheet";
import { FollowupSheet, ReminderSheet } from "@/src/components/ActionSheets";
import { Button, Card, EmptyState, ErrorBox, SectionTitle, Spinner, StatusPill, Field, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { dateTimeLabel, greeting, relTime, rupiah, rupiahShort, todayISO } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";

type QueueItem = any;
type TodayData = {
  name: string;
  is_demo: boolean;
  units: { total: number; terisi: number; kosong: number; reserved: number; maintenance: number };
  counts: { followups: number; viewings: number; unpaid_amount: number; unpaid_count: number; urgent: number; total: number };
  items: QueueItem[];
};

export default function TodayScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const scrollRef = useRef<ScrollView>(null);
  const queueY = useRef(0);
  const [followupLead, setFollowupLead] = useState<any>(null);
  const [remindPayment, setRemindPayment] = useState<any>(null);
  const [reschedule, setReschedule] = useState<any>(null);
  const [reschedDate, setReschedDate] = useState(todayISO(1));
  const [reschedTime, setReschedTime] = useState("14.00");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["today"],
    queryFn: () => api<TodayData>("/today"),
  });
  const { data: summaryData } = useQuery({
    queryKey: ["today-summary"],
    queryFn: () => api<{ summary: string }>("/today/summary"),
    staleTime: 1000 * 60 * 10,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["today"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["tenants"] });
    qc.invalidateQueries({ queryKey: ["maintenance"] });
    qc.invalidateQueries({ queryKey: ["units"] });
    qc.invalidateQueries({ queryKey: ["impact"] });
  };

  const confirmViewing = useMutation({
    mutationFn: (id: string) => api(`/viewings/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast("Viewing dikonfirmasi ✓");
    },
    onError: (e: any) => toast(e?.message || "Gagal konfirmasi", "error"),
  });
  const cancelViewing = useMutation({
    mutationFn: (id: string) => api(`/viewings/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast("Viewing dibatalkan");
    },
    onError: (e: any) => toast(e?.message || "Gagal membatalkan", "error"),
  });
  const reschedMutation = useMutation({
    mutationFn: (v: { id: string; date: string; time: string }) =>
      api(`/viewings/${v.id}/reschedule`, {
        method: "POST",
        body: { scheduled_at: `${v.date}T${v.time.replace(".", ":")}:00` },
      }),
    onSuccess: () => {
      invalidateAll();
      setReschedule(null);
      toast("Jadwal viewing diganti");
    },
    onError: (e: any) => toast(e?.message || "Gagal ganti jadwal", "error"),
  });
  const markPaid = useMutation({
    mutationFn: (id: string) => api(`/payments/${id}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast("Lunas ✓");
    },
    onError: (e: any) => toast(e?.message || "Gagal menandai lunas", "error"),
  });
  const startMaint = useMutation({
    mutationFn: (id: string) => api(`/maintenance/${id}/start`, { method: "POST" }),
    onSuccess: invalidateAll,
  });
  const resolveMaint = useMutation({
    mutationFn: (id: string) => api(`/maintenance/${id}/resolve`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast("Masalah ditandai selesai ✓");
    },
    onError: (e: any) => toast(e?.message || "Gagal menandai selesai", "error"),
  });

  if (isLoading) return <Spinner label="Menyiapkan hari ini…" />;
  if (error || !data) return <View style={s.page}><ErrorBox message={(error as any)?.message || "Gagal memuat."} onRetry={refetch} /></View>;

  const { counts, units, items } = data;

  const statCards = [
    { v: `${counts.followups}`, l: "Calon penyewa perlu di-follow-up", to: "/leads", testID: "stat-followups" },
    { v: `${counts.viewings}`, l: "Viewing perlu dikonfirmasi", to: "/leads", testID: "stat-viewings" },
    { v: rupiahShort(counts.unpaid_amount), l: "Pembayaran belum masuk", to: "/tenants", testID: "stat-unpaid" },
    { v: `${counts.urgent}`, l: "Komplain urgent", to: "/maintenance", testID: "stat-urgent" },
  ];

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottomChrome + spacing.xxxl }}
        showsVerticalScrollIndicator={false}
        testID="today-screen"
      >
        {/* sticky header */}
        <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
          <LogoFull size={22} bg={colors.surface} />
          <View style={{ flexDirection: "row", gap: 2 }}>
            {[
              { icon: "chat" as const, to: "/tanya", tid: "header-tanya-button" },
              { icon: "chart" as const, to: "/impact", tid: "header-impact-button" },
              { icon: "sliders" as const, to: "/settings", tid: "header-settings-button" },
            ].map((b) => (
              <Pressable key={b.tid} testID={b.tid} onPress={() => router.push(b.to as any)} style={s.iconBtn}>
                <Icon name={b.icon} size={20} color={colors.onSurfaceSecondary} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.content}>
          <RNText style={s.greeting}>
            {greeting()}, {data.name}
          </RNText>
          <RNText style={s.headline}>
            {counts.total > 0 ? `Ada ${counts.total} hal yang perlu diberesin.` : "Semua beres hari ini."}
          </RNText>
          {summaryData?.summary ? <RNText style={s.summary}>{summaryData.summary}</RNText> : null}

          {units.total === 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <RNText style={s.setupTitle}>Mulai dari unit pertamamu</RNText>
              <RNText style={s.setupSub}>Tambah properti & unit, atau biar Sewain baca chat WhatsApp kamu.</RNText>
              <Button title="Isi Unit & Properti" onPress={() => router.push("/setup")} testID="today-setup-button" style={{ marginTop: spacing.md }} />
            </Card>
          ) : (
            <>
              <View style={s.statGrid}>
                {statCards.map((c) => (
                  <Pressable key={c.testID} testID={c.testID} onPress={() => router.push(c.to as any)} style={({ pressed }) => [s.statCard, pressed && { opacity: 0.75 }]}>
                    <RNText style={s.statValue} numberOfLines={1}>{c.v}</RNText>
                    <RNText style={s.statLabel}>{c.l}</RNText>
                  </Pressable>
                ))}
              </View>

              {counts.total > 0 ? (
                <Button title="Beresin satu-satu" onPress={() => scrollRef.current?.scrollTo({ y: queueY.current - 8, animated: true })} testID="beresin-button" style={{ marginTop: spacing.md }} />
              ) : null}

              <Pressable testID="unit-summary-card" onPress={() => router.push("/units" as any)} style={({ pressed }) => [s.unitCard, pressed && { opacity: 0.8 }]}>
                <View style={{ flex: 1 }}>
                  <RNText style={s.unitCardTitle}>Unit</RNText>
                  <RNText style={s.unitCardSub}>
                    {units.total} total · {units.terisi} terisi · {units.kosong} kosong
                  </RNText>
                  <View style={s.barWrap}>
                    <View style={[s.barFill, { flex: Math.max(units.terisi, 0.15), backgroundColor: colors.success }]} />
                    <View style={[s.barFill, { flex: Math.max(units.kosong, 0.05), backgroundColor: colors.borderStrong }]} />
                    {units.reserved + units.maintenance > 0 ? (
                      <View style={[s.barFill, { flex: units.reserved + units.maintenance, backgroundColor: colors.warning }]} />
                    ) : null}
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            </>
          )}

          <View onLayout={(e) => (queueY.current = e.nativeEvent.layout.y + (insets.top || 0))} style={{ marginTop: spacing.xl, gap: spacing.md }}>
            {items.length > 0 ? <SectionTitle>Antrean hari ini</SectionTitle> : null}
            {items.map((item, idx) => (
              <Animated.View key={`${item.type}-${item.id}`} entering={FadeIn.duration(250).delay(Math.min(idx * 40, 300))} exiting={FadeOut.duration(250)}>
                {item.type === "followup" ? (
                  <Card testID={`queue-followup-${item.id}`}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>{item.name}</RNText>
                        <RNText style={s.itemSub}>
                          {item.subtitle}
                          {item.last_interaction_at ? ` · chat terakhir ${relTime(item.last_interaction_at)}` : ""}
                        </RNText>
                      </View>
                      <StatusPill label="Perlu follow-up" tone="warning" testID={`pill-followup-${item.id}`} />
                    </View>
                    {item.ai_note ? <RNText style={s.aiNote}>“{item.ai_note}”</RNText> : null}
                    {item.unit ? (
                      <RNText style={s.matchLine}>
                        Cocok: <RNText style={s.matchUnit}>{item.unit.name}</RNText> · {item.unit.unit_type} · {rupiahShort(item.unit.monthly_price)}/bln
                      </RNText>
                    ) : null}
                    <View style={s.actions}>
                      <Button title="Follow-up" size="sm" onPress={() => setFollowupLead({ id: item.lead_id, name: item.name, suggested_followup: item.suggested_followup, phone: item.phone })} testID={`followup-open-${item.id}`} />
                      <Button title="Detail" variant="ghost" size="sm" onPress={() => router.push(`/lead/${item.lead_id}` as any)} testID={`followup-detail-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "viewing" ? (
                  <Card testID={`queue-viewing-${item.id}`}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>{item.name}</RNText>
                        <RNText style={s.itemSub}>Unit {item.unit_name} · {dateTimeLabel(item.scheduled_at)}</RNText>
                      </View>
                      <StatusPill label={item.status === "menunggu" ? "Menunggu konfirmasi" : "Terjadwal"} tone={item.status === "menunggu" ? "warning" : "info"} testID={`pill-viewing-${item.id}`} />
                    </View>
                    <View style={s.actions}>
                      {item.status === "menunggu" ? (
                        <Button title="Konfirmasi" size="sm" onPress={() => confirmViewing.mutate(item.viewing_id)} testID={`viewing-confirm-${item.id}`} />
                      ) : null}
                      <Button title="Ganti Jadwal" variant="ghost" size="sm" onPress={() => { setReschedule(item); setReschedDate(todayISO(1)); setReschedTime("14.00"); }} testID={`viewing-reschedule-${item.id}`} />
                      <Button title="Batal" variant="ghost" size="sm" onPress={() => cancelViewing.mutate(item.viewing_id)} testID={`viewing-cancel-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "payment" ? (
                  <Card testID={`queue-payment-${item.id}`}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>{item.name} · {item.unit_name}</RNText>
                        <RNText style={s.itemSub}>
                          {rupiah(item.amount)} · jatuh tempo {item.due_date ? new Date(item.due_date + "T00:00:00").getDate() + " " + new Date(item.due_date + "T00:00:00").toLocaleDateString("id-ID", { month: "long" }) : "-"}
                          {item.days_late > 0 ? ` · terlambat ${item.days_late} hari` : ""}
                        </RNText>
                      </View>
                      <StatusPill label={item.days_late > 0 ? "TERLAMBAT" : "BELUM BAYAR"} tone="error" testID={`pill-payment-${item.id}`} />
                    </View>
                    <View style={s.actions}>
                      <Button title="Tandai Lunas" size="sm" onPress={() => markPaid.mutate(item.payment_id)} testID={`payment-paid-${item.id}`} />
                      <Button title="Ingatkan" variant="ghost" size="sm" onPress={() => setRemindPayment({ id: item.payment_id, name: item.name, unit_name: item.unit_name, amount: item.amount, due_date: item.due_date, phone: item.phone })} testID={`payment-remind-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "maintenance" ? (
                  <Card testID={`queue-maintenance-${item.id}`} style={item.urgent ? { borderColor: withAlpha(colors.error, 0.45) } : undefined}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>{item.unit_name ? `Unit ${item.unit_name}` : "Area umum"} · {item.category}</RNText>
                        <RNText style={s.itemSub}>{item.ai_summary || item.description}</RNText>
                      </View>
                      {item.urgent ? <StatusPill label="URGENT" tone="error" testID={`pill-urgent-${item.id}`} /> : null}
                    </View>
                    <View style={s.actions}>
                      {item.status === "baru" ? (
                        <Button title="Mulai Kerjakan" variant="ghost" size="sm" onPress={() => startMaint.mutate(item.maintenance_id)} testID={`maint-start-${item.id}`} />
                      ) : null}
                      <Button title="Tandai Selesai" size="sm" onPress={() => resolveMaint.mutate(item.maintenance_id)} testID={`maint-resolve-${item.id}`} />
                      <Button title="Detail" variant="ghost" size="sm" onPress={() => router.push("/maintenance")} testID={`maint-detail-${item.id}`} />
                    </View>
                  </Card>
                ) : null}
              </Animated.View>
            ))}

            {items.length === 0 ? (
              <EmptyState
                icon="check"
                title="Semua beres hari ini. Santai dulu."
                subtitle="Kalau ada chat calon penyewa baru, langsung saja analisis di sini."
                action={<Button title="Analisis Chat Baru" onPress={() => router.push("/import-chat")} testID="today-analyze-button" />}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>

      <FollowupSheet lead={followupLead} onClose={() => setFollowupLead(null)} />
      <ReminderSheet payment={remindPayment} onClose={() => setRemindPayment(null)} />
      <Sheet
        visible={!!reschedule}
        onClose={() => setReschedule(null)}
        title={`Ganti jadwal viewing ${reschedule?.name || ""}`}
        testID="reschedule-sheet"
      >
        <View style={{ gap: spacing.md }}>
          <Field label="Tanggal (YYYY-MM-DD)">
            <Input testID="reschedule-date-input" value={reschedDate} onChangeText={setReschedDate} placeholder={todayISO(1)} />
          </Field>
          <Field label="Jam (mis. 14.00)">
            <Input testID="reschedule-time-input" value={reschedTime} onChangeText={setReschedTime} placeholder="14.00" />
          </Field>
          <Button title="Simpan Jadwal" onPress={() => reschedMutation.mutate({ id: reschedule.viewing_id, date: reschedDate, time: reschedTime })} testID="reschedule-save-button" />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  page: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg, justifyContent: "center" },
  header: {
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  greeting: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 15 },
  headline: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.4, lineHeight: 32 },
  summary: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, marginTop: 2 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    minHeight: 88,
  },
  statValue: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.3 },
  statLabel: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  unitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  unitCardTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  unitCardSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
  barWrap: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", gap: 2, marginTop: spacing.sm },
  barFill: { borderRadius: 3 },
  setupTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  setupSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 4 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  itemTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15.5 },
  itemSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  aiNote: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontStyle: "italic", fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  matchLine: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: spacing.sm },
  matchUnit: { color: colors.onSurface, fontFamily: fonts.semibold },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
}));
