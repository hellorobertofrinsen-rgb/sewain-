import React, { useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
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
import { UnitThumb } from "@/src/components/UnitThumb";
import { FollowupSheet, FollowupTarget, LeaseSheet, LeaseTarget, ReminderSheet, ReminderTarget } from "@/src/components/ActionSheets";
import { Button, Card, ErrorBox, Field, IconCircle, Spinner, StatusPill, PressableScale, Tone } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { viewingInviteMessage, waLink } from "@/src/lib/messages";
import {
  UNIT_STATUS, dateTimeLabel, dayLabel, daysAgoLabel, daysFromNow, expiredLabel, greeting, leaseLeftLabel, rupiah,
  shortDay, todayISO,
} from "@/src/lib/format";
import { cardShadow, fonts, makeStyles, spacing, useTheme, withAlpha } from "@/src/theme";
import { DURATION, EASE_IN_OUT, EASE_OUT } from "@/src/motion";

// Hari Ini: four numbers (all facts: counts of what the agent recorded), then a short
// preview of Unit, Prospek and Tenant. Tapping a number opens the items behind it
// with their actions. Nothing here is a guess about what the agent "should" do.

// A finished item fades out and the rest glide up (opacity stays under reduced motion).
const ITEM_EXIT = FadeOut.duration(180).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);
const ITEM_REFLOW = LinearTransition.duration(DURATION.reflow).easing(EASE_IN_OUT);
// Small reward for clearing the last item in a list (only then).
const ALL_DONE = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.88 }, { translateY: 8 }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }], easing: EASE_OUT },
}).duration(420);

type QueueItem = any;
type TodayData = {
  name: string;
  is_demo: boolean;
  units: { total: number; terisi: number; kosong: number; reserved: number; maintenance: number };
  counts: {
    followups: number; viewings: number; unpaid_amount: number; unpaid_count: number; leases: number;
    issues: number; urgent: number; total: number; active_leads: number;
  };
  items: QueueItem[];
};

type Focus = null | "followup" | "viewing" | "payment" | "lease";
const FOCUS: Record<Exclude<Focus, null>, { title: string; types: string[] }> = {
  followup: { title: "Follow-up terjadwal", types: ["followup"] },
  viewing: { title: "Viewing", types: ["viewing", "viewing_result"] },
  payment: { title: "Jatuh tempo", types: ["payment"] },
  lease: { title: "Kontrak habis dalam 30 hari", types: ["lease"] },
};

const QUEUE_ICON: Record<string, { icon: IconName; tone: Tone }> = {
  followup: { icon: "person", tone: "brand" },
  viewing: { icon: "calendar-check", tone: "info" },
  viewing_result: { icon: "eye", tone: "info" },
  payment: { icon: "wallet", tone: "error" },
  lease: { icon: "key", tone: "warning" },
};

export default function TodayScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const { plan, showUpgrade } = usePlan();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const hasSidebar = useIsWide(); // desktop: logo + settings live in the sidebar
  const [focus, setFocus] = useState<Focus>(null);
  const [followupLead, setFollowupLead] = useState<FollowupTarget | null>(null);
  const [remindPayment, setRemindPayment] = useState<ReminderTarget | null>(null);
  const [lease, setLease] = useState<LeaseTarget | null>(null);
  const [reschedule, setReschedule] = useState<any>(null);
  const [reschedDate, setReschedDate] = useState(todayISO(1));
  const [reschedTime, setReschedTime] = useState("14:00");

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["today"], queryFn: () => api<TodayData>("/today") });
  const { data: unitList } = useQuery({ queryKey: ["units", "semua"], queryFn: () => api<any[]>("/units?status=semua") });
  const { data: leadList } = useQuery({ queryKey: ["leads", "aktif"], queryFn: () => api<any[]>("/leads?status=aktif") });
  const { data: tenantList } = useQuery({ queryKey: ["tenants"], queryFn: () => api<any[]>("/tenants") });

  const invalidateAll = () => {
    for (const key of ["today", "leads", "lead", "tenants", "tenant", "maintenance", "units", "plan", "stats"]) qc.invalidateQueries({ queryKey: [key] });
  };
  const act = (fn: (v: any) => Promise<any>, ok: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      invalidateAll();
      if (ok) toast(ok);
    },
    onError: (e: any) => toast(e?.message || "Gagal. Coba lagi.", "error"),
  });

  const confirmViewing = useMutation(act((id: string) => api(`/viewings/${id}/confirm`, { method: "POST" }), "Viewing dikonfirmasi"));
  const cancelViewing = useMutation(act((id: string) => api(`/viewings/${id}/cancel`, { method: "POST" }), "Viewing dibatalkan"));
  const viewingNotYet = useMutation(
    act((id: string) => api(`/viewings/${id}/complete`, { method: "POST", body: { next: "followup" } }), "Dicatat — follow-up dijadwalkan 3 hari lagi"),
  );
  const reschedMutation = useMutation({
    ...act((v: { id: string; date: string; time: string }) =>
      api(`/viewings/${v.id}/reschedule`, { method: "POST", body: { scheduled_at: `${v.date}T${v.time}:00` } }), "Jadwal viewing diganti"),
    onSettled: () => setReschedule(null),
  });
  const markPaid = useMutation(act((id: string) => api(`/payments/${id}/mark-paid`, { method: "POST" }), "Lunas"));

  const toNegotiation = async (item: QueueItem) => {
    try {
      await api(`/viewings/${item.viewing_id}/complete`, { method: "POST", body: { next: "negotiation" } });
      invalidateAll();
      setFocus(null);
      router.push(`/lead/${item.lead_id}?open=negotiation` as any);
    } catch (e: any) {
      toast(e?.message || "Gagal. Coba lagi.", "error");
    }
  };
  // Opening an action sheet closes the list first (one sheet at a time).
  const openFrom = (fn: () => void) => {
    setFocus(null);
    fn();
  };

  if (isLoading) return <Spinner label="Menyiapkan hari ini…" />;
  if (error || !data) return <View style={s.page}><ErrorBox message={(error as any)?.message || "Gagal memuat."} onRetry={refetch} /></View>;

  const { counts, units, items } = data;
  const money = rupiah(counts.unpaid_amount);
  const statCards: { v: string; l: string; testID: string; icon: IconName; tone: Tone; onPress: () => void }[] = [
    { v: `${counts.active_leads}`, l: "Prospek", testID: "stat-leads", icon: "person", tone: "brand", onPress: () => router.push("/leads" as any) },
    { v: `${counts.viewings}`, l: "Viewing", testID: "stat-viewings", icon: "calendar-check", tone: "info", onPress: () => (counts.viewings ? setFocus("viewing") : router.push("/leads" as any)) },
    { v: money, l: counts.unpaid_count ? `Jatuh tempo · ${counts.unpaid_count} tagihan` : "Jatuh tempo", testID: "stat-unpaid", icon: "wallet", tone: "error", onPress: () => (counts.unpaid_count ? setFocus("payment") : router.push("/tenants" as any)) },
    { v: `${counts.leases}`, l: "Kontrak habis dalam 30 hari", testID: "stat-leases", icon: "key", tone: "warning", onPress: () => (counts.leases ? setFocus("lease") : router.push("/tenants" as any)) },
  ];

  const focusItems = focus ? items.filter((i) => FOCUS[focus].types.includes(i.type)) : [];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false} testID="today-screen">
        {hasSidebar ? (
          <View style={{ height: spacing.xl }} />
        ) : (
          <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
            <LogoFull size={30} />
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
          <RNText style={s.greeting} accessibilityRole="header">
            {greeting()}, {data.name}
          </RNText>

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
              <RNText style={s.setupSub}>Catat unit yang kamu pasarkan, lalu prospek dan tenant-nya.</RNText>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap", justifyContent: "center" }}>
                <Button title="Tambah Unit" icon="plus" onPress={() => router.push("/setup")} testID="today-setup-button" />
                <Button title="Tambah Prospek" variant="ghost" onPress={() => router.push("/lead/new" as any)} testID="today-new-lead-button" />
              </View>
            </Card>
          ) : (
            <>
              <View style={s.statGrid}>
                {statCards.map((c) => (
                  <PressableScale soft key={c.testID} testID={c.testID} onPress={c.onPress} style={[s.statCard, hasSidebar && s.statCardWide]}>
                    <View style={s.statTop}>
                      <IconCircle icon={c.icon} tone={c.tone} size={36} />
                      <Icon name="chevron-right" size={16} color={colors.borderStrong} />
                    </View>
                    <RNText style={[s.statValue, c.v.length > 8 && s.statValueLong]} numberOfLines={1}>{c.v}</RNText>
                    <RNText style={s.statLabel}>{c.l}</RNText>
                  </PressableScale>
                ))}
              </View>

              {counts.followups > 0 ? (
                <PressableScale soft testID="today-followups" onPress={() => setFocus("followup")} style={s.rowCard}>
                  <IconCircle icon="calendar-check" tone="brand" size={40} />
                  <RNText style={s.rowCardText}>{counts.followups} follow-up yang kamu jadwalkan hari ini</RNText>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </PressableScale>
              ) : null}
              {counts.issues > 0 ? (
                <PressableScale soft testID="today-issues" onPress={() => router.push("/maintenance" as any)} style={s.rowCard}>
                  <IconCircle icon="wrench" tone={counts.urgent ? "error" : "warning"} size={40} />
                  <RNText style={s.rowCardText}>
                    {counts.issues} masalah terbuka{counts.urgent ? ` · ${counts.urgent} urgent` : ""}
                  </RNText>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </PressableScale>
              ) : null}

              <UnitPreview units={unitList} />
              <LeadPreview leads={leadList} />
              <TenantPreview tenants={tenantList} />
            </>
          )}
        </View>
      </ScrollView>

      <Sheet visible={!!focus} onClose={() => setFocus(null)} title={focus ? FOCUS[focus].title : ""} testID="focus-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          {focusItems.map((item) => (
            <Animated.View key={`${item.type}-${item.id}`} exiting={ITEM_EXIT} layout={ITEM_REFLOW}>
              <QueueCard
                item={item}
                onFollowup={() => openFrom(() => setFollowupLead({ ...item, id: item.lead_id }))}
                onDetail={(path) => openFrom(() => router.push(path as any))}
                onConfirm={() => confirmViewing.mutate(item.viewing_id)}
                onReschedule={() => openFrom(() => { setReschedule(item); setReschedDate(todayISO(1)); setReschedTime("14:00"); })}
                onCancel={() => cancelViewing.mutate(item.viewing_id)}
                onNego={() => toNegotiation(item)}
                onNotYet={() => viewingNotYet.mutate(item.viewing_id)}
                onPaid={() => markPaid.mutate(item.payment_id)}
                onRemind={() => openFrom(() => setRemindPayment({ ...item, id: item.payment_id }))}
                onLease={() => openFrom(() => setLease({ ...item, id: item.tenant_id }))}
              />
            </Animated.View>
          ))}
          {focus && focusItems.length === 0 ? (
            <Animated.View entering={ALL_DONE} style={s.done} testID="focus-all-done">
              <Illustration name="done" width={170} />
              <RNText style={s.doneTitle}>Beres semua. Mantap!</RNText>
            </Animated.View>
          ) : null}
        </View>
      </Sheet>

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

// ------------------------------ Queue card (inside the sheets) ------------------------

function QueueCard({
  item, onFollowup, onDetail, onConfirm, onReschedule, onCancel, onNego, onNotYet, onPaid, onRemind, onLease,
}: {
  item: QueueItem;
  onFollowup: () => void; onDetail: (path: string) => void; onConfirm: () => void; onReschedule: () => void;
  onCancel: () => void; onNego: () => void; onNotYet: () => void; onPaid: () => void; onRemind: () => void; onLease: () => void;
}) {
  const s = useStyles();
  const qi = QUEUE_ICON[item.type] ?? QUEUE_ICON.followup;
  const head = (title: string, sub: string, pill?: React.ReactNode) => (
    <View style={s.cardHead}>
      <IconCircle icon={qi.icon} tone={qi.tone} />
      <View style={{ flex: 1, gap: 2 }}>
        <RNText style={s.itemTitle}>{title}</RNText>
        <RNText style={s.itemSub}>{sub}</RNText>
      </View>
      {pill}
    </View>
  );
  if (item.type === "followup") {
    return (
      <Card testID={`queue-followup-${item.id}`} style={s.sheetCard}>
        {head(item.name, [item.unit_type, item.budget_max ? `Budget ${rupiah(item.budget_max)}` : null].filter(Boolean).join(" · ") || "Prospek",
          item.hot ? <StatusPill label="Hot buyer" tone="error" /> : undefined)}
        <RNText style={s.reason}>{item.reason}</RNText>
        {item.note ? <RNText style={s.note} numberOfLines={2}>{item.note}</RNText> : null}
        <View style={s.actions}>
          <Button title="Follow-up" size="sm" icon="whatsapp" onPress={onFollowup} testID={`followup-open-${item.id}`} />
          <Button title="Detail" variant="ghost" size="sm" onPress={() => onDetail(`/lead/${item.lead_id}`)} testID={`followup-detail-${item.id}`} />
        </View>
      </Card>
    );
  }
  if (item.type === "viewing") {
    return (
      <Card testID={`queue-viewing-${item.id}`} style={s.sheetCard}>
        {head(`Viewing ${item.name}`, `Unit ${item.unit_name} · ${dateTimeLabel(item.scheduled_at)}`,
          <StatusPill label={item.status === "menunggu" ? "Belum dikonfirmasi" : "Terjadwal"} tone={item.status === "menunggu" ? "warning" : "info"} testID={`pill-viewing-${item.id}`} />)}
        <View style={s.actions}>
          {waLink(item.phone) ? (
            <Button
              title="Undang Viewing"
              icon="whatsapp"
              size="sm"
              onPress={() => Linking.openURL(waLink(item.phone, viewingInviteMessage({ name: item.name, unit_name: item.unit_name, scheduled_at: item.scheduled_at, location: item.location }))!)}
              testID={`viewing-invite-${item.id}`}
            />
          ) : null}
          {item.status === "menunggu" ? <Button title="Konfirmasi" size="sm" variant="ghost" onPress={onConfirm} testID={`viewing-confirm-${item.id}`} /> : null}
          <Button title="Ganti Jadwal" variant="ghost" size="sm" onPress={onReschedule} testID={`viewing-reschedule-${item.id}`} />
          <Button title="Batal" variant="ghost" size="sm" onPress={onCancel} testID={`viewing-cancel-${item.id}`} />
        </View>
      </Card>
    );
  }
  if (item.type === "viewing_result") {
    return (
      <Card testID={`queue-viewing-result-${item.id}`} style={s.sheetCard}>
        {head(`Hasil viewing ${item.name}?`, `Unit ${item.unit_name} · ${dateTimeLabel(item.scheduled_at)}`)}
        <View style={s.actions}>
          <Button title="Lanjut Negosiasi" size="sm" onPress={onNego} testID={`viewing-nego-${item.id}`} />
          <Button title="Belum cocok" variant="ghost" size="sm" onPress={onNotYet} testID={`viewing-notyet-${item.id}`} />
        </View>
      </Card>
    );
  }
  if (item.type === "payment") {
    return (
      <Card testID={`queue-payment-${item.id}`} style={s.sheetCard}>
        {head(`${item.name} · ${item.unit_name}`, `${rupiah(item.amount)}${item.months > 1 ? ` (${item.months} bulan)` : ""} · tempo ${shortDay(item.due_date + "T00:00:00")}`,
          <StatusPill label={item.days_late > 0 ? `Telat ${item.days_late} hari` : "Belum bayar"} tone="error" testID={`pill-payment-${item.id}`} />)}
        <View style={s.actions}>
          <Button title="Tandai Lunas" size="sm" onPress={onPaid} testID={`payment-paid-${item.id}`} />
          <Button title="Ingatkan" variant="ghost" size="sm" icon="whatsapp" onPress={onRemind} testID={`payment-remind-${item.id}`} />
        </View>
      </Card>
    );
  }
  if (item.type === "lease") {
    return (
      <Card testID={`queue-lease-${item.id}`} style={s.sheetCard}>
        {head(`${item.name} · ${item.unit_name}`, `Kontrak sampai ${shortDay(item.end_date + "T00:00:00")}`,
          <StatusPill label={leaseLeftLabel(item.days_left)} tone={item.days_left <= 7 ? "error" : "warning"} testID={`pill-lease-${item.id}`} />)}
        <View style={s.actions}>
          <Button title="Perpanjang / Kabari" size="sm" onPress={onLease} testID={`lease-open-${item.id}`} />
          <Button title="Detail" variant="ghost" size="sm" onPress={() => onDetail(`/tenant/${item.tenant_id}`)} testID={`lease-detail-${item.id}`} />
        </View>
      </Card>
    );
  }
  return null;
}

// ------------------------------ Previews ------------------------------------------

function Section({ title, to, testID, children }: { title: string; to: string; testID: string; children: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.md }} testID={testID}>
      <PressableScale role="link" onPress={() => router.push(to as any)} style={s.sectionHead} testID={`${testID}-all`}>
        <RNText style={s.sectionTitle}>{title}</RNText>
        <View style={s.seeAll}>
          <RNText style={s.seeAllText}>Lihat semua</RNText>
          <Icon name="chevron-right" size={16} color={colors.brandPrimary} />
        </View>
      </PressableScale>
      <View style={s.previewList}>{children}</View>
    </View>
  );
}

function PreviewRow({ onPress, left, title, sub, right, testID, last }: { onPress: () => void; left: React.ReactNode; title: string; sub?: string | null; right?: React.ReactNode; testID: string; last?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale soft onPress={onPress} style={[s.previewRow, last && { borderBottomWidth: 0 }]} testID={testID}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <RNText style={s.previewTitle} numberOfLines={1}>{title}</RNText>
        {sub ? <RNText style={s.previewSub} numberOfLines={1}>{sub}</RNText> : null}
      </View>
      {right}
      <Icon name="chevron-right" size={16} color={colors.borderStrong} />
    </PressableScale>
  );
}

function Empty({ text }: { text: string }) {
  const s = useStyles();
  return <RNText style={s.emptyText}>{text}</RNText>;
}

function UnitPreview({ units }: { units?: any[] }) {
  // Vacant units first (longest empty first): those are the ones to market.
  const rows = [...(units || [])]
    .sort((a, b) => Number(b.status === "kosong") - Number(a.status === "kosong") || (daysFromNow(b.vacant_since) ?? 0) - (daysFromNow(a.vacant_since) ?? 0))
    .slice(0, 3);
  return (
    <Section title="Unit" to="/units" testID="preview-units">
      {rows.length === 0 ? <Empty text="Belum ada unit." /> : null}
      {rows.map((u, i) => (
        <PreviewRow
          key={u.id}
          last={i === rows.length - 1}
          testID={`preview-unit-${u.id}`}
          onPress={() => router.push(`/unit/${u.id}` as any)}
          left={<UnitThumb photo={u.photos?.[0]} width={48} height={48} radiusSize={12} />}
          title={u.name}
          sub={`${rupiah(u.monthly_price)}/bln · ${u.property_name || u.unit_type}`}
          right={<StatusPill label={UNIT_STATUS[u.status] || u.status} tone={u.status === "kosong" ? "info" : u.status === "terisi" ? "success" : "warning"} />}
        />
      ))}
    </Section>
  );
}

function leadFact(l: any): string | null {
  if (l.next_followup_date && l.next_followup_date <= todayISO()) return `Follow-up ${dayLabel(l.next_followup_date + "T00:00:00").toLowerCase()}`;
  if (l.next_viewing_at) return `Viewing ${dateTimeLabel(l.next_viewing_at)}`;
  if (l.last_viewing_at) return `Sudah viewing ${daysAgoLabel(l.last_viewing_at)}`;
  return expiredLabel(l.move_in_date) || (l.budget_max ? `Budget ${rupiah(l.budget_max)}` : null);
}

function LeadPreview({ leads }: { leads?: any[] }) {
  // Scheduled follow-ups due, then upcoming viewings, then hot buyers, then the rest.
  const rank = (l: any) =>
    l.next_followup_date && l.next_followup_date <= todayISO() ? 0 : l.next_viewing_at ? 1 : l.interest === "high" ? 2 : 3;
  const rows = [...(leads || [])].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  return (
    <Section title="Prospek" to="/leads" testID="preview-leads">
      {rows.length === 0 ? <Empty text="Belum ada prospek aktif." /> : null}
      {rows.map((l, i) => (
        <PreviewRow
          key={l.id}
          last={i === rows.length - 1}
          testID={`preview-lead-${l.id}`}
          onPress={() => router.push(`/lead/${l.id}` as any)}
          left={<Avatar name={l.name} />}
          title={l.name}
          sub={leadFact(l)}
          right={l.interest === "high" ? <StatusPill label="Hot buyer" tone="error" /> : null}
        />
      ))}
    </Section>
  );
}

function TenantPreview({ tenants }: { tenants?: any[] }) {
  // Unpaid bills first (most overdue first), then contracts ending soonest.
  const rows = [...(tenants || [])]
    .sort((a, b) =>
      Number(b.payment_status === "belum_bayar") - Number(a.payment_status === "belum_bayar") ||
      (b.overdue ?? 0) - (a.overdue ?? 0) ||
      (a.days_left ?? 9999) - (b.days_left ?? 9999))
    .slice(0, 3);
  return (
    <Section title="Tenant" to="/tenants" testID="preview-tenants">
      {rows.length === 0 ? <Empty text="Belum ada tenant." /> : null}
      {rows.map((t, i) => (
        <PreviewRow
          key={t.id}
          last={i === rows.length - 1}
          testID={`preview-tenant-${t.id}`}
          onPress={() => router.push(`/tenant/${t.id}` as any)}
          left={<Avatar name={t.name} />}
          title={t.name}
          sub={`Unit ${t.unit_name} · ${leaseLeftLabel(t.days_left)}`}
          right={
            t.payment_status === "belum_bayar" ? (
              <StatusPill label={t.overdue > 0 ? `Telat ${t.overdue} hari` : "Belum bayar"} tone="error" />
            ) : (
              <StatusPill label="Lunas" tone="success" />
            )
          }
        />
      ))}
    </Section>
  );
}

function Avatar({ name }: { name: string }) {
  const s = useStyles();
  return (
    <View style={s.avatar}>
      <RNText style={s.avatarText}>{(name || "?").charAt(0).toUpperCase()}</RNText>
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md, maxWidth: 760, width: "100%", alignSelf: "center" },
  greeting: { color: colors.onSurface, ...fonts.bold, fontSize: 28, letterSpacing: -0.5, lineHeight: 34, marginBottom: spacing.xs },
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
  statTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  statValue: { color: colors.onSurface, ...fonts.bold, fontSize: 28, letterSpacing: -0.6, marginTop: 8 },
  statValueLong: { fontSize: 21, letterSpacing: -0.4, marginTop: 12 },
  statLabel: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14, lineHeight: 19 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: spacing.md,
    ...cardShadow,
  },
  rowCardText: { color: colors.onSurface, ...fonts.semibold, fontSize: 16, flex: 1 },
  setupCard: { alignItems: "center", gap: 4, paddingVertical: spacing.xl },
  setupTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 20, marginTop: spacing.sm, textAlign: "center" },
  setupSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 420 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  sectionTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 22, letterSpacing: -0.3 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 15 },
  previewList: { backgroundColor: colors.surfaceSecondary, borderRadius: 20, overflow: "hidden", ...cardShadow },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  previewTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 16.5 },
  previewSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14 },
  emptyText: { color: colors.muted, ...fonts.regular, fontSize: 15, padding: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandTertiary, ...fonts.bold, fontSize: 18 },
  sheetCard: { backgroundColor: colors.surface, boxShadow: "none", shadowOpacity: 0 } as any,
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  itemTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 17, letterSpacing: -0.2 },
  itemSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, lineHeight: 20 },
  reason: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 14.5, marginTop: spacing.md },
  note: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  done: { alignItems: "center", gap: 6, paddingVertical: spacing.lg },
  doneTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 20, textAlign: "center", marginTop: spacing.sm },
}));
