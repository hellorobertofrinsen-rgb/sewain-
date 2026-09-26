import React, { useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { PhotoAvatar } from "@/src/components/PhotoAvatar";
import { InvoiceSheet, InvoiceTarget } from "@/src/components/InvoiceSheet";
import { t } from "@/src/lib/i18n";
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
  const [invoice, setInvoice] = useState<InvoiceTarget | null>(null);
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
    onSuccess: () => { invalidate(); toast(t("Lunas ✓")); },
    onError: (e: any) => toast(e?.message || t("Gagal menandai lunas"), "error"),
  });
  const markUnpaid = useMutation({
    mutationFn: (pid: string) => api(`/payments/${pid}/mark-unpaid`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast(t("Dikembalikan ke belum bayar")); },
  });
  const checkout = useMutation({
    mutationFn: () => api(`/tenants/${id}/checkout`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast(t("Checkout selesai — unit kembali kosong"));
      if (embedded) onGone?.();
      else router.back();
    },
    onError: (e: any) => toast(e?.message || t("Gagal checkout"), "error"),
  });

  if (isLoading) return <View style={s.root}><Spinner label={t("Memuat tenant…")} /></View>;
  if (error || !tenant) return <View style={s.root}><ScreenHeader embedded={embedded} title={t("Tenant")} /><ErrorBox message={(error as any)?.message || t("Tidak ditemukan")} onRetry={refetch} /></View>;

  const active = tenant.status === "aktif";
  const pays: any[] = tenant.payments || [];
  const unpaid = pays.filter((p) => p.status !== "lunas");
  const outstanding = unpaid.filter((p) => p.days_late > 0).reduce((a, p) => a + (p.amount || 0), 0);
  // Show what matters: unpaid bills + the last 3 paid ones. The full history is one tap away.
  const visibleBills = showAllBills ? pays.slice().reverse() : [...unpaid, ...pays.filter((p) => p.status === "lunas").slice(-3).reverse()];
  const soon = tenant.days_left != null && tenant.days_left <= 30;
  const wa = waLink(tenant.phone);
  const billTarget = (p: any): InvoiceTarget => ({
    name: tenant.name, phone: tenant.phone, unit_name: tenant.unit_name, amount: p.amount, due_date: p.due_date, period: p.period, months: p.months,
  });
  const ownerWa = waLink(tenant.owner?.phone);
  const h = tenant.history;

  return (
    <View style={s.root}>
      <ScreenHeader embedded={embedded} title={tenant.name} right={!active ? <StatusPill label={t("Checkout")} tone="neutral" testID="tenant-checkout-pill" /> : null} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: (embedded ? 0 : insets.bottom) + spacing.xxxl }]} showsVerticalScrollIndicator={false} testID="tenant-detail-screen">
        <View style={s.person}>
          <PhotoAvatar name={tenant.name} photo={tenant.photo} path={`/tenants/${tenant.id}`} testID="tenant-photo" refresh={["tenant", "tenants", "today"]} />
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={s.personName} numberOfLines={2}>{tenant.name}</RNText>
            <RNText style={s.muted}>{t("Tenant · Unit {unit}", { unit: tenant.unit_name })}</RNText>
          </View>
        </View>
        {/* Lease */}
        <Card testID="lease-card" style={soon && active ? { borderWidth: 1.5, borderColor: withAlpha(colors.warning, 0.5) } : undefined}>
          <RNText style={s.kicker}>{t("Kontrak · Unit {name}", { name: tenant.unit_name })}</RNText>
          <RNText style={s.big}>{active ? leaseLeftLabel(tenant.days_left) : t("Sudah checkout")}</RNText>
          <RNText style={s.muted}>
            {dateLabel(tenant.start_date + "T00:00:00")} — {tenant.end_date ? dateLabel(tenant.end_date + "T00:00:00") : t("tanpa tanggal selesai")}
          </RNText>
          <View style={s.facts}>
            <Fact label={t("Sewa / bulan")} value={rupiah(tenant.monthly_rent)} />
            <Fact label={t("Dibayar")} value={t(INTERVAL_LABEL[tenant.payment_interval_months || 1] || "{n} bulan", { n: tenant.payment_interval_months })} />
            <Fact label={t("Tanggal bayar")} value={String(tenant.payment_due_day)} />
          </View>
          {unpaid.length ? (
            <Button
              title={t("Kirim Invoice")}
              icon="whatsapp"
              onPress={() => setInvoice(billTarget(unpaid[0]))}
              testID="tenant-send-invoice"
              style={{ marginTop: spacing.md }}
            />
          ) : null}
          {active && wa && tenant.end_date ? (
            <Button
              title={t("Follow-up Extend")}
              variant={unpaid.length ? "secondary" : "primary"}
              icon="whatsapp"
              onPress={() => Linking.openURL(waLink(tenant.phone, leaseRenewalMessage({ name: tenant.name, unit_name: tenant.unit_name, end_date: tenant.end_date }))!)}
              testID="tenant-followup-extend"
              style={{ marginTop: spacing.md }}
            />
          ) : null}
          {active ? (
            <Button
              title={t("Catat Perpanjangan")}
              variant="ghost"
              onPress={() => setLease({ id: tenant.id, name: tenant.name, unit_name: tenant.unit_name, end_date: tenant.end_date, days_left: tenant.days_left, phone: tenant.phone })}
              testID="tenant-extend-button"
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>

        {/* People */}
        <ListGroup title={t("Orang")} testID="tenant-people">
          <ListRow
            label={tenant.name}
            sub={`${t("Tenant")}${tenant.phone ? ` · ${tenant.phone}` : ""}`}
            icon="key"
            tone="success"
            right={wa ? <Button title={t("WhatsApp")} icon="whatsapp" variant="secondary" size="sm" onPress={() => Linking.openURL(wa)} testID="tenant-wa" /> : undefined}
          />
          {tenant.owner ? (
            <ListRow
              label={tenant.owner.name || t("Pemilik")}
              sub={`${t("Pemilik unit")}${tenant.owner.phone ? ` · ${tenant.owner.phone}` : ""}`}
              icon="user"
              tone="brand"
              right={ownerWa ? <Button title={t("WhatsApp")} icon="whatsapp" variant="secondary" size="sm" onPress={() => Linking.openURL(ownerWa)} testID="owner-wa" /> : undefined}
            />
          ) : null}
          <ListRow label={t("Deposit")} value={tenant.deposit ? rupiah(tenant.deposit) : "-"} icon="shield" tone="neutral" />
          {tenant.commission ? <ListRow label={t("Komisi kamu")} value={rupiah(tenant.commission)} icon="trending-up" tone="brand" /> : null}
        </ListGroup>

        {/* Bills */}
        <View style={{ gap: spacing.md }}>
          <View style={s.rowBetween}>
            <SectionTitle>{t("Tagihan sewa")}</SectionTitle>
            {outstanding > 0 ? <RNText style={s.late}>{t("Telat: {amount}", { amount: rupiah(outstanding) })}</RNText> : null}
          </View>
          {visibleBills.map((p: any) => (
            <Card key={p.id} testID={`payment-card-${p.id}`}>
              <View style={s.rowBetween}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={s.period}>{periodLabel(p.period, p.months || 1)}</RNText>
                  <RNText style={s.muted}>{rupiah(p.amount)}{(p.months || 1) > 1 ? ` (${t("{n} bulan", { n: p.months })})` : ""} · {t("jatuh tempo {date}", { date: dateLabel(p.due_date + "T00:00:00") })}</RNText>
                </View>
                {p.status === "lunas" ? (
                  <PressableScale onLongPress={() => markUnpaid.mutate(p.id)} testID={`payment-status-${p.id}`}>
                    <StatusPill label={t("Lunas")} tone="success" />
                  </PressableScale>
                ) : (
                  <StatusPill label={p.days_late > 0 ? t("Telat {n} hari", { n: p.days_late }) : t("Belum bayar")} tone={p.days_late > 0 ? "error" : "warning"} testID={`payment-status-${p.id}`} />
                )}
              </View>
              {p.status !== "lunas" ? (
                <View style={s.actions}>
                  <Button title={t("Tandai Lunas")} size="sm" onPress={() => markPaid.mutate(p.id)} testID={`payment-paid-${p.id}`} />
                  <Button title={t("Invoice")} variant="ghost" size="sm" icon="whatsapp" onPress={() => setInvoice(billTarget(p))} testID={`payment-invoice-${p.id}`} />
                  <Button
                    title={t("Ingatkan")}
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
            <Button title={showAllBills ? t("Ringkas") : t("Lihat semua {n} tagihan", { n: pays.length })} variant="ghost" size="sm" onPress={() => setShowAllBills(!showAllBills)} testID="bills-toggle" />
          ) : null}
        </View>

        {/* History from the lead journey */}
        {h ? (
          <Card testID="tenant-history-card" onPress={() => router.push(`/lead/${h.lead_id}` as any)}>
            <RNText style={s.kicker}>{t("Riwayat sebelum jadi tenant")}</RNText>
            <RNText style={s.muted}>
              {[
                h.budget_max ? t("Budget {amount}", { amount: rupiah(h.budget_max) }) : null,
                h.unit_type,
                h.occupants ? t("{n} orang", { n: h.occupants }) : null,
                h.viewings ? t("{n}× viewing", { n: h.viewings }) : null,
              ].filter(Boolean).join(" · ") || t("Dari prospek")}
            </RNText>
            {h.requirements?.length ? <RNText style={s.muted}>{t("Kebutuhan: {list}", { list: h.requirements.join(", ") })}</RNText> : null}
            {h.notes ? <RNText style={s.note}>{h.notes}</RNText> : null}
            {h.negotiation_note ? <RNText style={s.note}>{t("Nego: {note}", { note: h.negotiation_note })}</RNText> : null}
          </Card>
        ) : null}

        {active ? <Button title={t("Proses Checkout")} variant="danger" onPress={() => setCheckoutOpen(true)} testID="tenant-checkout-button" /> : null}
      </ScrollView>

      <ReminderSheet payment={remind} onClose={() => setRemind(null)} />
      <InvoiceSheet bill={invoice} onClose={() => setInvoice(null)} />
      <LeaseSheet tenant={lease} onClose={() => setLease(null)} />

      <Sheet visible={checkoutOpen} onClose={() => setCheckoutOpen(false)} title={t("Checkout {name}?", { name: tenant.name })} testID="checkout-sheet">
        <RNText style={s.note}>
          {t("Unit {name} kembali KOSONG dan siap dicocokkan dengan prospek baru. Tagihan bulan-bulan setelah hari ini dibatalkan; tagihan yang sudah telat tetap tercatat.", { name: tenant.unit_name })}
        </RNText>
        <Button title={t("Ya, Proses Checkout")} variant="danger" onPress={() => checkout.mutate()} loading={checkout.isPending} testID="checkout-confirm-button" style={{ marginTop: spacing.lg }} />
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
  person: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  personName: { color: colors.onSurface, ...fonts.bold, fontSize: 22, letterSpacing: -0.3 },
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
