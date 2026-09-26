import React, { useState } from "react";
import { FlatList, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Sheet } from "@/src/components/Sheet";
import { TabHeader } from "@/src/components/TabHeader";
import { SplitView } from "@/src/components/SplitView";
import { TenantDetail } from "@/app/tenant/[id]";
import { useIsWide } from "@/src/lib/layout";
import { useParamTrigger } from "@/src/lib/useParamTrigger";
import { STATE_TRANSITION } from "@/src/motion";
import { Button, Card, Chip, EmptyState, ErrorBox, Field, IconCircle, Input, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { leaseLeftLabel, shortDay, moneyInput, parseMoney, rupiah, rupiahShort, todayISO } from "@/src/lib/format";
import { DateInput } from "@/src/components/DateInput";
import { fonts, makeStyles, spacing, withAlpha } from "@/src/theme";

export default function TenantsScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const wide = useIsWide();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", unit_id: "", phone: "", start_date: todayISO(), months: 12, interval: 1, monthly_rent: "", deposit: "", due_day: "10", commission: "" });

  // "+" menu lands here with ?add=1.
  useParamTrigger("add", () => setAddOpen(true));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api<any[]>("/tenants"),
  });
  const { data: allUnits } = useQuery({ queryKey: ["units", "semua"], queryFn: () => api<any[]>("/units?status=semua"), enabled: addOpen });
  const units = (allUnits || []).filter((u) => u.status !== "terisi");

  const belum = (data || []).filter((t) => t.payment_status === "belum_bayar");
  const belumTotal = belum.reduce((a, t) => a + (t.next_amount || 0), 0);

  const create = useMutation({
    mutationFn: () =>
      api("/tenants", {
        method: "POST",
        body: {
          name: f.name,
          unit_id: f.unit_id,
          phone: f.phone || null,
          start_date: f.start_date,
          contract_months: f.months,
          monthly_rent: parseMoney(f.monthly_rent) ?? 0,
          deposit: parseMoney(f.deposit) ?? 0,
          payment_due_day: parseInt(f.due_day || "10", 10) || 10,
          payment_interval_months: f.interval,
          commission: parseMoney(f.commission),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      toast("Tenant ditambahkan — unit jadi terisi ✓");
      setAddOpen(false);
      setF({ ...f, name: "", unit_id: "", phone: "", monthly_rent: "", deposit: "", commission: "" });
    },
    onError: (e: any) => toast(e?.message || "Gagal menambah tenant", "error"),
  });

  const open = (id: string) => (wide ? setSelected(id) : router.push(`/tenant/${id}` as any));
  const ending = (data || []).filter((t) => t.days_left != null && t.days_left <= 30).length;

  const list = (
    <View style={s.root}>
      <TabHeader
        title="Tenant"
        sub={data && data.length ? [`${data.length} aktif`, ending ? `${ending} kontrak habis ≤ 30 hari` : null].filter(Boolean).join(" · ") : null}
        right={<Button title="Tambah" icon="plus" size="sm" onPress={() => setAddOpen(true)} testID="add-tenant-button" />}
      />

      {isLoading ? (
        <Spinner label="Memuat tenant…" />
      ) : error ? (
        <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            belum.length > 0 ? (
              <Card testID="unpaid-summary-card" style={s.unpaidCard}>
                <IconCircle icon="wallet" tone="error" size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={s.unpaidTitle}>{rupiah(belumTotal)} belum masuk</RNText>
                  <RNText style={s.unpaidSub} numberOfLines={2}>{belum.length} tenant · {belum.map((t) => t.name).join(", ")}</RNText>
                </View>
              </Card>
            ) : null
          }
          renderItem={({ item }) => {
            const soon = item.days_left != null && item.days_left <= 30;
            return (
              <Card testID={`tenant-card-${item.id}`} onPress={() => open(item.id)} style={[STATE_TRANSITION, s.card, wide && selected === item.id && s.cardSelected]}>
                <View style={s.cardHead}>
                  <View style={s.avatar}>
                    <RNText style={s.avatarText}>{(item.name || "?").charAt(0).toUpperCase()}</RNText>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <RNText style={s.name} numberOfLines={1}>{item.name}</RNText>
                    <RNText style={s.meta} numberOfLines={1}>
                      Unit {item.unit_name} · {rupiahShort(item.monthly_rent)}/bln
                    </RNText>
                  </View>
                </View>
                <View style={s.foot}>
                  {item.payment_status === "belum_bayar" ? (
                    <StatusPill label={item.overdue > 0 ? `Telat ${item.overdue} hari` : "Belum bayar"} tone="error" testID={`tenant-status-${item.id}`} />
                  ) : (
                    <StatusPill label="Lunas" tone="success" testID={`tenant-status-${item.id}`} />
                  )}
                  {item.payment_status === "belum_bayar" ? (
                    <RNText style={s.due} numberOfLines={1}>tempo {shortDay(item.next_due + "T00:00:00")}</RNText>
                  ) : null}
                </View>
                <RNText style={[s.lease, soon && s.leaseSoon]} numberOfLines={1}>Kontrak: {leaseLeftLabel(item.days_left).toLowerCase()}</RNText>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              art="tenants"
              title="Belum ada tenant aktif"
              subtitle="Tenant muncul otomatis saat prospek ditandai deal, atau tambah manual di sini."
              action={<Button title="Tambah Tenant" icon="plus" onPress={() => setAddOpen(true)} testID="empty-add-tenant-button" />}
            />
          }
        />
      )}
    </View>
  );

  return (
    <>
      <SplitView
        list={list}
        detail={selected ? <TenantDetail key={selected} id={selected} embedded onGone={() => setSelected(null)} /> : null}
        emptyArt="tenants"
        emptyText="Pilih tenant untuk lihat kontrak, tagihan, dan riwayatnya."
      />
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Tambah Tenant" testID="add-tenant-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          {allUnits && units.length === 0 ? (
            <ErrorBox message="Semua unit terisi. Kosongkan satu unit dulu (checkout) atau tambah unit baru." />
          ) : (
            <>
              <Field label="Properti / unit kosong">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {units.map((u: any) => (
                    <Chip key={u.id} label={`${u.name} · ${u.property_name}`} active={f.unit_id === u.id} onPress={() => setF({ ...f, unit_id: u.id, monthly_rent: moneyInput(u.monthly_price), deposit: moneyInput(u.deposit) })} />
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
                  <Field label="Mulai sewa">
                    <DateInput testID="tenant-start-input" value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} />
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
                    <Input testID="tenant-rent-input" value={f.monthly_rent} onChangeText={(v) => setF({ ...f, monthly_rent: moneyInput(parseMoney(v)) })} placeholder="3.200.000" keyboardType="numeric" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Deposit">
                    <Input testID="tenant-deposit-input" value={f.deposit} onChangeText={(v) => setF({ ...f, deposit: moneyInput(parseMoney(v)) })} placeholder="1.200.000" keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <Field label="Lama kontrak">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[1, 3, 6, 12, 24].map((m) => (
                    <Chip key={m} label={`${m} bulan`} active={f.months === m} onPress={() => setF({ ...f, months: m })} testID={`tenant-months-${m}`} />
                  ))}
                </View>
              </Field>
              <Field label="Dibayar tiap">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[{ m: 1, l: "Bulanan" }, { m: 3, l: "3 bulan" }, { m: 6, l: "6 bulan" }, { m: 12, l: "Tahunan" }].map((it) => (
                    <Chip key={it.m} label={it.l} active={f.interval === it.m} onPress={() => setF({ ...f, interval: it.m })} testID={`tenant-interval-${it.m}`} />
                  ))}
                </View>
              </Field>
              <Field label="Komisi kamu (opsional)">
                <Input testID="tenant-commission-input" value={f.commission} onChangeText={(v) => setF({ ...f, commission: moneyInput(parseMoney(v)) })} placeholder="1.500.000" keyboardType="numeric" />
              </Field>
              <Button title="Simpan Tenant" onPress={() => create.mutate()} loading={create.isPending} disabled={!f.name.trim() || !f.unit_id} testID="tenant-save-button" />
            </>
          )}
        </View>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.md },
  unpaidCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: withAlpha(colors.error, 0.07), marginBottom: spacing.xs, shadowOpacity: 0, boxShadow: "none" } as any,
  unpaidTitle: { color: colors.error, ...fonts.bold, fontSize: 18 },
  unpaidSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14, lineHeight: 19 },
  card: { borderWidth: 1.5, borderColor: "transparent" },
  cardSelected: { borderColor: colors.brandPrimary },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandTertiary, ...fonts.bold, fontSize: 18 },
  name: { color: colors.onSurface, ...fonts.semibold, fontSize: 18, letterSpacing: -0.2 },
  meta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15 },
  foot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  due: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, flex: 1 },
  lease: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, marginTop: spacing.sm },
  leaseSoon: { color: colors.warning, ...fonts.semibold },
}));
