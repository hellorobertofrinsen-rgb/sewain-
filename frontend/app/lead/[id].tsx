import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { FollowupSheet } from "@/src/components/ActionSheets";
import { Button, Card, Chip, ErrorBox, Field, Input, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { INTEREST_LABEL, LEAD_STATUS, dateTimeLabel, relTime, rupiah, rupiahShort, todayISO } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme, withAlpha } from "@/src/theme";

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();

  const [followupOpen, setFollowupOpen] = useState(false);
  const [viewingOpen, setViewingOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [vUnitId, setVUnitId] = useState("");
  const [vDate, setVDate] = useState(todayISO(1));
  const [vTime, setVTime] = useState("14.00");
  const [dUnitId, setDUnitId] = useState("");
  const [dStart, setDStart] = useState(todayISO());
  const [dEnd, setDEnd] = useState("");
  const [dDue, setDDue] = useState("10");

  const { data: lead, isLoading, error, refetch } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => api<any>(`/leads/${id}`),
  });
  const { data: kosongUnits } = useQuery({
    queryKey: ["units", "kosong"],
    queryFn: () => api<any[]>("/units?status=kosong"),
    enabled: viewingOpen || dealOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lead", id] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["today"] });
    qc.invalidateQueries({ queryKey: ["units"] });
    qc.invalidateQueries({ queryKey: ["tenants"] });
    qc.invalidateQueries({ queryKey: ["impact"] });
  };

  const scheduleViewing = useMutation({
    mutationFn: () =>
      api("/viewings", {
        method: "POST",
        body: { lead_id: id, unit_id: vUnitId || lead?.matched_unit?.id, scheduled_at: `${vDate}T${vTime.replace(".", ":")}:00` },
      }),
    onSuccess: () => {
      invalidate();
      setViewingOpen(false);
      toast("Viewing dijadwalkan — tampilkan di Hari Ini ✓");
    },
    onError: (e: any) => toast(e?.message || "Gagal menjadwalkan", "error"),
  });

  const markDeal = useMutation({
    mutationFn: () =>
      api(`/leads/${id}/deal`, {
        method: "POST",
        body: { unit_id: dUnitId || lead?.matched_unit?.id || kosongUnits?.[0]?.id, start_date: dStart, end_date: dEnd || null, due_day: parseInt(dDue || "10", 10) || 10 },
      }),
    onSuccess: async (r: any) => {
      invalidate();
      toast("Deal! Tenant baru tercatat, unit jadi terisi ✓");
      router.replace(`/tenant/${r.tenant_id}` as any);
    },
    onError: (e: any) => toast(e?.message || "Gagal menandai deal", "error"),
  });

  const notInterested = useMutation({
    mutationFn: () => api(`/leads/${id}/not-interested`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast("Ditandai tidak jadi");
      router.back();
    },
  });

  if (isLoading) return <View style={s.root}><Spinner label="Memuat calon penyewa…" /></View>;
  if (error || !lead) return <View style={s.root}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>;

  const lowConf = typeof lead.confidence === "number" && lead.confidence < 0.6;

  return (
    <View style={s.root}>
      <ScreenHeader title={lead.name} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false} testID="lead-detail-screen">
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <StatusPill label={LEAD_STATUS[lead.status] || lead.status} tone={lead.status === "deal" ? "success" : lead.status === "perlu_followup" ? "warning" : "neutral"} testID="lead-status-pill" />
          <StatusPill label={INTEREST_LABEL[lead.interest] || lead.interest} tone={lead.interest === "high" ? "success" : "neutral"} testID="lead-interest-pill" />
          <StatusPill label={lead.source === "chat_import" ? "Dari chat WA" : "Manual"} tone="neutral" testID="lead-source-pill" />
          {lowConf ? <StatusPill label="Sewain kurang yakin — cek manual" tone="warning" testID="lead-low-confidence-pill" /> : null}
        </View>

        <Card>
          <Row label="Nomor HP" value={lead.phone || "-"} />
          <Row label="Budget" value={`${lead.budget_min ? rupiah(lead.budget_min) : "—"} — ${lead.budget_max ? rupiah(lead.budget_max) : "—"}`} />
          <Row label="Lokasi diinginkan" value={lead.preferred_location || "-"} />
          <Row label="Tipe unit" value={lead.unit_type || "-"} />
          <Row label="Move-in" value={lead.move_in_date || "-"} />
          <Row label="Jumlah orang" value={lead.occupants ? `${lead.occupants}` : "-"} last />
          {lead.requirements?.length ? (
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              <RNText style={s.rowLabel}>Kebutuhan</RNText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {lead.requirements.map((r: string, i: number) => (
                  <StatusPill key={i} label={r} tone="neutral" testID={`lead-requirement-${i}`} />
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {lead.ai_note || lead.summary ? (
          <Card style={{ borderColor: withAlpha(colors.info, 0.35) }}>
            <RNText style={s.aiTitle}>Catatan AI</RNText>
            <RNText style={s.aiBody}>{lead.summary || lead.ai_note}</RNText>
            {lead.quote ? <RNText style={s.quote}>“{lead.quote}”</RNText> : null}
            {lead.followup_reason ? <RNText style={s.followReason}>{lead.followup_reason}</RNText> : null}
          </Card>
        ) : null}

        {lead.matched_unit ? (
          <Card testID="matched-unit-card">
            <RNText style={s.matchKicker}>Cocok dengan</RNText>
            <RNText style={s.matchName}>{lead.matched_unit.name}</RNText>
            <RNText style={s.matchSub}>
              {lead.matched_unit.unit_type} · {rupiah(lead.matched_unit.monthly_price)} / bulan
            </RNText>
            {lead.match_reasons?.length ? (
              <View style={{ marginTop: spacing.md, gap: 4 }}>
                {lead.match_reasons.map((r: string, i: number) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <RNText style={s.checkMark}>✓</RNText>
                    <RNText style={s.checkText}>{r}</RNText>
                  </View>
                ))}
              </View>
            ) : null}
            <Button title="Lihat Unit" variant="ghost" size="sm" onPress={() => router.push(`/unit/${lead.matched_unit.id}` as any)} testID="lead-view-unit-button" style={{ marginTop: spacing.md, alignSelf: "flex-start" }} />
          </Card>
        ) : (
          <Card>
            <RNText style={s.matchKicker}>Kecocokan unit</RNText>
            <RNText style={s.aiBody}>Belum ada unit kosong yang cocok dengan kebutuhan {lead.name}.</RNText>
          </Card>
        )}

        {lead.viewings?.length ? (
          <View style={{ gap: spacing.md }}>
            <SectionTitle>Riwayat viewing</SectionTitle>
            {lead.viewings.map((v: any) => (
              <Card key={v.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <RNText style={s.itemSub}>Unit {v.unit_name} · {dateTimeLabel(v.scheduled_at)}</RNText>
                  <StatusPill label={v.status === "menunggu" ? "Menunggu" : v.status === "terjadwal" ? "Terjadwal" : v.status === "selesai" ? "Selesai" : "Batal"} tone={v.status === "selesai" ? "success" : v.status === "batal" ? "neutral" : "info"} testID={`lead-viewing-status-${v.id}`} />
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {lead.suggested_followup ? (
          <Card>
            <RNText style={s.aiTitle}>Saran pesan follow-up</RNText>
            <RNText style={s.aiBody}>{lead.suggested_followup}</RNText>
          </Card>
        ) : null}

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {lead.status !== "deal" && lead.status !== "tidak_jadi" ? (
            <>
              <Button title="Jadwalkan Viewing" onPress={() => { setViewingOpen(true); setVUnitId(lead.matched_unit?.id || ""); }} testID="lead-schedule-viewing-button" />
              <Button title="Tandai Deal" onPress={() => { setDealOpen(true); setDUnitId(lead.matched_unit?.id || ""); }} testID="lead-mark-deal-button" />
              <Button title="Buat Pesan Follow-up" variant="ghost" onPress={() => setFollowupOpen(true)} testID="lead-followup-button" />
              <Button title="Tandai Tidak Jadi" variant="ghost" onPress={() => notInterested.mutate()} testID="lead-not-interested-button" />
            </>
          ) : null}
        </View>
      </ScrollView>

      <FollowupSheet lead={followupOpen ? { id: lead.id, name: lead.name, suggested_followup: lead.suggested_followup, phone: lead.phone } : null} onClose={() => setFollowupOpen(false)} />

      <Sheet visible={viewingOpen} onClose={() => setViewingOpen(false)} title={`Viewing ${lead.name}`} testID="viewing-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Field label="Pilih unit">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(kosongUnits || []).map((u: any) => (
                <Chip key={u.id} label={`${u.name} · ${rupiahShort(u.monthly_price)}`} active={vUnitId === u.id} onPress={() => setVUnitId(u.id)} testID={`viewing-unit-${u.id}`} />
              ))}
              {(kosongUnits || []).length === 0 ? <RNText style={s.rowValue}>Tidak ada unit kosong saat ini.</RNText> : null}
            </View>
          </Field>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Tanggal (YYYY-MM-DD)">
                <Input testID="viewing-date-input" value={vDate} onChangeText={setVDate} placeholder={todayISO(1)} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Jam (mis. 14.00)">
                <Input testID="viewing-time-input" value={vTime} onChangeText={setVTime} placeholder="14.00" />
              </Field>
            </View>
          </View>
          <Button title="Simpan Viewing" onPress={() => scheduleViewing.mutate()} loading={scheduleViewing.isPending} testID="viewing-save-button" />
        </View>
      </Sheet>

      <Sheet visible={dealOpen} onClose={() => setDealOpen(false)} title={`Deal — ${lead.name} jadi tenant`} testID="deal-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Field label="Pilih unit">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(kosongUnits || []).map((u: any) => (
                <Chip key={u.id} label={`${u.name} · ${rupiahShort(u.monthly_price)}`} active={dUnitId === u.id} onPress={() => setDUnitId(u.id)} testID={`deal-unit-${u.id}`} />
              ))}
            </View>
          </Field>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Mulai (YYYY-MM-DD)">
                <Input testID="deal-start-input" value={dStart} onChangeText={setDStart} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Bayar tiap tanggal">
                <Input testID="deal-due-input" value={dDue} onChangeText={setDDue} keyboardType="numeric" />
              </Field>
            </View>
          </View>
          <Field label="Sampai (YYYY-MM-DD, opsional)">
            <Input testID="deal-end-input" value={dEnd} onChangeText={setDEnd} placeholder="kosongkan = 12 bulan" />
          </Field>
          <Button title={`Jadikan Tenant${dUnitId || lead.matched_unit?.id ? "" : ""}`} onPress={() => markDeal.mutate()} loading={markDeal.isPending} testID="deal-save-button" />
          <RNText style={s.note}>Unit otomatis berubah jadi TERISI dan tagihan bulanan langsung dibuat.</RNText>
        </View>
      </Sheet>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const s2 = useStyles2();
  return (
    <View style={[s2.row, !last && s2.rowBorder]}>
      <RNText style={s2.rowLabel}>{label}</RNText>
      <RNText style={s2.rowValue}>{value}</RNText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  aiTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 14, marginBottom: 6 },
  aiBody: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  quote: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontStyle: "italic", fontSize: 13.5, lineHeight: 20, marginTop: spacing.sm },
  followReason: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: spacing.md },
  matchKicker: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  matchName: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 20, marginTop: 4 },
  matchSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
  checkMark: { color: colors.success, fontFamily: fonts.semibold, fontSize: 13 },
  checkText: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: 13 },
  itemSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13 },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  rowLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  rowValue: { color: colors.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 13, textAlign: "right", flex: 1, marginLeft: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
}));

const useStyles2 = useStyles;
