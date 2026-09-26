import React, { useState } from "react";
import { Linking, ScrollView, Switch, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { STATE_TRANSITION } from "@/src/motion";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { PhotoAvatar } from "@/src/components/PhotoAvatar";
import { Sheet } from "@/src/components/Sheet";
import { Icon } from "@/src/components/Icon";
import { DateInput } from "@/src/components/DateInput";
import { FollowupSheet } from "@/src/components/ActionSheets";
import { LeadForm, LeadFormValue, formToBody, leadFormValid, leadToForm } from "@/src/components/LeadForm";
import { Button, Card, Chip, ErrorBox, Field, Input, ListGroup, ListRow, SectionTitle, Spinner, StatusPill, PressableScale } from "@/src/components/ui";
import { useCelebrate } from "@/src/components/Celebrate";
import { CalendarActions } from "@/src/components/CalendarActions";
import { t } from "@/src/lib/i18n";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { googleCalendarLink, viewingInviteMessage, waLink } from "@/src/lib/messages";
import { VIEWING_STATUS, dateLabel, dateTimeLabel, dueDayOk, mainPrice, moneyInput, parseMoney, rupiah, todayISO, typeMoney, expiredLabel } from "@/src/lib/format";
import { lookingFor, prefSummary, unitKind } from "@/src/lib/unitKinds";
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
    if (!e?.code) toast(e?.message || t("Gagal. Coba lagi."), "error");
  };

  const pickUnit = useMutation({
    mutationFn: (unitId: string | null) => api(`/leads/${id}`, { method: "PATCH", body: { matched_unit_id: unitId } }),
    onSuccess: () => { invalidate(); toast(t("Unit dipilih ✓")); },
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
    onSuccess: () => { invalidate(); setSheet(null); toast(t("Ditandai tidak jadi")); },
    onError: onErr,
  });
  const reopen = useMutation({
    mutationFn: () => api(`/leads/${id}/reopen`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast(t("Prospek aktif lagi")); },
    onError: onErr,
  });

  if (isLoading) return <View style={s.root}><Spinner label={t("Memuat prospek…")} /></View>;
  if (error || !lead) return <View style={s.root}><ScreenHeader embedded={embedded} title={t("Prospek")} /><ErrorBox message={(error as any)?.message || t("Tidak ditemukan")} onRetry={refetch} /></View>;

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
          <PressableScale testID="lead-edit-button" onPress={() => setSheet("edit")} style={s.headerBtn} accessibilityLabel={t("Edit")}>
            <Icon name="pencil" size={18} color={colors.onSurfaceSecondary} />
          </PressableScale>
        }
      />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: (embedded ? 0 : insets.bottom) + spacing.xxxl }]} showsVerticalScrollIndicator={false} testID="lead-detail-screen">
        <View style={s.person}>
          <PhotoAvatar name={lead.name} photo={lead.photo} path={`/leads/${lead.id}`} testID="lead-photo" refresh={["lead", "leads", "today"]} />
          <View style={{ flex: 1, gap: 4 }}>
            <RNText style={s.personName} numberOfLines={2}>{lead.name}</RNText>
            {lead.interest === "high" ? <View style={{ flexDirection: "row" }}><StatusPill label={t("Hot Buyer")} tone="error" testID="lead-detail-hot" /></View> : null}
            {lookingFor(lead) ? <RNText style={s.muted}>{lookingFor(lead)}</RNText> : null}
          </View>
        </View>
        {/* Stage */}
        {status === "tidak_jadi" ? (
          <StatusPill label={t("Tidak jadi")} tone="neutral" testID="lead-status-pill" />
        ) : (
          <View style={s.stages} testID="lead-stages">
            {STAGES.map((st, i) => (
              <View key={st.key} style={{ flex: 1, gap: 6 }}>
                <Animated.View style={[STATE_TRANSITION, s.stageBar, i <= stage && { backgroundColor: status === "deal" ? colors.success : colors.brandPrimary }]} />
                <RNText style={[s.stageLabel, i === stage && s.stageLabelActive]}>{t(st.label)}</RNText>
              </View>
            ))}
          </View>
        )}

        {/* Next step */}
        <Card testID="next-step-card">
          {status === "deal" ? (
            <>
              <RNText style={s.kicker}>{t("Sudah jadi tenant")}</RNText>
              <RNText style={s.stepText}>{lead.matched_unit ? t("{name} sudah menyewa unit {unit}. Tagihan & kontraknya ada di halaman tenant.", { name: lead.name, unit: lead.matched_unit.name }) : t("{name} sudah menyewa unit. Tagihan & kontraknya ada di halaman tenant.", { name: lead.name })}</RNText>
              {lead.tenant_id ? <Button title={t("Lihat Tenant")} onPress={() => router.push(`/tenant/${lead.tenant_id}` as any)} testID="lead-open-tenant" style={s.stepBtn} /> : null}
            </>
          ) : status === "tidak_jadi" ? (
            <>
              <RNText style={s.stepText}>{t("Prospek ini ditandai tidak jadi.")}</RNText>
              <Button title={t("Aktifkan Lagi")} variant="ghost" onPress={() => reopen.mutate()} loading={reopen.isPending} testID="lead-reopen" style={s.stepBtn} />
            </>
          ) : status === "negotiation" ? (
            <>
              <RNText style={s.kicker}>{t("Negosiasi")}</RNText>
              <RNText style={s.stepText}>
                {[nego?.agreed_price ? `${rupiah(nego.agreed_price)}${t("/bulan")}` : null, nego?.contract_months ? t("{n} bulan", { n: nego.contract_months }) : null, nego?.deposit ? t("deposit {amount}", { amount: rupiah(nego.deposit) }) : null]
                  .filter(Boolean)
                  .join(" · ") || t("Belum ada angka yang disepakati.")}
              </RNText>
              {nego?.note ? <RNText style={s.muted}>{nego.note}</RNText> : null}
              <Button title={t("Deal — Jadikan Tenant")} onPress={() => setSheet("deal")} testID="lead-mark-deal-button" style={s.stepBtn} />
              <View style={s.row}>
                <Button title={t("Ubah Nego")} variant="ghost" size="sm" onPress={() => setSheet("negotiation")} testID="lead-edit-nego" />
                <Button title={t("Follow-up")} variant="ghost" size="sm" onPress={() => setSheet("followup")} testID="lead-followup-button" />
              </View>
            </>
          ) : status === "viewing" ? (
            <>
              <RNText style={s.kicker}>{t("Viewing")}</RNText>
              <RNText style={s.stepText}>
                {upcoming ? `${t("Unit {name}", { name: upcoming.unit_name })} · ${dateTimeLabel(upcoming.scheduled_at)}` : t("Sudah viewing. Lanjut negosiasi kalau cocok.")}
              </RNText>
              {upcoming?.location ? <RNText style={s.muted}>{upcoming.location}</RNText> : null}
              {upcoming ? <InviteButtons lead={lead} viewing={upcoming} /> : null}
              <Button title={t("Lanjut Negosiasi")} variant={upcoming ? "ghost" : "primary"} onPress={() => setSheet("negotiation")} testID="lead-start-nego" style={s.stepBtn} />
              <View style={s.row}>
                <Button title={t("Follow-up")} variant="ghost" size="sm" onPress={() => setSheet("followup")} testID="lead-followup-button" />
                <Button title={t("Viewing Lain")} variant="ghost" size="sm" onPress={() => setSheet("viewing")} testID="lead-another-viewing" />
              </View>
            </>
          ) : (
            <>
              <RNText style={s.kicker}>{t("Langkah berikutnya")}</RNText>
              <RNText style={s.stepText}>
                {lead.next_followup_date ? t("Follow-up dijadwalkan {date}.", { date: dateLabel(lead.next_followup_date + "T00:00:00") }) : lead.matched_unit ? t("Tawarkan unit {name} dan ajak viewing.", { name: lead.matched_unit.name }) : t("Kabari dan tanyakan kebutuhannya.")}
              </RNText>
              <Button title={t("Jadwalkan Viewing")} icon="calendar-check" onPress={() => setSheet("viewing")} testID="lead-schedule-viewing-button" style={s.stepBtn} />
              <View style={s.row}>
                <Button title={t("Follow-up")} icon="whatsapp" variant="ghost" size="sm" onPress={() => setSheet("followup")} testID="lead-followup-button" />
                <Button title={t("Langsung Nego")} variant="ghost" size="sm" onPress={() => setSheet("negotiation")} testID="lead-direct-nego" />
              </View>
            </>
          )}
        </Card>

        {/* Profile */}
        <ListGroup title={t("Profil")} testID="lead-profile">
          <ListRow
            label={t("Hot Buyer")}
            sub={t("Tandai kalau prospek ini serius dan siap sewa.")}
            icon="zap"
            tone="error"
            right={<Switch testID="lead-hot-toggle" value={lead.interest === "high"} onValueChange={(v) => setHot.mutate(v)} trackColor={{ false: colors.borderStrong, true: colors.error }} thumbColor="#FFFFFF" />}
          />
          {lead.phone ? (
            <ListRow label={t("WhatsApp")} value={lead.phone} icon="whatsapp" tone="success" onPress={wa ? () => Linking.openURL(wa) : undefined} testID="lead-phone-row" />
          ) : null}
          <ListRow label={t("Preferensi")} value={prefSummary(lead) || "-"} icon="building" tone="info" testID="lead-pref-row" />
          {/* Older prospects may still carry these. */}
          {lead.budget_max || lead.budget_min ? <ListRow label={t("Budget")} value={`${rupiah(lead.budget_max || lead.budget_min)}${t("/bulan")}`} icon="wallet" tone="brand" /> : null}
          {lead.preferred_location ? <ListRow label={t("Lokasi")} value={lead.preferred_location} icon="globe" tone="neutral" /> : null}
          {expiredLabel(lead.move_in_date) ? <ListRow label={t("Expired")} value={expiredLabel(lead.move_in_date)!.replace("Expired ", "")} icon="calendar-check" tone="warning" /> : null}
          {lead.occupants ? <ListRow label={t("Jumlah orang")} value={`${lead.occupants}`} icon="users" tone="neutral" /> : null}
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
            <SectionTitle>{t("Unit yang cocok")}</SectionTitle>
            {lead.matched_unit ? (
              <Card testID="matched-unit-card" onPress={() => router.push(`/unit/${lead.matched_unit.id}` as any)}>
                <View style={s.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <RNText style={s.matchName}>{lead.matched_unit.name}</RNText>
                    <RNText style={s.muted}>{[unitKind(lead.matched_unit), mainPrice(lead.matched_unit, { m: t("/bulan"), d: t("/hari"), y: t("/tahun") })].filter(Boolean).join(" · ")}</RNText>
                  </View>
                  <StatusPill label={t("Dipilih")} tone="success" testID="matched-pill" />
                  <Icon name="chevron-right" size={18} color={colors.brandPrimary} />
                </View>
                {lead.match_reasons?.length ? <RNText style={s.reasons}>✓ {lead.match_reasons.map((r: string) => t(r)).join("  ✓ ")}</RNText> : null}
              </Card>
            ) : null}
            {(lead.suggestions || []).filter((x: any) => x.unit.id !== lead.matched_unit?.id).map((x: any) => (
              <Card key={x.unit.id} testID={`suggestion-${x.unit.id}`}>
                <View style={s.rowBetween}>
                  <PressableScale style={{ flex: 1 }} role="link" onPress={() => router.push(`/unit/${x.unit.id}` as any)}>
                    <RNText style={s.suggestName}>{x.unit.name} <RNText style={{ color: colors.brandPrimary }}>›</RNText></RNText>
                    <RNText style={s.muted}>{[unitKind(x.unit), mainPrice(x.unit, { m: t("/bulan"), d: t("/hari"), y: t("/tahun") })].filter(Boolean).join(" · ")}</RNText>
                    <RNText style={s.reasons}>✓ {x.reasons.map((r: string) => t(r)).join("  ✓ ")}</RNText>
                  </PressableScale>
                  <Button title={t("Pilih")} variant="ghost" size="sm" onPress={() => pickUnit.mutate(x.unit.id)} testID={`pick-unit-${x.unit.id}`} />
                </View>
              </Card>
            ))}
            {!lead.matched_unit && !(lead.suggestions || []).length ? (
              <Card><RNText style={s.muted}>{t("Belum ada unit kosong yang cocok. Lengkapi budget & tipe, atau tambah unit baru.")}</RNText></Card>
            ) : null}
          </View>
        ) : null}

        {lead.viewings?.length ? (
          <View style={{ gap: spacing.md }}>
            <SectionTitle>{t("Riwayat viewing")}</SectionTitle>
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
            <RNText style={s.kicker}>{t("Pesan terakhir dikirim")}</RNText>
            <RNText style={s.notes}>{lead.last_message}</RNText>
          </Card>
        ) : null}

        {!closed ? <Button title={t("Tandai Tidak Jadi")} variant="danger" onPress={() => setSheet("lost")} testID="lead-not-interested-button" /> : null}
      </ScrollView>

      <FollowupSheet lead={sheet === "followup" ? followTarget : null} onClose={() => setSheet(null)} />

      {sheet === "edit" ? <EditSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}
      {sheet === "viewing" ? <ViewingSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}
      {sheet === "negotiation" && !closed ? <NegotiationSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}
      {sheet === "deal" && !closed ? <DealSheet lead={lead} onClose={() => setSheet(null)} onDone={done} onErr={onErr} /> : null}

      <Sheet visible={sheet === "lost"} onClose={() => setSheet(null)} title={t("{name} tidak jadi?", { name: lead.name })} testID="lost-sheet">
        <View style={{ gap: spacing.md }}>
          <Field label={t("Alasannya? (membantu lihat pola di Laporan)")}>
            <View style={s.wrap}>
              {LOST_REASONS.map((r) => (
                <Chip key={r} label={t(r)} active={lostReason === r} onPress={() => setLostReason(lostReason === r ? null : r)} testID={`lost-reason-${LOST_REASONS.indexOf(r)}`} />
              ))}
            </View>
          </Field>
          <RNText style={s.note}>{t("Prospek dipindah ke “Tidak jadi” dan tidak dihitung sebagai prospek aktif. Bisa diaktifkan lagi kapan saja.")}</RNText>
          <Button title={t("Ya, Tidak Jadi")} variant="danger" onPress={() => markLost.mutate()} loading={markLost.isPending} testID="lost-confirm-button" />
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
        <Chip key={it.m} label={t(it.label)} active={value === it.m} onPress={() => onChange(it.m)} testID={`${prefix}-interval-${it.m}`} />
      ))}
    </View>
  );
}

/** Add to Google Calendar first; then it splits into [Batal] [Undang Viewing] (WhatsApp). */
function InviteButtons({ lead, viewing, compact }: { lead: any; viewing: any; compact?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const info = { name: lead.name, phone: lead.phone, unit_name: viewing.unit_name, location: viewing.location, scheduled_at: viewing.scheduled_at, units: viewing.units };
  const wa = waLink(lead.phone, viewingInviteMessage(info));
  const refresh = () => {
    for (const key of ["lead", "leads", "today"]) qc.invalidateQueries({ queryKey: [key] });
  };
  const mark = useMutation({ mutationFn: () => api(`/viewings/${viewing.id}/calendar`, { method: "POST" }), onSuccess: refresh });
  const cancel = useMutation({
    mutationFn: () => api(`/viewings/${viewing.id}/cancel`, { method: "POST" }),
    onSuccess: () => { refresh(); toast(t("Viewing dibatalkan")); },
    onError: (e: any) => toast(e?.message || t("Gagal. Coba lagi."), "error"),
  });
  return (
    <View style={{ marginTop: compact ? spacing.sm : spacing.md }}>
      <CalendarActions
        added={!!viewing.calendar_added}
        onAdd={() => {
          Linking.openURL(googleCalendarLink(info)); // inside the tap, so it isn't blocked as a pop-up
          mark.mutate();
        }}
        onCancel={() => cancel.mutate()}
        cancelLabel={t("Batal")}
        primaryLabel={t("Undang Viewing")}
        onPrimary={wa ? () => Linking.openURL(wa) : null}
        size={compact ? "sm" : "md"}
        testID={`viewing-cal-${viewing.id}`}
      />
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
        <Chip key={u.id} label={[u.name, mainPrice(u, { m: t("/bulan"), d: t("/hari"), y: t("/tahun") })].filter(Boolean).join(" · ")} active={value === u.id} onPress={() => onPick(u)} testID={`${prefix}-unit-${u.id}`} />
      ))}
      {loaded && units.length === 0 ? (
        <View style={{ gap: spacing.sm }}>
          <RNText style={s.muted}>{t("Belum ada unit yang bisa dipilih. Tambah unit dulu.")}</RNText>
          <Button title={t("Tambah Unit")} icon="plus" variant="secondary" size="sm" onPress={() => router.push("/units?add=1" as any)} testID={`${prefix}-add-unit`} />
        </View>
      ) : null}
    </View>
  );
}

function EditSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const [f, setF] = useState<LeadFormValue>(() => leadToForm(lead));
  const save = useMutation({
    mutationFn: () => api(`/leads/${lead.id}`, { method: "PATCH", body: formToBody(f) }),
    onSuccess: () => onDone(t("Tersimpan ✓")),
    onError: onErr,
  });
  return (
    <Sheet visible onClose={onClose} title={t("Edit {name}", { name: lead.name })} testID="lead-edit-sheet" scroll>
      <View style={{ gap: spacing.lg }}>
        <LeadForm value={f} onChange={setF} />
        <Button title={t("Simpan")} onPress={() => save.mutate()} loading={save.isPending} disabled={!leadFormValid(f)} testID="lead-edit-save" />
      </View>
    </Sheet>
  );
}

function ViewingSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const s = useStyles();
  const { units, loaded } = useOpenUnits();
  const [picked, setPicked] = useState<string[]>(() => (lead.matched_unit?.id ? [lead.matched_unit.id] : []));
  const [v, setV] = useState({ date: todayISO(1), time: "14:00" });
  const save = useMutation({
    mutationFn: () => api("/viewings", { method: "POST", body: { lead_id: lead.id, unit_ids: picked, scheduled_at: `${v.date}T${v.time}:00` } }),
    onSuccess: () => onDone(t("Viewing dijadwalkan. Tambahkan ke kalender, lalu undang prospeknya.")),
    onError: onErr,
  });
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id]));
  return (
    <Sheet visible onClose={onClose} title={t("Viewing {name}", { name: lead.name })} testID="viewing-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        <Field label={t("Unit yang dilihat")} hint={loaded && units.length ? t("Pilih setidaknya 1 unit. Bisa lebih dari satu.") : undefined}>
          <View style={s.wrap}>
            {units.map((u: any) => (
              <Chip
                key={u.id}
                check
                label={[u.name, unitKind(u)].filter(Boolean).join(" · ")}
                active={picked.includes(u.id)}
                onPress={() => toggle(u.id)}
                testID={`viewing-unit-${u.id}`}
              />
            ))}
          </View>
          {loaded && units.length === 0 ? (
            <View style={{ gap: spacing.sm }}>
              <RNText style={s.muted}>{t("Belum ada unit yang bisa dilihat. Tambah unit dulu.")}</RNText>
              <Button title={t("Tambah Unit")} icon="plus" variant="secondary" size="sm" onPress={() => { onClose(); router.push("/units?add=1" as any); }} testID="viewing-add-unit" />
            </View>
          ) : null}
        </Field>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label={t("Tanggal")}><DateInput testID="viewing-date-input" value={v.date} onChange={(x) => setV({ ...v, date: x })} /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Jam")}><DateInput mode="time" testID="viewing-time-input" value={v.time} onChange={(x) => setV({ ...v, time: x })} /></Field>
          </View>
        </View>
        <Button title={t("Simpan Viewing")} onPress={() => save.mutate()} loading={save.isPending} disabled={!picked.length || !v.date || !v.time} testID="viewing-save-button" />
      </View>
    </Sheet>
  );
}

function NegotiationSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const s = useStyles();
  const { units, loaded } = useOpenUnits();
  const tn = lead.negotiation || {};
  const [n, setN] = useState({
    unit: tn.unit_id || lead.matched_unit?.id || "",
    price: moneyInput(tn.agreed_price ?? lead.matched_unit?.monthly_price),
    deposit: tn.deposit != null ? typeMoney(String(tn.deposit)) : "",
    months: tn.contract_months || 12,
    interval: tn.payment_interval_months || 1,
    commission: tn.commission != null ? typeMoney(String(tn.commission)) : "",
  });
  const ready = !!n.unit && !!parseMoney(n.price) && n.deposit !== "";
  const save = useMutation({
    mutationFn: () =>
      api(`/leads/${lead.id}/negotiation`, {
        method: "POST",
        body: {
          unit_id: n.unit || null, agreed_price: parseMoney(n.price), deposit: parseMoney(n.deposit), contract_months: n.months,
          payment_interval_months: n.interval, commission: parseMoney(n.commission),
        },
      }),
    onSuccess: () => onDone(t("Negosiasi tersimpan ✓")),
    onError: onErr,
  });
  return (
    <Sheet visible onClose={onClose} title={t("Negosiasi {name}", { name: lead.name })} testID="negotiation-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        <Field label={t("Unit")}>
          <UnitChips units={units} loaded={loaded} value={n.unit} onPick={(u) => setN({ ...n, unit: u.id, price: n.price || moneyInput(u.monthly_price) })} prefix="nego" />
        </Field>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label={t("Harga disepakati / bulan")}><Input testID="nego-price-input" value={n.price} onChangeText={(x) => setN({ ...n, price: typeMoney(x) })} keyboardType="numeric" placeholder="3.000.000" /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Deposit")}><Input testID="nego-deposit-input" value={n.deposit} onChangeText={(x) => setN({ ...n, deposit: typeMoney(x) })} keyboardType="numeric" placeholder="1.000.000" /></Field>
          </View>
        </View>
        <Field label={t("Lama kontrak")}>
          <View style={s.wrap}>
            {MONTH_OPTIONS.map((m) => (
              <Chip key={m} label={t("{n} bulan", { n: m })} active={n.months === m} onPress={() => setN({ ...n, months: m })} testID={`nego-months-${m}`} />
            ))}
          </View>
        </Field>
        <Field label={t("Dibayar tiap")}>
          <IntervalChips value={n.interval} onChange={(m) => setN({ ...n, interval: m })} prefix="nego" />
        </Field>
        <Field label={t("Komisi kamu (opsional)")} hint={t("Hanya kamu yang lihat.")}>
          <Input testID="nego-commission-input" value={n.commission} onChangeText={(x) => setN({ ...n, commission: typeMoney(x) })} keyboardType="numeric" placeholder="1.500.000" />
        </Field>
        <Button title={t("Simpan Negosiasi")} onPress={() => save.mutate()} loading={save.isPending} disabled={!ready} testID="nego-save-button" />
        <RNText style={s.note}>{t("Angka ini otomatis dipakai saat kamu tandai deal — nggak perlu ketik ulang.")}</RNText>
      </View>
    </Sheet>
  );
}

function DealSheet({ lead, onClose, onDone, onErr }: SheetProps) {
  const s = useStyles();
  const { units, loaded } = useOpenUnits();
  const tn = lead.negotiation || {};
  const [d, setD] = useState({
    unit: tn.unit_id || lead.matched_unit?.id || "",
    start: todayISO(),
    months: tn.contract_months || 12,
    due: "10",
    rent: moneyInput(tn.agreed_price ?? lead.matched_unit?.monthly_price),
    deposit: tn.deposit != null ? typeMoney(String(tn.deposit)) : "",
    interval: tn.payment_interval_months || 1,
    commission: tn.commission != null ? typeMoney(String(tn.commission)) : "",
  });
  const ready = !!d.unit && !!parseMoney(d.rent) && d.deposit !== "" && !!d.start && dueDayOk(d.due);
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
      onDone(t("Tenant baru tercatat dan tagihan dibuat ✓"));
      celebrate(t("Deal dengan {name}!", { name: lead.name }), t("Tenant baru tercatat. Tagihannya sudah SewAIn buatkan."));
      router.push(`/tenant/${r.tenant_id}` as any);
    },
    onError: onErr,
  });
  return (
    <Sheet visible onClose={onClose} title={t("Deal — {name} jadi tenant", { name: lead.name })} testID="deal-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        <Field label={t("Unit")}>
          <UnitChips units={units} loaded={loaded} value={d.unit} onPick={(u) => setD({ ...d, unit: u.id, rent: d.rent || moneyInput(u.monthly_price) })} prefix="deal" />
        </Field>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label={t("Sewa / bulan")}><Input testID="deal-rent-input" value={d.rent} onChangeText={(x) => setD({ ...d, rent: typeMoney(x) })} keyboardType="numeric" /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Deposit")}><Input testID="deal-deposit-input" value={d.deposit} onChangeText={(x) => setD({ ...d, deposit: typeMoney(x) })} keyboardType="numeric" /></Field>
          </View>
        </View>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label={t("Mulai sewa")}><DateInput testID="deal-start-input" value={d.start} onChange={(x) => setD({ ...d, start: x })} /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Bayar tiap tanggal")}><Input testID="deal-due-input" value={d.due} onChangeText={(x) => setD({ ...d, due: x.replace(/\D/g, "").slice(0, 2) })} keyboardType="numeric" /></Field>
          </View>
        </View>
        <Field label={t("Lama kontrak")}>
          <View style={s.wrap}>
            {MONTH_OPTIONS.map((m) => (
              <Chip key={m} label={t("{n} bulan", { n: m })} active={d.months === m} onPress={() => setD({ ...d, months: m })} testID={`deal-months-${m}`} />
            ))}
          </View>
        </Field>
        <Field label={t("Dibayar tiap")}>
          <IntervalChips value={d.interval} onChange={(m) => setD({ ...d, interval: m })} prefix="deal" />
        </Field>
        <Field label={t("Komisi kamu (opsional)")} hint={t("Hanya kamu yang lihat.")}>
          <Input testID="deal-commission-input" value={d.commission} onChangeText={(x) => setD({ ...d, commission: typeMoney(x) })} keyboardType="numeric" placeholder="1.500.000" />
        </Field>
        <Button title={t("Jadikan Tenant")} onPress={() => save.mutate()} loading={save.isPending} disabled={!ready} testID="deal-save-button" />
        <RNText style={s.note}>{t("Unit jadi terisi, tagihan dibuat sesuai jadwal bayar, dan semua catatan prospek ikut pindah ke data tenant.")}</RNText>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  personName: { color: colors.onSurface, ...fonts.bold, fontSize: 22, letterSpacing: -0.3 },
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
