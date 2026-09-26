import React, { useRef, useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import Animated, { FadeOut, Keyframe, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, IconName } from "@/src/components/Icon";
import { Illustration } from "@/src/components/Illustration";
import { useIsWide } from "@/src/lib/layout";
import { LogoFull } from "@/src/components/Logo";
import { Sheet } from "@/src/components/Sheet";
import { DateInput } from "@/src/components/DateInput";
import { FollowupSheet, FollowupTarget, LeaseSheet, LeaseTarget, ReminderSheet, ReminderTarget } from "@/src/components/ActionSheets";
import { Button, Card, ErrorBox, Field, IconCircle, SectionTitle, Spinner, StatusPill, PressableScale, Tone } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { dateTimeLabel, greeting, leaseLeftLabel, rupiah, rupiahShort, todayISO, shortDay } from "@/src/lib/format";
import { cardShadow, fonts, largeTitle, makeStyles, spacing, useTheme, withAlpha } from "@/src/theme";
import { DURATION, EASE_IN_OUT, EASE_OUT } from "@/src/motion";

// Hari Ini is opened many times a day, so the queue does NOT animate in (it should
// simply be there). When an item is finished it fades out and the rest glide up to
// close the gap — that prevents a jarring jump, which is worth animating.
// The fade is opacity-only, so it stays under reduced motion; the reflow (movement) doesn't.
const ITEM_EXIT = FadeOut.duration(180).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);
const ITEM_REFLOW = LinearTransition.duration(DURATION.reflow).easing(EASE_IN_OUT);
// Small reward for clearing the last item (only then — never on a normal visit).
const ALL_DONE = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.88 }, { translateY: 8 }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }], easing: EASE_OUT },
}).duration(420);

const QUEUE_ICON: Record<string, { icon: IconName; tone: Tone }> = {
  followup: { icon: "message", tone: "brand" },
  viewing: { icon: "calendar-check", tone: "info" },
  viewing_result: { icon: "eye", tone: "info" },
  payment: { icon: "wallet", tone: "error" },
  lease: { icon: "key", tone: "warning" },
  maintenance: { icon: "wrench", tone: "warning" },
};

type Stats = { speed: { median_minutes: number | null; waiting: number }; leads: { cold_count: number }; retention: { rate: number | null } };

function minutesLabel(m: number | null | undefined) {
  if (m == null) return "-";
  if (m < 60) return `${m} mnt`;
  if (m < 60 * 24) return `${Math.round(m / 60)} jam`;
  return `${Math.round(m / 60 / 24)} hari`;
}

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
  const hasSidebar = useIsWide(); // desktop: logo + settings live in the sidebar
  // Clearing the last item earns a small moment; a normal visit to an empty queue doesn't.
  const [lastTotal, setLastTotal] = useState<number | null>(null);
  const [justFinished, setJustFinished] = useState(false);
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
  const { data: stats } = useQuery({ queryKey: ["stats", 30], queryFn: () => api<Stats>("/stats?days=30"), staleTime: 60_000 });

  const invalidateAll = () => {
    for (const key of ["today", "leads", "lead", "tenants", "maintenance", "units", "plan", "stats"]) qc.invalidateQueries({ queryKey: [key] });
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

  if (data && data.counts.total !== lastTotal) {
    setJustFinished(lastTotal != null && lastTotal > 0 && data.counts.total === 0);
    setLastTotal(data.counts.total);
  }

  if (isLoading) return <Spinner label="Menyiapkan hari ini…" />;
  if (error || !data) return <View style={s.page}><ErrorBox message={(error as any)?.message || "Gagal memuat."} onRetry={refetch} /></View>;

  const { counts, units, items } = data;
  const statCards: { v: string; l: string; to: string; testID: string; icon: IconName; tone: Tone }[] = [
    { v: `${counts.followups}`, l: "Perlu dibalas", to: "/leads", testID: "stat-followups", icon: "message", tone: "brand" },
    { v: `${counts.viewings}`, l: "Viewing", to: "/leads", testID: "stat-viewings", icon: "calendar-check", tone: "info" },
    { v: rupiahShort(counts.unpaid_amount), l: "Tagihan belum masuk", to: "/tenants", testID: "stat-unpaid", icon: "wallet", tone: "error" },
    { v: `${counts.leases}`, l: "Kontrak habis ≤ 30 hr", to: "/tenants", testID: "stat-leases", icon: "key", tone: "warning" },
  ];

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        showsVerticalScrollIndicator={false}
        testID="today-screen"
      >
        {hasSidebar ? (
          <View style={{ height: spacing.xl }} />
        ) : (
          <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
            <LogoFull size={24} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <PressableScale testID="header-report-button" onPress={() => router.push("/laporan" as any)} style={s.iconBtn} accessibilityLabel="Laporan">
                <Icon name="chart" size={20} color={colors.onSurface} />
              </PressableScale>
              <PressableScale testID="header-settings-button" onPress={() => router.push("/settings")} style={s.iconBtn} accessibilityLabel="Pengaturan">
                <Icon name="sliders" size={20} color={colors.onSurface} />
              </PressableScale>
            </View>
          </View>
        )}

        <View style={s.content}>
          <View style={{ gap: 6 }}>
            <RNText style={s.greeting}>
              {greeting()}, {data.name}
            </RNText>
            <RNText style={s.headline} accessibilityRole="header">
              {counts.total > 0 ? `${counts.total} hal perlu diberesin` : "Semua beres"}
            </RNText>
            {counts.total > 0 ? <RNText style={s.summary}>{summaryLine(counts)}</RNText> : null}
          </View>

          {plan && plan.hidden_units > 0 ? (
            <PressableScale soft testID="hidden-units-banner" onPress={() => showUpgrade("hidden_units")} style={s.banner}>
              <IconCircle icon="lock" tone="warning" size={36} />
              <RNText style={s.bannerText}>
                {plan.hidden_units} unit disembunyikan karena paket Free. Upgrade untuk menampilkannya lagi.
              </RNText>
            </PressableScale>
          ) : null}

          {units.total === 0 ? (
            <Card style={s.setupCard}>
              <Illustration name="welcome" width={180} />
              <RNText style={s.setupTitle}>Mulai dari unit pertamamu</RNText>
              <RNText style={s.setupSub}>Catat unit yang kamu pasarkan, lalu prospeknya. Sewain yang ingatkan siapa harus dibalas.</RNText>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap", justifyContent: "center" }}>
                <Button title="Tambah Unit" icon="plus" onPress={() => router.push("/setup")} testID="today-setup-button" />
                <Button title="Tambah Prospek" variant="ghost" onPress={() => router.push("/lead/new" as any)} testID="today-new-lead-button" />
              </View>
            </Card>
          ) : (
            <>
              <View style={s.statGrid}>
                {statCards.map((c) => (
                  <PressableScale soft key={c.testID} testID={c.testID} onPress={() => router.push(c.to as any)} style={[s.statCard, hasSidebar && s.statCardWide]}>
                    <IconCircle icon={c.icon} tone={c.tone} size={36} />
                    <RNText style={s.statValue} numberOfLines={1}>{c.v}</RNText>
                    <RNText style={s.statLabel}>{c.l}</RNText>
                  </PressableScale>
                ))}
              </View>

              {counts.total > 2 ? (
                <Button title="Beresin satu-satu" icon="arrow-right" onPress={() => scrollRef.current?.scrollTo({ y: queueY.current - 8, animated: true })} testID="beresin-button" />
              ) : null}

              {stats ? (
                <PressableScale soft testID="report-summary-card" onPress={() => router.push("/laporan" as any)} style={s.rowCard}>
                  <IconCircle icon="trending-up" tone="success" size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <RNText style={s.rowCardTitle}>Laporan 30 hari</RNText>
                    <RNText style={s.rowCardSub}>
                      Balas {minutesLabel(stats.speed.median_minutes)} · {stats.leads.cold_count} prospek mulai dingin
                      {stats.retention.rate != null ? ` · retensi ${stats.retention.rate}%` : ""}
                    </RNText>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </PressableScale>
              ) : null}

              <PressableScale soft testID="unit-summary-card" onPress={() => router.push("/units" as any)} style={s.rowCard}>
                <IconCircle icon="building" tone="info" size={44} />
                <View style={{ flex: 1 }}>
                  <RNText style={s.rowCardTitle}>{units.total} unit</RNText>
                  <RNText style={s.rowCardSub}>
                    {units.terisi} terisi · {units.kosong} kosong{units.reserved + units.maintenance > 0 ? ` · ${units.reserved + units.maintenance} lainnya` : ""}
                  </RNText>
                  <View style={s.barWrap}>
                    <View style={[s.barFill, { flex: Math.max(units.terisi, 0.15), backgroundColor: colors.success }]} />
                    <View style={[s.barFill, { flex: Math.max(units.kosong, 0.05), backgroundColor: colors.borderStrong }]} />
                    {units.reserved + units.maintenance > 0 ? (
                      <View style={[s.barFill, { flex: units.reserved + units.maintenance, backgroundColor: "#E8A33D" }]} />
                    ) : null}
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color={colors.muted} />
              </PressableScale>
            </>
          )}

          <View onLayout={(e) => (queueY.current = e.nativeEvent.layout.y + (insets.top || 0))} style={{ marginTop: spacing.md, gap: spacing.md }}>
            {items.length > 0 ? <SectionTitle>Antrean hari ini</SectionTitle> : null}
            {items.map((item) => {
              const qi = QUEUE_ICON[item.type] ?? QUEUE_ICON.followup;
              return (
                <Animated.View key={`${item.type}-${item.id}`} exiting={ITEM_EXIT} layout={ITEM_REFLOW}>
                  {item.type === "followup" ? (
                    <Card testID={`queue-followup-${item.id}`} style={item.is_new ? s.newCard : undefined}>
                      <View style={s.cardHead}>
                        <IconCircle icon={qi.icon} tone={qi.tone} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <RNText style={s.itemTitle}>{item.name}</RNText>
                          <RNText style={s.itemSub}>
                            {[item.unit_type, item.budget_max ? `Budget ${rupiahShort(item.budget_max)}` : null].filter(Boolean).join(" · ") || "Prospek"}
                          </RNText>
                        </View>
                        <StatusPill label={item.is_new ? "Baru" : item.status === "negotiation" ? "Negosiasi" : "Follow-up"} tone={item.is_new ? "brand" : "warning"} testID={`pill-followup-${item.id}`} />
                      </View>
                      <RNText style={[s.reason, item.is_new && { color: colors.brandPrimary }]}>{item.reason}</RNText>
                      {item.note ? <RNText style={s.note} numberOfLines={2}>{item.note}</RNText> : null}
                      {item.unit ? (
                        <RNText style={s.matchLine}>
                          Cocok: <RNText style={s.matchUnit}>{item.unit.name}</RNText> · {item.unit.unit_type} · {rupiahShort(item.unit.monthly_price)}/bln
                        </RNText>
                      ) : null}
                      <View style={s.actions}>
                        <Button title={item.is_new ? "Balas sekarang" : "Follow-up"} size="sm" icon="send" onPress={() => setFollowupLead({ ...item, id: item.lead_id })} testID={`followup-open-${item.id}`} />
                        <Button title="Detail" variant="ghost" size="sm" onPress={() => router.push(`/lead/${item.lead_id}` as any)} testID={`followup-detail-${item.id}`} />
                      </View>
                    </Card>
                  ) : null}

                  {item.type === "viewing" ? (
                    <Card testID={`queue-viewing-${item.id}`}>
                      <View style={s.cardHead}>
                        <IconCircle icon={qi.icon} tone={qi.tone} />
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
                    <Card testID={`queue-viewing-result-${item.id}`}>
                      <View style={s.cardHead}>
                        <IconCircle icon={qi.icon} tone={qi.tone} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <RNText style={s.itemTitle}>Gimana hasil viewing {item.name}?</RNText>
                          <RNText style={s.itemSub}>Unit {item.unit_name} · {dateTimeLabel(item.scheduled_at)}</RNText>
                        </View>
                      </View>
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
                        <IconCircle icon={qi.icon} tone={qi.tone} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <RNText style={s.itemTitle}>{item.name} · {item.unit_name}</RNText>
                          <RNText style={s.itemSub}>
                            {rupiah(item.amount)}{item.months > 1 ? ` (${item.months} bulan)` : ""} · tempo {shortDay(item.due_date + "T00:00:00")}
                          </RNText>
                        </View>
                        <StatusPill label={item.days_late > 0 ? `Telat ${item.days_late} hari` : "Belum bayar"} tone="error" testID={`pill-payment-${item.id}`} />
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
                        <IconCircle icon={qi.icon} tone={qi.tone} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <RNText style={s.itemTitle}>{item.name} · {item.unit_name}</RNText>
                          <RNText style={s.itemSub}>Kontrak sampai {shortDay(item.end_date + "T00:00:00")}</RNText>
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
                    <Card testID={`queue-maintenance-${item.id}`} style={item.urgent ? s.urgentCard : undefined}>
                      <View style={s.cardHead}>
                        <IconCircle icon="wrench" tone={item.urgent ? "error" : "warning"} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <RNText style={s.itemTitle}>{item.unit_name ? `Unit ${item.unit_name}` : "Area umum"} · {item.category}</RNText>
                          <RNText style={s.itemSub}>{item.description}</RNText>
                        </View>
                        {item.urgent ? <StatusPill label="Urgent" tone="error" testID={`pill-urgent-${item.id}`} /> : null}
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
              );
            })}

            {items.length === 0 && units.total > 0 ? (
              <Animated.View entering={justFinished ? ALL_DONE : undefined} style={s.done} testID="today-all-done">
                <Illustration name="done" width={190} />
                <RNText style={s.doneTitle}>{justFinished ? "Antrean beres. Mantap!" : "Semua beres hari ini."}</RNText>
                <RNText style={s.doneSub}>Ada prospek baru? Catat sekarang supaya Sewain bisa ingatkan kapan harus dibalas.</RNText>
                <Button title="Tambah Prospek" icon="plus" onPress={() => router.push("/lead/new" as any)} testID="today-empty-new-lead" style={{ marginTop: spacing.sm }} />
              </Animated.View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.surfaceSecondary, ...cardShadow },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg, maxWidth: 760, width: "100%", alignSelf: "center" },
  greeting: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 16 },
  headline: { ...largeTitle, color: colors.onSurface },
  summary: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15.5, lineHeight: 22 },
  banner: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: 18, backgroundColor: withAlpha("#E8A33D", 0.14),
  },
  bannerText: { color: colors.onSurface, ...fonts.medium, fontSize: 14.5, flex: 1, lineHeight: 20 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: {
    flexBasis: "45%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: spacing.md,
    gap: 4,
    ...cardShadow,
  },
  statCardWide: { flexBasis: "22%" },
  statValue: { color: colors.onSurface, ...fonts.bold, fontSize: 28, letterSpacing: -0.6, marginTop: 8 },
  statLabel: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14, lineHeight: 19 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: spacing.md + 2,
    ...cardShadow,
  },
  rowCardTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  rowCardSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, marginTop: 2, lineHeight: 20 },
  barWrap: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 3, marginTop: spacing.sm },
  barFill: { borderRadius: 4 },
  setupCard: { alignItems: "center", gap: 4, paddingVertical: spacing.xl },
  setupTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 20, marginTop: spacing.sm, textAlign: "center" },
  setupSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 420 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  newCard: { borderWidth: 1.5, borderColor: colors.brandPrimary },
  urgentCard: { borderWidth: 1.5, borderColor: withAlpha(colors.error, 0.55) },
  itemTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 17, letterSpacing: -0.2 },
  itemSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, lineHeight: 20 },
  reason: { color: colors.warning, ...fonts.semibold, fontSize: 14.5, marginTop: spacing.md },
  note: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, marginTop: 4 },
  matchLine: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, marginTop: spacing.sm },
  matchUnit: { color: colors.onSurface, ...fonts.semibold },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  done: { alignItems: "center", gap: 6, paddingVertical: spacing.xl },
  doneTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 20, textAlign: "center", marginTop: spacing.sm },
  doneSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 380 },
}));
