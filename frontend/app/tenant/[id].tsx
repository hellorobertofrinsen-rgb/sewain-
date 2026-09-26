import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { ReminderSheet } from "@/src/components/ActionSheets";
import { Button, Card, ErrorBox, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { dateLabel, periodLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

export default function TenantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [remind, setRemind] = useState<any>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const { data: tenant, isLoading, error, refetch } = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => api<any>(`/tenants/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tenant", id] });
    qc.invalidateQueries({ queryKey: ["tenants"] });
    qc.invalidateQueries({ queryKey: ["today"] });
    qc.invalidateQueries({ queryKey: ["impact"] });
  };

  const markPaid = useMutation({
    mutationFn: (pid: string) => api(`/payments/${pid}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast("Lunas ✓");
    },
    onError: (e: any) => toast(e?.message || "Gagal menandai lunas", "error"),
  });

  const checkout = useMutation({
    mutationFn: () => api(`/tenants/${id}/checkout`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["units"] });
      toast("Checkout selesai — unit kembali kosong");
      router.back();
    },
    onError: (e: any) => toast(e?.message || "Gagal checkout", "error"),
  });

  if (isLoading) return <View style={s.root}><Spinner label="Memuat tenant…" /></View>;
  if (error || !tenant) return <View style={s.root}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>;

  return (
    <View style={s.root}>
      <ScreenHeader title={tenant.name} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false} testID="tenant-detail-screen">
        <Card>
          <Row label="Unit" value={tenant.unit_name} />
          <Row label="No. HP" value={tenant.phone || "-"} />
          <Row label="Sewa / bulan" value={rupiah(tenant.monthly_rent)} />
          <Row label="Deposit" value={tenant.deposit ? rupiah(tenant.deposit) : "-"} />
          <Row label="Mulai" value={dateLabel(tenant.start_date + "T00:00:00")} />
          {tenant.end_date ? <Row label="Sampai" value={dateLabel(tenant.end_date + "T00:00:00")} /> : null}
          <Row label="Bayar tiap tanggal" value={String(tenant.payment_due_day)} last />
        </Card>

        <View style={{ gap: spacing.md }}>
          <SectionTitle>Tagihan sewa</SectionTitle>
          {tenant.payments?.slice().reverse().map((p: any) => (
            <Card key={p.id} testID={`payment-card-${p.id}`}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={s.period}>{periodLabel(p.period)}</RNText>
                  <RNText style={s.amount}>{rupiah(p.amount)}</RNText>
                  <RNText style={s.due}>Jatuh tempo {dateLabel(p.due_date + "T00:00:00")}</RNText>
                </View>
                {p.status === "lunas" ? (
                  <StatusPill label="LUNAS ✓" tone="success" testID={`payment-status-${p.id}`} />
                ) : (
                  <StatusPill label="BELUM BAYAR" tone="error" testID={`payment-status-${p.id}`} />
                )}
              </View>
              {p.status !== "lunas" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
                  <Button title="Tandai Lunas" size="sm" onPress={() => markPaid.mutate(p.id)} testID={`payment-paid-${p.id}`} />
                  <Button
                    title="Ingatkan"
                    variant="ghost"
                    size="sm"
                    onPress={() => setRemind({ id: p.id, name: tenant.name, unit_name: tenant.unit_name, amount: p.amount, due_date: p.due_date, phone: tenant.phone })}
                    testID={`payment-remind-${p.id}`}
                  />
                </View>
              ) : null}
            </Card>
          ))}
        </View>

        <Button title="Proses Checkout Tenant" variant="danger" onPress={() => setCheckoutOpen(true)} testID="tenant-checkout-button" />
      </ScrollView>

      <ReminderSheet payment={remind} onClose={() => setRemind(null)} />

      <Sheet visible={checkoutOpen} onClose={() => setCheckoutOpen(false)} title={`Checkout ${tenant.name}?`} testID="checkout-sheet">
        <RNText style={s.note}>
          Unit {tenant.unit_name} akan berubah jadi KOSONG dan siap dicocokkan dengan calon penyewa baru.
        </RNText>
        <Button title="Ya, Proses Checkout" variant="danger" onPress={() => checkout.mutate()} loading={checkout.isPending} testID="checkout-confirm-button" style={{ marginTop: spacing.lg }} />
      </Sheet>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const s2 = rowStyles();
  return (
    <View style={[s2.row, !last && s2.rowBorder]}>
      <RNText style={s2.rowLabel}>{label}</RNText>
      <RNText style={s2.rowValue}>{value}</RNText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  period: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  amount: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 18 },
  due: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  note: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
}));

const rowStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  rowValue: { color: colors.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 13, textAlign: "right", flex: 1, marginLeft: spacing.lg },
}));
