import React, { useState } from "react";
import { Linking, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { LeaseSheet, LeaseTarget, ReminderSheet, ReminderTarget } from "@/src/components/ActionSheets";
import { Button, Card, ErrorBox, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { waLink } from "@/src/lib/messages";
import { dateLabel, leaseLeftLabel, periodLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme, withAlpha } from "@/src/theme";

export default function TenantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [remind, setRemind] = useState<ReminderTarget | null>(null);
  const [lease, setLease] = useState<LeaseTarget | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [showAllBills, setShowAllBills] = useState(false);

  const { data: tenant, isLoading, error, refetch } = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => api<any>(`/tenants/${id}`),
  });

  const invalidate = () => {
    for (const key of ["tenant", "tenants", "today", "units"]) qc.invalidateQueries({ queryKey: [key] });
  };

  const markPaid = useMutation({
    mutationFn: (pid: string) => api(`/payments/${pid}/mark-paid`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast("Lunas ✓"); },
    onError: (e: any) => toast(e?.message || "Gagal menandai lunas", "error"),
  });
  const markUnpaid = useMutation({
    mutationFn: (pid: string) => api(`/payments/${pid}/mark-unpaid`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast("Dikembalikan ke belum bayar"); },
  });
  const checkout = useMutation({
    mutationFn: () => api(`/tenants/${id}/checkout`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast("Checkout selesai — unit kembali kosong");
      router.back();
    },
    onError: (e: any) => toast(e?.message || "Gagal checkout", "error"),
  });

  if (isLoading) return <View style={s.root}><Spinner label="Memuat tenant…" /></View>;
  if (error || !tenant) return <View style={s.root}><ScreenHeader title="Tenant" /><ErrorBox message={(error as any)?.message || "Tidak ditemukan"} onRetry={refetch} /></View>;

  const active = tenant.status === "aktif";
  const pays: any[] = tenant.payments || [];
  const unpaid = pays.filter((p) => p.status !== "lunas");
  const outstanding = unpaid.filter((p) => p.days_late > 0).reduce((a, p) => a + (p.amount || 0), 0);
  // Show what matters: unpaid bills + the last 3 paid ones. The full history is one tap away.
  const visibleBills = showAllBills ? pays.slice().reverse() : [...unpaid, ...pays.filter((p) => p.status === "lunas").slice(-3).reverse()];
  const soon = tenant.days_left != null && tenant.days_left <= 30;
  const wa = waLink(tenant.phone);
  const ownerWa = waLink(tenant.owner?.phone);
  const h = tenant.history;

  return (
    <View style={s.root}>
      <ScreenHeader title={tenant.name} right={!active ? <StatusPill label="Checkout" tone="neutral" testID="tenant-checkout-pill" /> : null} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} showsVerticalScrollIndicator={false} testID="tenant-detail-screen">
        {/* Lease */}
        <Card testID="lease-card" style={soon && active ? { borderColor: withAlpha(colors.warning, 0.5) } : undefined}>
          <RNText style={s.kicker}>Kontrak · Unit {tenant.unit_name}</RNText>
          <RNText style={s.big}>{active ? leaseLeftLabel(tenant.days_left) : "Sudah checkout"}</RNText>
          <RNText style={s.muted}>
            {dateLabel(tenant.start_date + "T00:00:00")} — {tenant.end_date ? dateLabel(tenant.end_date + "T00:00:00") : "tanpa tanggal selesai"}
          </RNText>
          <View style={s.facts}>
            <Fact label="Sewa / bulan" value={rupiah(tenant.monthly_rent)} />
            <Fact label="Deposit" value={tenant.deposit ? rupiah(tenant.deposit) : "-"} />
            <Fact label="Bayar tgl" value={String(tenant.payment_due_day)} />
          </View>
          {active ? (
            <Button
              title={soon ? "Perpanjang / Kabari Tenant" : "Perpanjang Kontrak"}
              variant={soon ? "primary" : "ghost"}
              onPress={() => setLease({ id: tenant.id, name: tenant.name, unit_name: tenant.unit_name, end_date: tenant.end_date, days_left: tenant.days_left, phone: tenant.phone })}
              testID="tenant-extend-button"
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>

        {/* People */}
        <Card>
          <Person label="Tenant" name={tenant.name} phone={tenant.phone} wa={wa} testID="tenant-wa" />
          {tenant.owner ? (
            <>
              <View style={s.divider} />
              <Person label="Pemilik unit" name={tenant.owner.name || "-"} phone={tenant.owner.phone} wa={ownerWa} testID="owner-wa" />
            </>
          ) : null}
        </Card>

        {/* Bills */}
        <View style={{ gap: spacing.md }}>
          <View style={s.rowBetween}>
            <SectionTitle>Tagihan sewa</SectionTitle>
            {outstanding > 0 ? <RNText style={s.late}>Telat: {rupiah(outstanding)}</RNText> : null}
          </View>
          {visibleBills.map((p: any) => (
            <Card key={p.id} testID={`payment-card-${p.id}`}>
              <View style={s.rowBetween}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={s.period}>{periodLabel(p.period)}</RNText>
                  <RNText style={s.muted}>{rupiah(p.amount)} · jatuh tempo {dateLabel(p.due_date + "T00:00:00")}</RNText>
                </View>
                {p.status === "lunas" ? (
                  <Pressable onLongPress={() => markUnpaid.mutate(p.id)} testID={`payment-status-${p.id}`}>
                    <StatusPill label="LUNAS ✓" tone="success" />
                  </Pressable>
                ) : (
                  <StatusPill label={p.days_late > 0 ? `TELAT ${p.days_late} HR` : "BELUM BAYAR"} tone={p.days_late > 0 ? "error" : "warning"} testID={`payment-status-${p.id}`} />
                )}
              </View>
              {p.status !== "lunas" ? (
                <View style={s.actions}>
                  <Button title="Tandai Lunas" size="sm" onPress={() => markPaid.mutate(p.id)} testID={`payment-paid-${p.id}`} />
                  <Button
                    title="Ingatkan"
                    variant="ghost"
                    size="sm"
                    onPress={() => setRemind({ id: p.id, name: tenant.name, unit_name: tenant.unit_name, amount: p.amount, due_date: p.due_date, period: p.period, days_late: p.days_late, phone: tenant.phone })}
                    testID={`payment-remind-${p.id}`}
                  />
                </View>
              ) : null}
            </Card>
          ))}
          {pays.length > visibleBills.length || showAllBills ? (
            <Button title={showAllBills ? "Ringkas" : `Lihat semua ${pays.length} tagihan`} variant="ghost" size="sm" onPress={() => setShowAllBills(!showAllBills)} testID="bills-toggle" />
          ) : null}
        </View>

        {/* History from the lead journey */}
        {h ? (
          <Card testID="tenant-history-card" onPress={() => router.push(`/lead/${h.lead_id}` as any)}>
            <RNText style={s.kicker}>Riwayat sebelum jadi tenant</RNText>
            <RNText style={s.muted}>
              {[
                h.budget_max ? `Budget ${rupiah(h.budget_max)}` : null,
                h.unit_type,
                h.occupants ? `${h.occupants} orang` : null,
                h.viewings ? `${h.viewings}× viewing` : null,
              ].filter(Boolean).join(" · ") || "Dari calon penyewa"}
            </RNText>
            {h.requirements?.length ? <RNText style={s.muted}>Kebutuhan: {h.requirements.join(", ")}</RNText> : null}
            {h.notes ? <RNText style={s.note}>{h.notes}</RNText> : null}
            {h.negotiation_note ? <RNText style={s.note}>Nego: {h.negotiation_note}</RNText> : null}
          </Card>
        ) : null}

        {active ? <Button title="Proses Checkout" variant="danger" onPress={() => setCheckoutOpen(true)} testID="tenant-checkout-button" /> : null}
      </ScrollView>

      <ReminderSheet payment={remind} onClose={() => setRemind(null)} />
      <LeaseSheet tenant={lease} onClose={() => setLease(null)} />

      <Sheet visible={checkoutOpen} onClose={() => setCheckoutOpen(false)} title={`Checkout ${tenant.name}?`} testID="checkout-sheet">
        <RNText style={s.note}>
          Unit {tenant.unit_name} kembali KOSONG dan siap dicocokkan dengan calon penyewa baru. Tagihan bulan-bulan setelah hari ini dibatalkan; tagihan yang sudah telat tetap tercatat.
        </RNText>
        <Button title="Ya, Proses Checkout" variant="danger" onPress={() => checkout.mutate()} loading={checkout.isPending} testID="checkout-confirm-button" style={{ marginTop: spacing.lg }} />
      </Sheet>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <RNText style={s.factLabel}>{label}</RNText>
      <RNText style={s.factValue}>{value}</RNText>
    </View>
  );
}

function Person({ label, name, phone, wa, testID }: { label: string; name: string; phone?: string | null; wa: string | null; testID: string }) {
  const s = useStyles();
  return (
    <View style={s.rowBetween}>
      <View style={{ flex: 1 }}>
        <RNText style={s.factLabel}>{label}</RNText>
        <RNText style={s.period}>{name}</RNText>
        {phone ? <RNText style={s.muted}>{phone}</RNText> : null}
      </View>
      {wa ? <Button title="WhatsApp" variant="ghost" size="sm" icon="phone" onPress={() => Linking.openURL(wa)} testID={testID} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: "100%", alignSelf: "center" },
  kicker: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  big: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.3 },
  muted: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  note: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  facts: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  factLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  factValue: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  period: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  late: { color: colors.error, fontFamily: fonts.semibold, fontSize: 13 },
  actions: { flexDirection: "row", gap: 8, marginTop: spacing.md },
}));
