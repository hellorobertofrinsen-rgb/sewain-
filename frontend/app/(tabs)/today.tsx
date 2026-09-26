import React, { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text as RNText, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";
import { LogoFull } from "@/src/components/Logo";
import { Sheet } from "@/src/components/Sheet";
import { DateInput } from "@/src/components/DateInput";
import { FollowupSheet, FollowupTarget, LeaseSheet, LeaseTarget, ReminderSheet, ReminderTarget } from "@/src/components/ActionSheets";
import { Button, Card, EmptyState, ErrorBox, Field, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { dateLabel, dateTimeLabel, greeting, leaseLeftLabel, rupiah, rupiahShort, todayISO } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";

type QueueItem = any;
type TodayData = {
  name: string;
  is_demo: boolean;
  units: { total: number; terisi: number; kosong: number; reserved: number; maintenance: number };
  counts: { followups: number; viewings: number; unpaid_amount: number; unpaid_count: number; leases: number; issues: number; urgent: number; total: number };
  items: QueueItem[];
};

/** One calm sentence summarising the queue — computed locally, no AI call. */
function summaryLine(c: TodayData["counts"]): string {
  const parts = [
    c.followups ? `${c.followups} follow-up` : null,
    c.viewings ? `${c.viewings} viewing` : null,
    c.unpaid_count ? `${c.unpaid_count} tagihan (${rupiahShort(c.unpaid_amount)})` : null,
    c.leases ? `${c.leases} kontrak mau habis` : null,
    c.issues ? `${c.issues} masalah${c.urgent ? ` (${c.urgent} urgent)` : ""}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function TodayScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const { plan, showUpgrade } = usePlan();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { width } = useWindowDimensions();
  const hasSidebar = Platform.OS === "web" && width >= 1024; // desktop: logo + settings live in the sidebar
  const scrollRef = useRef<ScrollView>(null);
  const queueY = useRef(0);
  const [followupLead, setFollowupLead] = useState<FollowupTarget | null>(null);
  const [remindPayment, setRemindPayment] = useState<ReminderTarget | null>(null);
  const [lease, setLease] = useState<LeaseTarget | null>(null);
  const [reschedule, setReschedule] = useState<any>(null);
  const [reschedDate, setReschedDate] = useState(todayISO(1));
  const [reschedTime, setReschedTime] = useState("14:00");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["today"],
    queryFn: () => api<TodayData>("/today"),
  });

  const invalidateAll = () => {
    for (const key of ["today", "leads", "lead", "tenants", "maintenance", "units", "plan"]) qc.invalidateQueries({ queryKey: [key] });
  };

  const act = (fn: (v: any) => Promise<any>, ok: string) =>
    ({
      mutationFn: fn,
      onSuccess: () => {
        invalidateAll();
        if (ok) toast(ok);
      },
      onError: (e: any) => toast(e?.message || "Gagal. Coba lagi.", "error"),
    });

  const confirmViewing = useMutation(act((id: string) => api(`/viewings/${id}/confirm`, { method: "POST" }), "Viewing dikonfirmasi ✓"));
  const cancelViewing = useMutation(act((id: string) => api(`/viewings/${id}/cancel`, { method: "POST" }), "Viewing dibatalkan"));
  const viewingNotYet = useMutation(
    act((id: string) => api(`/viewings/${id}/complete`, { method: "POST", body: { next: "followup" } }), "Dicatat — follow-up lagi 3 hari ke depan"),
  );
  const reschedMutation = useMutation({
    ...act((v: { id: string; date: string; time: string }) =>
      api(`/viewings/${v.id}/reschedule`, { method: "POST", body: { scheduled_at: `${v.date}T${v.time}:00` } }), "Jadwal viewing diganti"),
    onSettled: () => setReschedule(null),
  });
  const markPaid = useMutation(act((id: string) => api(`/payments/${id}/mark-paid`, { method: "POST" }), "Lunas ✓"));
  const startMaint = useMutation(act((id: string) => api(`/maintenance/${id}/start`, { method: "POST" }), ""));
  const resolveMaint = useMutation(act((id: string) => api(`/maintenance/${id}/resolve`, { method: "POST" }), "Masalah ditandai selesai ✓"));

  const toNegotiation = async (item: QueueItem) => {
    try {
      await api(`/viewings/${item.viewing_id}/complete`, { method: "POST", body: { next: "negotiation" } });
      invalidateAll();
      router.push(`/lead/${item.lead_id}?open=negotiation` as any);
    } catch (e: any) {
      toast(e?.message || "Gagal. Coba lagi.", "error");
    }
  };

  if (isLoading) return <Spinner label="Menyiapkan hari ini…" />;
  if (error || !data) return <View style={s.page}><ErrorBox message={(error as any)?.message || "Gagal memuat."} onRetry={refetch} /></View>;

  const { counts, units, items } = data;
  const statCards = [
    { v: `${counts.followups}`, l: "Perlu di-follow-up", to: "/leads", testID: "stat-followups" },
    { v: `${counts.viewings}`, l: "Viewing", to: "/leads", testID: "stat-viewings" },
    { v: rupiahShort(counts.unpaid_amount), l: "Tagihan belum masuk", to: "/tenants", testID: "stat-unpaid" },
    { v: `${counts.leases}`, l: "Kontrak habis ≤ 30 hari", to: "/tenants", testID: "stat-leases" },
  ];

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottomChrome + spacing.xxxl }}
        showsVerticalScrollIndicator={false}
        testID="today-screen"
      >
        {hasSidebar ? (
          <View style={{ height: spacing.xl }} />
        ) : (
          <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
            <LogoFull size={22} bg={colors.surface} />
            <Pressable testID="header-settings-button" onPress={() => router.push("/settings")} style={s.iconBtn} accessibilityLabel="Pengaturan">
              <Icon name="sliders" size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>
        )}

        <View style={s.content}>
          <RNText style={s.greeting}>
            {greeting()}, {data.name}
          </RNText>
          <RNText style={s.headline}>
            {counts.total > 0 ? `Ada ${counts.total} hal yang perlu diberesin.` : "Semua beres hari ini."}
          </RNText>
          {counts.total > 0 ? <RNText style={s.summary}>{summaryLine(counts)}</RNText> : null}

          {plan && plan.hidden_units > 0 ? (
            <Pressable testID="hidden-units-banner" onPress={() => showUpgrade("hidden_units")} style={({ pressed }) => [s.banner, pressed && { opacity: 0.8 }]}>
              <Icon name="alert" size={16} color={colors.warning} />
              <RNText style={s.bannerText}>
                {plan.hidden_units} unit disembunyikan karena paket Free. Upgrade untuk menampilkannya lagi.
              </RNText>
            </Pressable>
          ) : null}

          {units.total === 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <RNText style={s.setupTitle}>Mulai dari unit pertamamu</RNText>
              <RNText style={s.setupSub}>Catat unit yang kamu pasarkan, lalu calon penyewanya. Sewain yang ingatkan siapa harus di-follow-up.</RNText>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                <Button title="Tambah Unit" onPress={() => router.push("/setup")} testID="today-setup-button" />
                <Button title="Tambah Calon Penyewa" variant="ghost" onPress={() => router.push("/lead/new" as any)} testID="today-new-lead-button" />
              </View>
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

              {counts.total > 2 ? (
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
                          {[item.unit_type, item.budget_max ? `Budget ${rupiahShort(item.budget_max)}` : null].filter(Boolean).join(" · ") || "Calon penyewa"}
                        </RNText>
                      </View>
                      <StatusPill label={item.status === "negotiation" ? "Negosiasi" : "Follow-up"} tone="warning" testID={`pill-followup-${item.id}`} />
                    </View>
                    <RNText style={s.reason}>{item.reason}</RNText>
                    {item.note ? <RNText style={s.note} numberOfLines={2}>{item.note}</RNText> : null}
                    {item.unit ? (
                      <RNText style={s.matchLine}>
                        Cocok: <RNText style={s.matchUnit}>{item.unit.name}</RNText> · {item.unit.unit_type} · {rupiahShort(item.unit.monthly_price)}/bln
                      </RNText>
                    ) : null}
                    <View style={s.actions}>
                      <Button title="Follow-up" size="sm" icon="send" onPress={() => setFollowupLead({ ...item, id: item.lead_id })} testID={`followup-open-${item.id}`} />
                      <Button title="Detail" variant="ghost" size="sm" onPress={() => router.push(`/lead/${item.lead_id}` as any)} testID={`followup-detail-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "viewing" ? (
                  <Card testID={`queue-viewing-${item.id}`}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>Viewing {item.name}</RNText>
                        <RNText style={s.itemSub}>Unit {item.unit_name} · {dateTimeLabel(item.scheduled_at)}</RNText>
                      </View>
                      <StatusPill label={item.status === "menunggu" ? "Belum dikonfirmasi" : "Terjadwal"} tone={item.status === "menunggu" ? "warning" : "info"} testID={`pill-viewing-${item.id}`} />
                    </View>
                    <View style={s.actions}>
                      {item.status === "menunggu" ? (
                        <Button title="Konfirmasi" size="sm" onPress={() => confirmViewing.mutate(item.viewing_id)} testID={`viewing-confirm-${item.id}`} />
                      ) : null}
                      <Button title="Ganti Jadwal" variant="ghost" size="sm" onPress={() => { setReschedule(item); setReschedDate(todayISO(1)); setReschedTime("14:00"); }} testID={`viewing-reschedule-${item.id}`} />
                      <Button title="Batal" variant="ghost" size="sm" onPress={() => cancelViewing.mutate(item.viewing_id)} testID={`viewing-cancel-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "viewing_result" ? (
                  <Card testID={`queue-viewing-result-${item.id}`} style={{ borderColor: withAlpha(colors.info, 0.4) }}>
                    <RNText style={s.itemTitle}>Gimana hasil viewing {item.name}?</RNText>
                    <RNText style={s.itemSub}>Unit {item.unit_name} · {dateTimeLabel(item.scheduled_at)}</RNText>
                    <View style={s.actions}>
                      <Button title="Lanjut Negosiasi" size="sm" onPress={() => toNegotiation(item)} testID={`viewing-nego-${item.id}`} />
                      <Button title="Belum cocok" variant="ghost" size="sm" onPress={() => viewingNotYet.mutate(item.viewing_id)} testID={`viewing-notyet-${item.id}`} />
                      <Button title="Detail" variant="ghost" size="sm" onPress={() => router.push(`/lead/${item.lead_id}` as any)} testID={`viewing-detail-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "payment" ? (
                  <Card testID={`queue-payment-${item.id}`}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>{item.name} · {item.unit_name}</RNText>
                        <RNText style={s.itemSub}>
                          {rupiah(item.amount)} · jatuh tempo {dateLabel(item.due_date + "T00:00:00")}
                        </RNText>
                      </View>
                      <StatusPill label={item.days_late > 0 ? `TELAT ${item.days_late} HARI` : "BELUM BAYAR"} tone="error" testID={`pill-payment-${item.id}`} />
                    </View>
                    <View style={s.actions}>
                      <Button title="Tandai Lunas" size="sm" onPress={() => markPaid.mutate(item.payment_id)} testID={`payment-paid-${item.id}`} />
                      <Button title="Ingatkan" variant="ghost" size="sm" onPress={() => setRemindPayment({ ...item, id: item.payment_id })} testID={`payment-remind-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "lease" ? (
                  <Card testID={`queue-lease-${item.id}`}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>{item.name} · {item.unit_name}</RNText>
                        <RNText style={s.itemSub}>Kontrak sampai {dateLabel(item.end_date + "T00:00:00")}</RNText>
                      </View>
                      <StatusPill label={leaseLeftLabel(item.days_left)} tone={item.days_left <= 7 ? "error" : "warning"} testID={`pill-lease-${item.id}`} />
                    </View>
                    <View style={s.actions}>
                      <Button title="Perpanjang / Kabari" size="sm" onPress={() => setLease({ ...item, id: item.tenant_id })} testID={`lease-open-${item.id}`} />
                      <Button title="Detail" variant="ghost" size="sm" onPress={() => router.push(`/tenant/${item.tenant_id}` as any)} testID={`lease-detail-${item.id}`} />
                    </View>
                  </Card>
                ) : null}

                {item.type === "maintenance" ? (
                  <Card testID={`queue-maintenance-${item.id}`} style={item.urgent ? { borderColor: withAlpha(colors.error, 0.45) } : undefined}>
                    <View style={s.cardHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={s.itemTitle}>{item.unit_name ? `Unit ${item.unit_name}` : "Area umum"} · {item.category}</RNText>
                        <RNText style={s.itemSub}>{item.description}</RNText>
                      </View>
                      {item.urgent ? <StatusPill label="URGENT" tone="error" testID={`pill-urgent-${item.id}`} /> : null}
                    </View>
                    <View style={s.actions}>
                      {item.status === "baru" ? (
                        <Button title="Mulai Kerjakan" variant="ghost" size="sm" onPress={() => startMaint.mutate(item.maintenance_id)} testID={`maint-start-${item.id}`} />
                      ) : null}
                      <Button title="Tandai Selesai" size="sm" onPress={() => resolveMaint.mutate(item.maintenance_id)} testID={`maint-resolve-${item.id}`} />
                    </View>
                  </Card>
                ) : null}
              </Animated.View>
            ))}

            {items.length === 0 && units.total > 0 ? (
              <EmptyState
                icon="check"
                title="Semua beres hari ini. Santai dulu."
                subtitle="Ada calon penyewa baru? Catat sekarang supaya Sewain bisa ingatkan follow-up-nya."
                action={<Button title="Tambah Calon Penyewa" onPress={() => router.push("/lead/new" as any)} testID="today-empty-new-lead" />}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>

      <FollowupSheet lead={followupLead} onClose={() => setFollowupLead(null)} />
      <ReminderSheet payment={remindPayment} onClose={() => setRemindPayment(null)} />
      <LeaseSheet tenant={lease} onClose={() => setLease(null)} />
      <Sheet visible={!!reschedule} onClose={() => setReschedule(null)} title={`Ganti jadwal viewing ${reschedule?.name || ""}`} testID="reschedule-sheet">
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Tanggal">
                <DateInput testID="reschedule-date-input" value={reschedDate} onChange={setReschedDate} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Jam">
                <DateInput mode="time" testID="reschedule-time-input" value={reschedTime} onChange={setReschedTime} />
              </Field>
            </View>
          </View>
          <Button title="Simpan Jadwal" onPress={() => reschedMutation.mutate({ id: reschedule.viewing_id, date: reschedDate, time: reschedTime })} loading={reschedMutation.isPending} testID="reschedule-save-button" />
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm, maxWidth: 760, width: "100%", alignSelf: "center" },
  greeting: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 15 },
  headline: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.4, lineHeight: 32 },
  summary: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, marginTop: 2 },
  banner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.4), backgroundColor: withAlpha(colors.warning, 0.08),
  },
  bannerText: { color: colors.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 13, flex: 1, lineHeight: 18 },
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
    minHeight: 80,
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
  itemSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  reason: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12.5, marginTop: spacing.sm },
  note: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 4 },
  matchLine: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: spacing.sm },
  matchUnit: { color: colors.onSurface, fontFamily: fonts.semibold },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
}));
