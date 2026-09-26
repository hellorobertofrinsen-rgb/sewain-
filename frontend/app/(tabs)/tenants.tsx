import React, { useState } from "react";
import { FlatList, Pressable, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, EmptyState, ErrorBox, Field, Input, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { dayLabel, rupiah, todayISO } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function TenantsScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [addOpen, setAddOpen] = useState(false);
  const [f, setF] = useState({ name: "", unit_id: "", phone: "", start_date: todayISO(), monthly_rent: "", deposit: "", due_day: "10" });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api<any[]>("/tenants"),
  });
  const { data: units } = useQuery({ queryKey: ["units", "kosong"], queryFn: () => api<any[]>("/units?status=kosong"), enabled: addOpen });

  const belum = (data || []).filter((t) => t.payment_status === "belum_bayar");
  const belumTotal = belum.reduce((a, t) => a + (t.next_amount || 0), 0);

  const create = useMutation({
    mutationFn: () =>
      api("/tenants", {
        method: "POST",
        body: {
          name: f.name,
          unit_id: f.unit_id || units?.[0]?.id,
          phone: f.phone || null,
          start_date: f.start_date,
          monthly_rent: parseInt(f.monthly_rent.replace(/\D/g, "") || "0", 10),
          deposit: parseInt(f.deposit.replace(/\D/g, "") || "0", 10),
          payment_due_day: parseInt(f.due_day || "10", 10) || 10,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      toast("Tenant ditambahkan — unit jadi terisi ✓");
      setAddOpen(false);
      setF({ ...f, name: "", phone: "", monthly_rent: "", deposit: "" });
    },
    onError: (e: any) => toast(e?.message || "Gagal menambah tenant", "error"),
  });

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <RNText style={s.title}>Tenant</RNText>
        <Pressable testID="add-tenant-button" onPress={() => setAddOpen(true)} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}>
          <Icon name="plus" size={18} color={colors.onBrandPrimary} />
          <RNText style={s.addText}>Tambah</RNText>
        </Pressable>
      </View>

      {(belum.length ?? 0) > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Card testID="unpaid-summary-card" style={{ borderColor: s.unpaidBorder.borderColor }}>
            <RNText style={s.unpaidTitle}>Belum bayar: {rupiah(belumTotal)}</RNText>
            <RNText style={s.unpaidSub}>{belum.length} tenant — {belum.map((t) => t.name).join(", ")}</RNText>
          </Card>
        </View>
      ) : null}

      {isLoading ? (
        <Spinner label="Memuat tenant…" />
      ) : error ? (
        <ErrorBox message={(error as any)?.message} onRetry={refetch} />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + spacing.xxxl, gap: spacing.md, paddingTop: spacing.md }}
          renderItem={({ item }) => (
            <Card testID={`tenant-card-${item.id}`} onPress={() => router.push(`/tenant/${item.id}` as any)}>
              <View style={s.cardHead}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={s.name}>{item.name}</RNText>
                  <RNText style={s.meta}>
                    Unit {item.unit_name} · {rupiah(item.monthly_rent)}/bln
                  </RNText>
                </View>
                {item.payment_status === "belum_bayar" ? (
                  <StatusPill label={item.overdue > 0 ? `TERLAMBAT ${item.overdue} HR` : "BELUM BAYAR"} tone="error" testID={`tenant-status-${item.id}`} />
                ) : (
                  <StatusPill label="LUNAS ✓" tone="success" testID={`tenant-status-${item.id}`} />
                )}
              </View>
              <RNText style={s.due}>
                {item.payment_status === "belum_bayar"
                  ? `Jatuh tempo ${dayLabel(item.next_due + "T00:00:00")}`
                  : "Pembayaran bulan ini beres"}
              </RNText>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="user-check"
              title="Belum ada tenant aktif"
              subtitle="Tenant baru muncul otomatis saat calon penyewa ditandai Deal — atau tambah manual di sini."
              action={<Button title="Tambah Tenant" onPress={() => setAddOpen(true)} testID="empty-add-tenant-button" />}
            />
          }
        />
      )}

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Tambah Tenant" testID="add-tenant-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          {(units?.length ?? 0) === 0 ? (
            <ErrorBox message="Semua unit terisi. Kosongkan satu unit dulu (checkout) atau tambah unit baru." />
          ) : (
            <>
              <Field label="Properti / unit kosong">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(units || []).map((u: any) => (
                    <Chip key={u.id} label={`${u.name} · ${u.property_name}`} active={f.unit_id === u.id} onPress={() => setF({ ...f, unit_id: u.id, monthly_rent: String(u.monthly_price) })} />
                  ))}
                </View>
              </Field>
              <Field label="Nama tenant">
                <Input testID="tenant-name-input" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="mis. Kevin" />
              </Field>
              <Field label="No. WhatsApp">
                <Input testID="tenant-phone-input" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} placeholder="+62 812-…" keyboardType="phone-pad" />
              </Field>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Mulai (YYYY-MM-DD)">
                    <Input testID="tenant-start-input" value={f.start_date} onChangeText={(v) => setF({ ...f, start_date: v })} placeholder={todayISO()} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Bayar tiap tanggal">
                    <Input testID="tenant-due-input" value={f.due_day} onChangeText={(v) => setF({ ...f, due_day: v })} keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Sewa / bulan">
                    <Input testID="tenant-rent-input" value={f.monthly_rent} onChangeText={(v) => setF({ ...f, monthly_rent: v })} placeholder="3200000" keyboardType="numeric" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Deposit">
                    <Input testID="tenant-deposit-input" value={f.deposit} onChangeText={(v) => setF({ ...f, deposit: v })} placeholder="1200000" keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <Button title="Simpan Tenant" onPress={() => create.mutate()} loading={create.isPending} testID="tenant-save-button" />
            </>
          )}
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.4 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 40 },
  addText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 13 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  name: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  meta: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13 },
  due: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: spacing.sm },
  unpaidTitle: { color: colors.error, fontFamily: fonts.semibold, fontSize: 16 },
  unpaidSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
  unpaidBorder: { borderColor: "rgba(248,113,113,0.4)" },
}));
