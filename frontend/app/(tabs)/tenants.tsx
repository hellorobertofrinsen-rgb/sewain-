import React, { useState } from "react";
import { FlatList, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Sheet } from "@/src/components/Sheet";
import { TabHeader } from "@/src/components/TabHeader";
import { SplitView } from "@/src/components/SplitView";
import { TenantDetail } from "@/app/tenant/[id]";
import { useIsWide } from "@/src/lib/layout";
import { t } from "@/src/lib/i18n";
import { useParamTrigger } from "@/src/lib/useParamTrigger";
import { STATE_TRANSITION } from "@/src/motion";
import { Button, Card, Chip, EmptyState, ErrorBox, Field, IconCircle, Input, Spinner } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { dueDayOk, leaseLeftLabel, moneyInput, parseMoney, rupiah, todayISO, typeMoney } from "@/src/lib/format";
import { phoneOk } from "@/src/components/LeadForm";
import { unitKind } from "@/src/lib/unitKinds";
import { DateInput } from "@/src/components/DateInput";
import { fonts, makeStyles, spacing, useTheme, withAlpha } from "@/src/theme";
import { Avatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";

export default function TenantsScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const { colors } = useTheme();
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
  const ready = !!f.unit_id && !!f.name.trim() && phoneOk(f.phone) && !!f.start_date && dueDayOk(f.due_day)
    && !!parseMoney(f.monthly_rent) && f.deposit !== "";

  const belum = (data || []).filter((x) => x.payment_status === "belum_bayar");
  const belumTotal = belum.reduce((a, x) => a + (x.next_amount || 0), 0);

  const create = useMutation({
    mutationFn: () =>
      api("/tenants", {
        method: "POST",
        body: {
          name: f.name,
          unit_id: f.unit_id,
          phone: f.phone.trim(),
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
      toast(t("Tenant ditambahkan — unit jadi terisi ✓"));
      setAddOpen(false);
      setF({ ...f, name: "", unit_id: "", phone: "", monthly_rent: "", deposit: "", commission: "" });
    },
    onError: (e: any) => toast(e?.message || t("Gagal menambah tenant"), "error"),
  });

  const open = (id: string) => (wide ? setSelected(id) : router.push(`/tenant/${id}` as any));
  const ending = (data || []).filter((x) => x.days_left != null && x.days_left <= 30).length;

  const list = (
    <View style={s.root}>
      <TabHeader
        title={t("Tenant||tab")}
        sub={data && data.length ? [t("{n} aktif", { n: data.length }), ending ? t("{n} kontrak selesai ≤ 30 hari", { n: ending }) : null].filter(Boolean).join(" · ") : null}
        right={<Button title={t("Tambah")} icon="plus" size="sm" onPress={() => setAddOpen(true)} testID="add-tenant-button" />}
      />

      {isLoading ? (
        <Spinner label={t("Memuat tenant…")} />
      ) : error ? (
        <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(x) => x.id}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            belum.length > 0 ? (
              <Card testID="unpaid-summary-card" style={s.unpaidCard}>
                <IconCircle icon="wallet" tone="error" size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={s.unpaidTitle}>{t("{amount} belum masuk", { amount: rupiah(belumTotal) })}</RNText>
                  <RNText style={s.unpaidSub} numberOfLines={2}>{`${t("{n} tenant", { n: belum.length })} · ${belum.map((x) => x.name).join(", ")}`}</RNText>
                </View>
              </Card>
            ) : null
          }
          renderItem={({ item }) => {
            const soon = item.days_left != null && item.days_left <= 30;
            return (
              <Card testID={`tenant-card-${item.id}`} onPress={() => open(item.id)} style={[STATE_TRANSITION, s.card, wide && selected === item.id && s.cardSelected]}>
                <View style={s.cardHead}>
                  <Avatar name={item.name} photo={item.photo} size={48} testID={`tenant-avatar-${item.id}`} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <RNText style={s.name} numberOfLines={1}>{item.name}</RNText>
                    <RNText style={[s.lease, soon && s.leaseSoon]} numberOfLines={1} testID={`tenant-ends-${item.id}`}>{leaseLeftLabel(item.days_left)}</RNText>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              art="tenants"
              title={t("Belum ada tenant aktif")}
              subtitle={t("Tenant muncul otomatis saat prospek ditandai deal, atau tambah manual di sini.")}
              action={<Button title={t("Tambah Tenant")} icon="plus" onPress={() => setAddOpen(true)} testID="empty-add-tenant-button" />}
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
        emptyText={t("Pilih tenant untuk lihat kontrak, tagihan, dan riwayatnya.")}
      />
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t("Tambah Tenant")} testID="add-tenant-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          {(
            <>
              <Field label={t("Unit")}>
                {allUnits && units.length === 0 ? (
                  <View style={s.noUnit} testID="tenant-no-unit">
                    <RNText style={s.noUnitText}>
                      {allUnits.length ? t("Semua unit sudah terisi. Tambah unit dulu, lalu pilih di sini.") : t("Tenant harus menempati unit dari daftar unit. Tambah unitnya dulu.")}
                    </RNText>
                    <Button title={t("Tambah Unit")} icon="plus" variant="secondary" size="sm" onPress={() => { setAddOpen(false); router.push("/units?add=1" as any); }} testID="tenant-add-unit-first" />
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {units.map((u: any) => (
                      <Chip
                        key={u.id}
                        label={[u.name, unitKind(u)].filter(Boolean).join(" · ")}
                        active={f.unit_id === u.id}
                        onPress={() => setF({ ...f, unit_id: u.id, monthly_rent: f.monthly_rent || moneyInput(u.monthly_price), deposit: f.deposit || (u.deposit ? typeMoney(String(u.deposit)) : "") })}
                        testID={`tenant-unit-${u.id}`}
                      />
                    ))}
                  </View>
                )}
              </Field>
              <Field label={t("Nama tenant")}>
                <Input testID="tenant-name-input" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder={t("mis. Kevin")} />
              </Field>
              <Field label={t("No. WhatsApp")}>
                <Input testID="tenant-phone-input" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} placeholder="+62 812-…" keyboardType="phone-pad" />
              </Field>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label={t("Mulai sewa")}>
                    <DateInput testID="tenant-start-input" value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t("Bayar tiap tanggal")}>
                    <Input testID="tenant-due-input" value={f.due_day} onChangeText={(v) => setF({ ...f, due_day: v.replace(/\D/g, "").slice(0, 2) })} keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label={t("Sewa / bulan")}>
                    <Input testID="tenant-rent-input" value={f.monthly_rent} onChangeText={(v) => setF({ ...f, monthly_rent: typeMoney(v) })} placeholder="3.200.000" keyboardType="numeric" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t("Deposit")}>
                    <Input testID="tenant-deposit-input" value={f.deposit} onChangeText={(v) => setF({ ...f, deposit: typeMoney(v) })} placeholder="1.200.000" keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <Field label={t("Lama kontrak")}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[1, 3, 6, 12, 24].map((m) => (
                    <Chip key={m} label={t("{n} bulan", { n: m })} active={f.months === m} onPress={() => setF({ ...f, months: m })} testID={`tenant-months-${m}`} />
                  ))}
                </View>
              </Field>
              <Field label={t("Dibayar tiap")}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[{ m: 1, l: "Bulanan" }, { m: 3, l: "3 bulan" }, { m: 6, l: "6 bulan" }, { m: 12, l: "Tahunan" }].map((it) => (
                    <Chip key={it.m} label={t(it.l)} active={f.interval === it.m} onPress={() => setF({ ...f, interval: it.m })} testID={`tenant-interval-${it.m}`} />
                  ))}
                </View>
              </Field>
              <Field label={t("Komisi kamu (opsional)")} hint={t("Hanya kamu yang lihat.")}>
                <Input testID="tenant-commission-input" value={f.commission} onChangeText={(v) => setF({ ...f, commission: typeMoney(v) })} placeholder="1.500.000" keyboardType="numeric" />
              </Field>
              <Button title={t("Simpan Tenant")} onPress={() => create.mutate()} loading={create.isPending} disabled={!ready} testID="tenant-save-button" />
            </>
          )}
        </View>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  noUnit: { gap: spacing.sm, padding: spacing.md, borderRadius: 14, backgroundColor: colors.surfaceTertiary },
  noUnitText: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, lineHeight: 20 },
  root: { flex: 1, backgroundColor: colors.surface },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.md },
  unpaidCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: withAlpha(colors.error, 0.07), marginBottom: spacing.xs, shadowOpacity: 0, boxShadow: "none" } as any,
  unpaidTitle: { color: colors.error, ...fonts.bold, fontSize: 18 },
  unpaidSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14, lineHeight: 19 },
  card: { borderWidth: 1.5, borderColor: "transparent" },
  cardSelected: { borderColor: colors.brandPrimary },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { color: colors.onSurface, ...fonts.semibold, fontSize: 18, letterSpacing: -0.2 },
  meta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15 },
  foot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  due: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, flex: 1 },
  lease: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15 },
  leaseSoon: { color: colors.warning, ...fonts.semibold },
}));
