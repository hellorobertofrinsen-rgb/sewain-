import React, { useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { LeaseSheet, LeaseTarget, ReminderSheet, ReminderTarget } from "@/src/components/ActionSheets";
import { Button, Card, ErrorBox, ListGroup, ListRow, SectionTitle, Spinner, StatusPill, PressableScale } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { leaseRenewalMessage, waLink } from "@/src/lib/messages";
import { dateLabel, leaseLeftLabel, periodLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme, withAlpha } from "@/src/theme";

export default function TenantDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TenantDetail id={id} />;
}

/** Also rendered inline in the desktop split view (embedded). */
export function TenantDetail({ id, embedded, onGone }: { id: string; embedded?: boolean; onGone?: () => void }) {
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
      if (embedded) onGone?.();
      else router.back();
    },
    onError: (e: any) => toast(e?.message || "Gagal checkout", "error"),
  });

  if (isLoading) return <View style={s.root}><Spinner label="Memuat tenant…" /></View>;
  if (error || !tenant) return <View style={s.root}><ScreenHeader embedded={embedded} title="Tenant" /><ErrorBox message={(error as any)?.message || "Tidak ditemukan"} onRetry={refetch} /></View>;

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
      <ScreenHeader embedded={embedded} title={tenant.name} right={!active ? <StatusPill label="Checkout" tone="neutral" testID="tenant-checkout-pill" /> : null} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: (embedded ? 0 : insets.bottom) + spacing.xxxl }]} showsVerticalScrollIndicator={false} testID="tenant-detail-screen">
        {/* Lease */}
        <Card testID="lease-card" style={soon && active ? { borderWidth: 1.5, borderColor: withAlpha(colors.warning, 0.5) } : undefined}>
          <RNText style={s.kicker}>Kontrak · Unit {tenant.unit_name}</RNText>
          <RNText style={s.big}>{active ? leaseLeftLabel(tenant.days_left) : "Sudah checkout"}</RNText>
          <RNText style={s.muted}>
            {dateLabel(tenant.start_date + "T00:00:00")} — {tenant.end_date ? dateLabel(tenant.end_date + "T00:00:00") : "tanpa tanggal selesai"}
          </RNText>
          <View style={s.facts}>
            <Fact label="Sewa / bulan" value={rupiah(tenant.monthly_rent)} />
            <Fact label="Dibayar" value={INTERVAL_LABEL[tenant.payment_interval_months || 1] || `${tenant.payment_interval_months} bulan`} />
            <Fact label="Tanggal bayar" value={String(tenant.payment_due_day)} />
          </View>
          {active && wa && tenant.end_date ? (
            <Button
              title="Follow-up Extend"
              icon="whatsapp"
              onPress={() => Linking.openURL(waLink(tenant.phone, leaseRenewalMessage({ name: tenant.name, unit_name: tenant.unit_name, end_date: tenant.end_date }))!)}
              testID="tenant-followup-extend"
              style={{ marginTop: spacing.md }}
            />
          ) : null}
          {active ? (
            <Button
              title="Catat Perpanjangan"
              variant="ghost"
              onPress={() => setLease({ id: tenant.id, name: tenant.name, unit_name: tenant.unit_name, end_date: tenant.end_date, days_left: tenant.days_left, phone: tenant.phone })}
              testID="tenant-extend-button"
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>

        {/* People */}
        <ListGroup title="Orang" testID="tenant-people">
          <ListRow
            label={tenant.name}
            sub={`Tenant${tenant.phone ? ` · ${tenant.phone}` : ""}`}
            icon="key"
            tone="success"
            right={wa ? <Button title="WhatsApp" icon="whatsapp" variant="secondary" size="sm" onPress={() => Linking.openURL(wa)} testID="tenant-wa" /> : undefined}
          />
          {tenant.owner ? (
            <ListRow
              label={tenant.owner.name || "Pemilik"}
              sub={`Pemilik unit${tenant.owner.phone ? ` · ${tenant.owner.phone}` : ""}`}
              icon="user"
              tone="brand"
              right={ownerWa ? <Button title="WhatsApp" icon="whatsapp" variant="secondary" size="sm" onPress={() => Linking.openURL(ownerWa)} testID="owner-wa" /> : undefined}
            />
          ) : null}
          <ListRow label="Deposit" value={tenant.deposit ? rupiah(tenant.deposit) : "-"} icon="shield" tone="neutral" />
          {tenant.commission ? <ListRow label="Komisi kamu" value={rupiah(tenant.commission)} icon="trending-up" tone="brand" /> : null}
        </ListGroup>

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
                  <RNText style={s.period}>{periodLabel(p.period, p.months || 1)}</RNText>
                  <RNText style={s.muted}>{rupiah(p.amount)}{(p.months || 1) > 1 ? ` (${p.months} bulan)` : ""} · jatuh tempo {dateLabel(p.due_date + "T00:00:00")}</RNText>
                </View>
                {p.status === "lunas" ? (
                  <PressableScale onLongPress={() => markUnpaid.mutate(p.id)} testID={`payment-status-${p.id}`}>
                    <StatusPill label="Lunas" tone="success" />
                  </PressableScale>
                ) : (
                  <StatusPill label={p.days_late > 0 ? `Telat ${p.days_late} hari` : "Belum bayar"} tone={p.days_late > 0 ? "error" : "warning"} testID={`payment-status-${p.id}`} />
                )}
              </View>
              {p.status !== "lunas" ? (
                <View style={s.actions}>
                  <Button title="Tandai Lunas" size="sm" onPress={() => markPaid.mutate(p.id)} testID={`payment-paid-${p.id}`} />
                  <Button
                    title="Ingatkan"
                    variant="ghost"
                    size="sm"
                    onPress={() => setRemind({ id: p.id, name: tenant.name, unit_name: tenant.unit_name, amount: p.amount, due_date: p.due_date, period: p.period, months: p.months, days_late: p.days_late, phone: tenant.phone })}
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
              ].filter(Boolean).join(" · ") || "Dari prospek"}
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
          Unit {tenant.unit_name} kembali KOSONG dan siap dicocokkan dengan prospek baru. Tagihan bulan-bulan setelah hari ini dibatalkan; tagihan yang sudah telat tetap tercatat.
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

const INTERVAL_LABEL: Record<number, string> = { 1: "Bulanan", 3: "Per 3 bulan", 6: "Per 6 bulan", 12: "Tahunan" };

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.xl, maxWidth: 720, width: "100%", alignSelf: "center" },
  kicker: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 14, marginBottom: 6 },
  big: { color: colors.onSurface, ...fonts.bold, fontSize: 28, letterSpacing: -0.5 },
  muted: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 21 },
  note: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  facts: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  factLabel: { color: colors.muted, ...fonts.regular, fontSize: 13 },
  factValue: { color: colors.onSurface, ...fonts.semibold, fontSize: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  period: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  late: { color: colors.error, ...fonts.semibold, fontSize: 14 },
  actions: { flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" },
}));
