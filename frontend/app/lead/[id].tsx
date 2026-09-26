import React, { useState } from "react";
import { Linking, ScrollView, Switch, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { STATE_TRANSITION } from "@/src/motion";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { Icon } from "@/src/components/Icon";
import { DateInput } from "@/src/components/DateInput";
import { FollowupSheet } from "@/src/components/ActionSheets";
import { LeadForm, LeadFormValue, formToBody, leadToForm } from "@/src/components/LeadForm";
import { Button, Card, Chip, ErrorBox, Field, Input, ListGroup, ListRow, SectionTitle, Spinner, StatusPill, SwitchRow, Textarea, PressableScale } from "@/src/components/ui";
import { useCelebrate } from "@/src/components/Celebrate";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { googleCalendarLink, viewingInviteMessage, waLink } from "@/src/lib/messages";
import { VIEWING_STATUS, dateLabel, dateTimeLabel, moneyInput, parseMoney, rupiah, todayISO, expiredLabel } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

const STAGES = [
  { key: "baru", label: "Baru" },
  { key: "sedang_ngobrol", label: "Dihubungi" },
  { key: "viewing", label: "Viewing" },
  { key: "negotiation", label: "Nego" },
  { key: "deal", label: "Deal" },
];
const stageIndex = (status: string) => {
  if (status === "perlu_followup") return 0;
  return Math.max(0, STAGES.findIndex((x) => x.key === status));
};
const MONTH_OPTIONS = [1, 3, 6, 12, 24];

export default function LeadDetailRoute() {
  const { id, open } = useLocalSearchParams<{ id: string; open?: string }>();
  return <LeadDetail id={id} open={open} />;
}

/** Also rendered inline in the desktop split view (embedded). */
export function LeadDetail({ id, open, embedded, onGone }: { id: string; open?: string; embedded?: boolean; onGone?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();

  // Arriving from "Lanjut Negosiasi" on Hari Ini (?open=negotiation) opens that form directly.
  const [sheet, setSheet] = useState<Sheetname>(open === "negotiation" ? "negotiation" : open === "viewing" ? "viewing" : null);

  const { data: lead, isLoading, error, refetch } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => api<any>(`/leads/${id}`),
  });
  const invalidate = () => {
    for (const key of ["lead", "leads", "today", "units", "tenants", "plan"]) qc.invalidateQueries({ queryKey: [key] });
  };
  const onErr = (e: any) => {
    if (!e?.code) toast(e?.message || "Gagal. Coba lagi.", "error");
  };

  const pickUnit = useMutation({
    mutationFn: (unitId: string | null) => api(`/leads/${id}`, { method: "PATCH", body: { matched_unit_id: unitId } }),
    onSuccess: () => { invalidate(); toast("Unit dipilih ✓"); },
    onError: onErr,
  });
  const setHot = useMutation({
    mutationFn: (hot: boolean) => api(`/leads/${id}`, { method: "PATCH", body: { interest: hot ? "high" : "medium" } }),
    onSuccess: () => invalidate(),
    onError: onErr,
  });
  const [lostReason, setLostReason] = useState<string | null>(null);
  const markLost = useMutation({
    mutationFn: () => api(`/leads/${id}/not-interested`, { method: "POST", body: { reason: lostReason } }),
    onSuccess: () => { invalidate(); setSheet(null); toast("Ditandai tidak jadi"); },
    onError: onErr,
  });
  const reopen = useMutation({
    mutationFn: () => api(`/leads/${id}/reopen`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast("Prospek aktif lagi"); },
    onError: onErr,
  });

  if (isLoading) return <View style={s.root}><Spinner label="Memuat prospek…" /></View>;
  if (error || !lead) return <View style={s.root}><ScreenHeader embedded={embedded} title="Prospek" /><ErrorBox message={(error as any)?.message || "Tidak ditemukan"} onRetry={refetch} /></View>;

  const status: string = lead.status;
  const closed = status === "deal" || status === "tidak_jadi";
  const stage = stageIndex(status);
  const upcoming = (lead.viewings || []).find((x: any) => x.status === "menunggu" || x.status === "terjadwal");
  const nego = lead.negotiation;
  const wa = waLink(lead.phone);
  const followTarget = { ...lead, unit: lead.matched_unit };
  const done = (msg: string) => { invalidate(); setSheet(null); toast(msg); };

  return (
    <View style={s.root}>
      <ScreenHeader embedded={embedded}
        title={lead.name}
        right={
          <PressableScale testID="lead-edit-button" onPress={() => setSheet("edit")} style={s.headerBtn} accessibilityLabel="Edit">
            <Icon name="pencil" size={18} color={colors.onSurfaceSecondary} />
          </PressableScale>
        }
      />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: (embedded ? 0 : insets.bottom) + spacing.xxxl }]} showsVerticalScrollIndicator={false} testID="lead-detail-screen">
        {/* Stage */}
        {status === "tidak_jadi" ? (
          <StatusPill label="Tidak jadi" tone="neutral" testID="lead-status-pill" />
        ) : (
          <View style={s.stages} testID="lead-stages">
            {STAGES.map((st, i) => (
              <View key={st.key} style={{ flex: 1, gap: 6 }}>
                <Animated.View style={[STATE_TRANSITION, s.stageBar, i <= stage && { backgroundColor: status === "deal" ? colors.success : colors.brandPrimary }]} />
                <RNText style={[s.stageLabel, i === stage && s.stageLabelActive]}>{st.label}</RNText>
              </View>
            ))}
          </View>
        )}

        {/* Next step */}
        <Card testID="next-step-card">
          {status === "deal" ? (
            <>
              <RNText style={s.kicker}>Sudah jadi tenant</RNText>
              <RNText style={s.stepText}>{lead.name} sudah menyewa {lead.matched_unit ? `unit ${lead.matched_unit.name}` : "unit"}. Tagihan & kontraknya ada di halaman tenant.</RNText>
              {lead.tenant_id ? <Button title="Lihat Tenant" onPress={() => router.push(`/tenant/${lead.tenant_id}` as any)} testID="lead-open-tenant" style={s.stepBtn} /> : null}
            </>
          ) : status === "tidak_jadi" ? (
            <>
              <RNText style={s.stepText}>Prospek ini ditandai tidak jadi.</RNText>
              <Button title="Aktifkan Lagi" variant="ghost" onPress={() => reopen.mutate()} loading={reopen.isPending} testID="lead-reopen" style={s.stepBtn} />
            </>
          ) : status === "negotiation" ? (
            <>
              <RNText style={s.kicker}>Negosiasi</RNText>
              <RNText style={s.stepText}>
                {[nego?.agreed_price ? `${rupiah(nego.agreed_price)}/bulan` : null, nego?.contract_months ? `${nego.contract_months} bulan` : null, nego?.deposit ? `deposit ${rupiah(nego.deposit)}` : null]
                  .filter(Boolean)
                  .join(" · ") || "Belum ada angka yang disepakati."}
              </RNText>
              {nego?.note ? <RNText style={s.muted}>{nego.note}</RNText> : null}
              <Button title="Deal — Jadikan Tenant" onPress={() => setSheet("deal")} testID="lead-mark-deal-button" style={s.stepBtn} />
              <View style={s.row}>
                <Button title="Ubah Nego" variant="ghost" size="sm" onPress={() => setSheet("negotiation")} testID="lead-edit-nego" />
                <Button title="Follow-up" variant="ghost" size="sm" onPress={() => setSheet("followup")} testID="lead-followup-button" />
              </View>
            </>
          ) : status === "viewing" ? (
            <>
              <RNText style={s.kicker}>Viewing</RNText>
              <RNText style={s.stepText}>
                {upcoming ? `Unit ${upcoming.unit_name} · ${dateTimeLabel(upcoming.scheduled_at)}` : "Sudah viewing. Lanjut negosiasi kalau cocok."}
              </RNText>
              {upcoming?.location ? <RNText style={s.muted}>{upcoming.location}</RNText> : null}
              {upcoming ? <InviteButtons lead={lead} viewing={upcoming} /> : null}
              <Button title="Lanjut Negosiasi" variant={upcoming ? "ghost" : "primary"} onPress={() => setSheet("negotiation")} testID="lead-start-nego" style={s.stepBtn} />
              <View style={s.row}>
                <Button title="Follow-up" variant="ghost" size="sm" onPress={() => setSheet("followup")} testID="lead-followup-button" />
                <Button title="Viewing Lain" variant="ghost" size="sm" onPress={() => setSheet("viewing")} testID="lead-another-viewing" />
              </View>
            </>
          ) : (
            <>
              <RNText style={s.kicker}>Langkah berikutnya</RNText>
              <RNText style={s.stepText}>
                {lead.next_followup_date ? `Follow-up dijadwalkan ${dateLabel(lead.next_followup_date + "T00:00:00")}.` : lead.matched_unit ? `Tawarkan unit ${lead.matched_unit.name} dan ajak viewing.` : "Kabari dan tanyakan kebutuhannya."}
              </RNText>
              <Button title="Jadwalkan Viewing" icon="calendar-check" onPress={() => setSheet("viewing")} testID="lead-schedule-viewing-button" style={s.stepBtn} />
              <View style={s.row}>
                <Button title="Follow-up" icon="whatsapp" variant="ghost" size="sm" onPress={() => setSheet("followup")} testID="lead-followup-button" />
                <Button title="Langsung Nego" variant="ghost" size="sm" onPress={() => setSheet("negotiation")} testID="lead-direct-nego" />
              </View>
            </>
          )}
        </Card>

        {/* Profile */}
        <ListGroup title="Profil" testID="lead-profile">
          <ListRow
            label="Hot buyer"
            sub="Tandai kalau prospek ini serius dan siap sewa."
            icon="zap"
            tone="error"
            right={<Switch testID="lead-hot-toggle" value={lead.interest === "high"} onValueChange={(v) => setHot.mutate(v)} trackColor={{ false: colors.borderStrong, true: colors.error }} thumbColor="#FFFFFF" />}
          />
          {lead.phone ? (
            <ListRow label="WhatsApp" value={lead.phone} icon="whatsapp" tone="success" onPress={wa ? () => Linking.openURL(wa) : undefined} testID="lead-phone-row" />
          ) : null}
          <ListRow label="Budget" value={lead.budget_max || lead.budget_min ? `${rupiah(lead.budget_max || lead.budget_min)}/bln` : "-"} icon="wallet" tone="brand" />
          <ListRow label="Cari tipe" value={lead.unit_type || "-"} icon="building" tone="info" />
          <ListRow label="Lokasi" value={lead.preferred_location || "-"} icon="globe" tone="neutral" />
          <ListRow label="Expired" value={expiredLabel(lead.move_in_date)?.replace("Expired ", "") || "-"} icon="calendar-check" tone="warning" />
          {lead.occupants ? <ListRow label="Jumlah orang" value={`${lead.occupants}`} icon="users" tone="neutral" /> : null}
        </ListGroup>
        {lead.requirements?.length || lead.notes || lead.summary || lead.ai_note || lead.quote ? (
          <Card>
            {lead.requirements?.length ? (
              <View style={[s.reqs, { marginTop: 0 }]}>
                {lead.requirements.map((r: string, i: number) => (
                  <StatusPill key={i} label={r} tone="neutral" testID={`lead-requirement-${i}`} />
                ))}
              </View>
            ) : null}
            {lead.notes || lead.summary || lead.ai_note ? <RNText style={[s.notes, !lead.requirements?.length && { marginTop: 0 }]}>{lead.notes || lead.summary || lead.ai_note}</RNText> : null}
            {lead.quote ? <RNText style={s.quote}>“{lead.quote}”</RNText> : null}
          </Card>
        ) : null}

        {/* Matching */}
        {!closed ? (
          <View style={{ gap: spacing.md }}>
            <SectionTitle>Unit yang cocok</SectionTitle>
            {lead.matched_unit ? (
              <Card testID="matched-unit-card" onPress={() => router.push(`/unit/${lead.matched_unit.id}` as any)}>
                <View style={s.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <RNText style={s.matchName}>{lead.matched_unit.name}</RNText>
                    <RNText style={s.muted}>{lead.matched_unit.unit_type} · {rupiah(lead.matched_unit.monthly_price)} / bulan</RNText>
                  </View>
                  <StatusPill label="Dipilih" tone="success" testID="matched-pill" />
                  <Icon name="chevron-right" size={18} color={colors.brandPrimary} />
                </View>
                {lead.match_reasons?.length ? <RNText style={s.reasons}>✓ {lead.match_reasons.join("  ✓ ")}</RNText> : null}
              </Card>
            ) : null}
            {(lead.suggestions || []).filter((x: any) => x.unit.id !== lead.matched_unit?.id).map((x: any) => (
              <Card key={x.unit.id} testID={`suggestion-${x.unit.id}`}>
                <View style={s.rowBetween}>
                  <PressableScale style={{ flex: 1 }} role="link" onPress={() => router.push(`/unit/${x.unit.id}` as any)}>
                    <RNText style={s.suggestName}>{x.unit.name}{x.unit.property_name ? ` · ${x.unit.property_name}` : ""} <RNText style={{ color: colors.brandPrimary }}>›</RNText></RNText>
                    <RNText style={s.muted}>{x.unit.unit_type} · {rupiah(x.unit.monthly_price)}/bln</RNText>
                    <RNText style={s.reasons}>✓ {x.reasons.join("  ✓ ")}</RNText>
                  </PressableScale>
                  <Button title="Pilih" variant="ghost" size="sm" onPress={() => pickUnit.mutate(x.unit.id)} testID={`pick-unit-${x.unit.id}`} />
                </View>
              </Card>
            ))}
            {!lead.matched_unit && !(lead.suggestions || []).length ? (
              <Card><RNText style={s.muted}>Belum ada unit kosong yang cocok. Lengkapi budget & tipe, atau tambah unit baru.</RNText></Card>
            ) : null}
          </View>
        ) : null}

        {lead.viewings?.length ? (
          <View style={{ gap: spacing.md }}>
            <SectionTitle>Riwayat viewing</SectionTitle>
            {lead.viewings.map((vw: any) => (
              <Card key={vw.id}>
                <View style={s.rowBetween}>
                  <RNText style={s.itemSub}>Unit {vw.unit_name} · {dateTimeLabel(vw.scheduled_at)}</RNText>
                  <StatusPill label={VIEWING_STATUS[vw.status] || vw.status} tone={vw.status === "selesai" ? "success" : vw.status === "batal" ? "neutral" : "info"} testID={`lead-viewing-status-${vw.id}`} />
                </View>
                {(vw.status === "menunggu" || vw.status === "terjadwal") && new Date(vw.scheduled_at) > new Date() ? (
                  <InviteButtons lead={lead} viewing={vw} compact />
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}

        {lead.last_message ? (
          <Card>
            <RNText style={s.kicker}>Pesan terakhir dikirim</RNText>
            <RNText style={s.notes}>{lead.last_message}</RNText>
          </Card>
        ) : null}

        {!closed ? <Button title="Tandai Tidak Jadi" variant="danger" onPress={() => setSheet("lost")} testID="lead-not-interested-button" /> : null}
      </ScrollView>

      <FollowupSheet lead={sheet === "followup" ? followTarget : null} onClose={() => setSheet(null)} />

      {sheet === "edit" ? <EditSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}
      {sheet === "viewing" ? <ViewingSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}
      {sheet === "negotiation" && !closed ? <NegotiationSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}
      {sheet === "deal" && !closed ? <DealSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}

      <Sheet visible={sheet === "lost"} onClose={() => setSheet(null)} title={`${lead.name} tidak jadi?`} testID="lost-sheet">
        <View style={{ gap: spacing.md }}>
          <Field label="Alasannya? (membantu lihat pola di Laporan)">
            <View style={s.wrap}>
              {LOST_REASONS.map((r) => (
                <Chip key={r} label={r} active={lostReason === r} onPress={() => setLostReason(lostReason === r ? null : r)} testID={`lost-reason-${LOST_REASONS.indexOf(r)}`} />
              ))}
            </View>
          </Field>
          <RNText style={s.note}>Prospek dipindah ke “Tidak jadi” dan tidak dihitung sebagai prospek aktif. Bisa diaktifkan lagi kapan saja.</RNText>
          <Button title="Ya, Tidak Jadi" variant="danger" onPress={() => markLost.mutate()} loading={markLost.isPending} testID="lost-confirm-button" />
        </View>
      </Sheet>
    </View>
  );
}

const LOST_REASONS = ["Harga terlalu mahal", "Lokasi kurang cocok", "Sudah dapat tempat lain", "Tidak ada kabar", "Unit tidak sesuai"];

// How often the tenant pays: many rentals are paid 6 or 12 months upfront.
const INTERVALS = [
  { m: 1, label: "Bulanan" },
  { m: 3, label: "3 bulan" },
  { m: 6, label: "6 bulan" },
  { m: 12, label: "Tahunan" },
];

function IntervalChips({ value, onChange, prefix }: { value: number; onChange: (m: number) => void; prefix: string }) {
  const s = useStyles();
  return (
    <View style={s.wrap}>
      {INTERVALS.map((it) => (
        <Chip key={it.m} label={it.label} active={value === it.m} onPress={() => onChange(it.m)} testID={`${prefix}-interval-${it.m}`} />
      ))}
    </View>
  );
}

/** "Undang Viewing" sends the schedule and location to the prospect's WhatsApp. */
function InviteButtons({ lead, viewing, compact }: { lead: any; viewing: any; compact?: boolean }) {
  const s = useStyles();
  const info = { name: lead.name, phone: lead.phone, unit_name: viewing.unit_name, location: viewing.location, scheduled_at: viewing.scheduled_at };
  const wa = waLink(lead.phone, viewingInviteMessage(info));
  return (
    <View style={[s.row, !compact && { marginTop: spacing.md }]}>
      {wa ? (
        <Button title="Undang Viewing" icon="whatsapp" size={compact ? "sm" : "md"} onPress={() => Linking.openURL(wa)} testID={`invite-viewing-${viewing.id}`} />
      ) : null}
      <Button title="Google Calendar" icon="calendar-check" variant="ghost" size="sm" onPress={() => Linking.openURL(googleCalendarLink(info))} testID={`calendar-viewing-${viewing.id}`} />
    </View>
  );
}

type Sheetname = null | "followup" | "viewing" | "negotiation" | "deal" | "edit" | "lost";
type SheetProps = { lead: any; onClose: () => void; onDone: (msg: string) => void; onErr: (e: any) => void };

// Units a lead can still take (anything not already rented).
function useOpenUnits() {
  const { data } = useQuery({ queryKey: ["units", "semua"], queryFn: () => api<any[]>("/units?status=semua") });
  return { loaded: !!data, units: (data || []).filter((u) => u.status !== "terisi") };
}

function UnitChips({ units, loaded, value, onPick, prefix }: { units: any[]; loaded: boolean; value: string; onPick: (u: any) => void; prefix: string }) {
  const s = useStyles();
  return (
    <View style={s.wrap}>
      {units.map((u: any) => (
        <Chip key={u.id} label={`${u.name} · ${rupiah(u.monthly_price)}`} active={value === u.id} onPress={() => onPick(u)} testID={`${prefix}-unit-${u.id}`} />
      ))}
      {loaded && units.length === 0 ? <RNText style={s.muted}>Tidak ada unit kosong saat ini.</RNText> : null}
    </View>
  );
}

function EditSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const [f, setF] = useState<LeadFormValue>(() => leadToForm(lead));
  const save = useMutation({
    mutationFn: () => api(`/leads/${lead.id}`, { method: "PATCH", body: formToBody(f) }),
    onSuccess: () => onDone("Tersimpan ✓"),
    onError: onErr,
  });
  return (
    <Sheet visible onClose={onClose} title={`Edit ${lead.name}`} testID="lead-edit-sheet" scroll>
      <View style={{ gap: spacing.lg }}>
        <LeadForm value={f} onChange={setF} startExpanded />
        <Button title="Simpan" onPress={() => save.mutate()} loading={save.isPending} disabled={!f.name.trim()} testID="lead-edit-save" />
      </View>
    </Sheet>
  );
}

function ViewingSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const s = useStyles();
  const { units, loaded } = useOpenUnits();
  const [v, setV] = useState({ unit: lead.matched_unit?.id || "", date: todayISO(1), time: "14:00" });
  const [toCalendar, setToCalendar] = useState(true);
  const save = useMutation({
    mutationFn: () => api("/viewings", { method: "POST", body: { lead_id: lead.id, unit_id: v.unit, scheduled_at: `${v.date}T${v.time}:00` } }),
    onSuccess: () => onDone("Viewing dijadwalkan. Kirim undangannya lewat tombol Undang Viewing."),
    onError: onErr,
  });
  const submit = () => {
    const unit = units.find((u: any) => u.id === v.unit);
    // Opened inside the tap itself so the browser doesn't block it as a pop-up.
    if (toCalendar && unit) {
      Linking.openURL(googleCalendarLink({ name: lead.name, phone: lead.phone, unit_name: unit.name, location: unit.location, scheduled_at: new Date(`${v.date}T${v.time}:00`).toISOString() }));
    }
    save.mutate();
  };
  return (
    <Sheet visible onClose={onClose} title={`Viewing ${lead.name}`} testID="viewing-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        <Field label="Unit">
          <UnitChips units={units} loaded={loaded} value={v.unit} onPick={(u) => setV({ ...v, unit: u.id })} prefix="viewing" />
        </Field>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Tanggal"><DateInput testID="viewing-date-input" value={v.date} onChange={(x) => setV({ ...v, date: x })} /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Jam"><DateInput mode="time" testID="viewing-time-input" value={v.time} onChange={(x) => setV({ ...v, time: x })} /></Field>
          </View>
        </View>
        <SwitchRow label="Tambah ke Google Calendar" value={toCalendar} onChange={setToCalendar} testID="viewing-calendar-switch" />
        <Button title="Simpan Viewing" onPress={submit} loading={save.isPending} disabled={!v.unit || !v.date || !v.time} testID="viewing-save-button" />
      </View>
    </Sheet>
  );
}

function NegotiationSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const s = useStyles();
  const { units, loaded } = useOpenUnits();
  const t = lead.negotiation || {};
  const [n, setN] = useState({
    unit: t.unit_id || lead.matched_unit?.id || "",
    price: moneyInput(t.agreed_price ?? lead.matched_unit?.monthly_price),
    deposit: moneyInput(t.deposit),
    months: t.contract_months || 12,
    interval: t.payment_interval_months || 1,
    commission: moneyInput(t.commission),
    note: t.note || "",
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/leads/${lead.id}/negotiation`, {
        method: "POST",
        body: {
          unit_id: n.unit || null, agreed_price: parseMoney(n.price), deposit: parseMoney(n.deposit), contract_months: n.months,
          payment_interval_months: n.interval, commission: parseMoney(n.commission), note: n.note.trim() || null,
        },
      }),
    onSuccess: () => onDone("Negosiasi tersimpan ✓"),
    onError: onErr,
  });
  return (
    <Sheet visible onClose={onClose} title={`Negosiasi ${lead.name}`} testID="negotiation-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        <Field label="Unit">
          <UnitChips units={units} loaded={loaded} value={n.unit} onPick={(u) => setN({ ...n, unit: u.id, price: n.price || moneyInput(u.monthly_price) })} prefix="nego" />
        </Field>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Harga disepakati / bulan"><Input testID="nego-price-input" value={n.price} onChangeText={(x) => setN({ ...n, price: moneyInput(parseMoney(x)) })} keyboardType="numeric" placeholder="3.000.000" /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Deposit"><Input testID="nego-deposit-input" value={n.deposit} onChangeText={(x) => setN({ ...n, deposit: moneyInput(parseMoney(x)) })} keyboardType="numeric" placeholder="1.000.000" /></Field>
          </View>
        </View>
        <Field label="Lama kontrak">
          <View style={s.wrap}>
            {MONTH_OPTIONS.map((m) => (
              <Chip key={m} label={`${m} bulan`} active={n.months === m} onPress={() => setN({ ...n, months: m })} testID={`nego-months-${m}`} />
            ))}
          </View>
        </Field>
        <Field label="Dibayar tiap">
          <IntervalChips value={n.interval} onChange={(m) => setN({ ...n, interval: m })} prefix="nego" />
        </Field>
        <Field label="Komisi kamu (opsional)" hint="Hanya kamu yang lihat. Dijumlahkan di Laporan.">
          <Input testID="nego-commission-input" value={n.commission} onChangeText={(x) => setN({ ...n, commission: moneyInput(parseMoney(x)) })} keyboardType="numeric" placeholder="1.500.000" />
        </Field>
        <Field label="Catatan (opsional)">
          <Textarea testID="nego-note-input" value={n.note} onChangeText={(x) => setN({ ...n, note: x })} placeholder="mis. owner OK turun 200rb kalau 12 bulan" style={{ minHeight: 70 }} />
        </Field>
        <Button title="Simpan Negosiasi" onPress={() => save.mutate()} loading={save.isPending} testID="nego-save-button" />
        <RNText style={s.note}>Angka ini otomatis dipakai saat kamu tandai deal — nggak perlu ketik ulang.</RNText>
      </View>
    </Sheet>
  );
}

function DealSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const s = useStyles();
  const { units, loaded } = useOpenUnits();
  const t = lead.negotiation || {};
  const [d, setD] = useState({
    unit: t.unit_id || lead.matched_unit?.id || "",
    start: todayISO(),
    months: t.contract_months || 12,
    due: "10",
    rent: moneyInput(t.agreed_price ?? lead.matched_unit?.monthly_price),
    deposit: moneyInput(t.deposit),
    interval: t.payment_interval_months || 1,
    commission: moneyInput(t.commission),
  });
  const { celebrate } = useCelebrate();
  const save = useMutation({
    mutationFn: () =>
      api<any>(`/leads/${lead.id}/deal`, {
        method: "POST",
        body: {
          unit_id: d.unit || null, start_date: d.start, contract_months: d.months, due_day: parseInt(d.due || "10", 10) || 10,
          monthly_rent: parseMoney(d.rent), deposit: parseMoney(d.deposit), payment_interval_months: d.interval,
          commission: parseMoney(d.commission),
        },
      }),
    onSuccess: (r: any) => {
      onDone("Tenant baru tercatat dan tagihan dibuat ✓");
      celebrate(`Deal dengan ${lead.name}!`, "Tenant baru tercatat. Tagihannya sudah SewAIn buatkan.");
      router.push(`/tenant/${r.tenant_id}` as any);
    },
    onError: onErr,
  });
  return (
    <Sheet visible onClose={onClose} title={`Deal — ${lead.name} jadi tenant`} testID="deal-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        <Field label="Unit">
          <UnitChips units={units} loaded={loaded} value={d.unit} onPick={(u) => setD({ ...d, unit: u.id, rent: d.rent || moneyInput(u.monthly_price) })} prefix="deal" />
        </Field>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Sewa / bulan"><Input testID="deal-rent-input" value={d.rent} onChangeText={(x) => setD({ ...d, rent: moneyInput(parseMoney(x)) })} keyboardType="numeric" /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Deposit"><Input testID="deal-deposit-input" value={d.deposit} onChangeText={(x) => setD({ ...d, deposit: moneyInput(parseMoney(x)) })} keyboardType="numeric" /></Field>
          </View>
        </View>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Mulai sewa"><DateInput testID="deal-start-input" value={d.start} onChange={(x) => setD({ ...d, start: x })} /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Bayar tiap tanggal"><Input testID="deal-due-input" value={d.due} onChangeText={(x) => setD({ ...d, due: x.replace(/\D/g, "").slice(0, 2) })} keyboardType="numeric" /></Field>
          </View>
        </View>
        <Field label="Lama kontrak">
          <View style={s.wrap}>
            {MONTH_OPTIONS.map((m) => (
              <Chip key={m} label={`${m} bulan`} active={d.months === m} onPress={() => setD({ ...d, months: m })} testID={`deal-months-${m}`} />
            ))}
          </View>
        </Field>
        <Field label="Dibayar tiap">
          <IntervalChips value={d.interval} onChange={(m) => setD({ ...d, interval: m })} prefix="deal" />
        </Field>
        <Field label="Komisi kamu (opsional)">
          <Input testID="deal-commission-input" value={d.commission} onChangeText={(x) => setD({ ...d, commission: moneyInput(parseMoney(x)) })} keyboardType="numeric" placeholder="1.500.000" />
        </Field>
        <Button title="Jadikan Tenant" onPress={() => save.mutate()} loading={save.isPending} disabled={!d.unit} testID="deal-save-button" />
        <RNText style={s.note}>Unit jadi terisi, tagihan dibuat sesuai jadwal bayar, dan semua catatan prospek ikut pindah ke data tenant.</RNText>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.xl, maxWidth: 720, width: "100%", alignSelf: "center" },
  headerBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: colors.surfaceSecondary },
  stages: { flexDirection: "row", gap: 6 },
  stageBar: { height: 6, borderRadius: 3, backgroundColor: colors.border },
  stageLabel: { color: colors.muted, ...fonts.regular, fontSize: 12.5 },
  stageLabelActive: { color: colors.onSurface, ...fonts.semibold },
  kicker: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 14, marginBottom: 6 },
  stepText: { color: colors.onSurface, ...fonts.semibold, fontSize: 19, lineHeight: 26, letterSpacing: -0.2 },
  stepBtn: { marginTop: spacing.lg },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  reqs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  notes: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15.5, lineHeight: 23, marginTop: spacing.md },
  quote: { color: colors.onSurfaceSecondary, ...fonts.regular, fontStyle: "italic", fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  matchName: { color: colors.onSurface, ...fonts.bold, fontSize: 20 },
  suggestName: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  reasons: { color: colors.success, ...fonts.medium, fontSize: 13.5, marginTop: 8 },
  itemSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, flex: 1 },
  muted: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 21 },
  note: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 19 },
}));
