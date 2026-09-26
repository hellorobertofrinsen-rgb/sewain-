import React, { useState } from "react";
import { FlatList, ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Sheet } from "@/src/components/Sheet";
import { TabHeader } from "@/src/components/TabHeader";
import { SplitView } from "@/src/components/SplitView";
import { UnitDetail } from "@/app/unit/[id]";
import { useIsWide } from "@/src/lib/layout";
import { useParamTrigger } from "@/src/lib/useParamTrigger";
import { STATE_TRANSITION } from "@/src/motion";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Field, Input, Spinner, StatusPill, SwitchRow, PressableScale } from "@/src/components/ui";
import { UnitThumb } from "@/src/components/UnitThumb";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { UNIT_STATUS, daysFromNow, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, spacing } from "@/src/theme";

const STATUS_FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "kosong", label: "Kosong" },
  { key: "terisi", label: "Terisi" },
  { key: "reserved", label: "Reserved" },
  { key: "maintenance", label: "Maintenance" },
];

const TYPE_OPTIONS = ["Studio", "1 Bedroom", "2 Bedroom", "Kost 3x3", "Kost 4x5", "Lainnya"];

export default function UnitsScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const wide = useIsWide();
  const params = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState(params.status || "semua");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { plan, isFree, atUnitLimit, showUpgrade } = usePlan();
  const openAdd = () => (atUnitLimit ? showUpgrade("limit_units") : setAddOpen(true));

  // "+" menu lands here with ?add=1.
  useParamTrigger("add", () => setAddOpen(true));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["units", filter],
    queryFn: () => api<any[]>(`/units?status=${filter}`),
  });
  const { data: properties } = useQuery({ queryKey: ["properties"], queryFn: () => api<any[]>("/properties") });

  // form
  const [f, setF] = useState({ property_id: "", name: "", unit_type: "Studio", monthly_price: "", deposit: "", bedrooms: "1", bathrooms: "1", furnished: true, facilities: "", notes: "", owner_name: "", owner_phone: "" });

  const createUnit = useMutation({
    mutationFn: () =>
      api("/units", {
        method: "POST",
        body: {
          property_id: f.property_id || properties?.[0]?.id,
          name: f.name,
          unit_type: f.unit_type,
          monthly_price: parseInt(f.monthly_price.replace(/\D/g, "") || "0", 10),
          deposit: parseInt(f.deposit.replace(/\D/g, "") || "0", 10),
          bedrooms: parseInt(f.bedrooms || "1", 10) || 1,
          bathrooms: parseInt(f.bathrooms || "1", 10) || 1,
          furnished: f.furnished,
          facilities: f.facilities.split(",").map((x) => x.trim()).filter(Boolean),
          notes: f.notes || null,
          owner_name: f.owner_name.trim() || null,
          owner_phone: f.owner_phone.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      toast("Unit ditambahkan ✓");
      setAddOpen(false);
      setF({ ...f, name: "", monthly_price: "", deposit: "", facilities: "", notes: "" });
    },
    onError: (e: any) => {
      if (e?.code) setAddOpen(false);
      else toast(e?.message || "Gagal menambah unit", "error");
    },
  });

  const empty = !isLoading && data && data.length === 0;

  const counts = data ? { total: data.length, kosong: data.filter((u) => u.status === "kosong").length } : null;
  const numColumns = 2;
  const open = (id: string) => (wide ? setSelected(id) : router.push(`/unit/${id}` as any));

  const list = (
    <View style={s.root}>
      <TabHeader
        title="Unit"
        sub={counts && filter === "semua" ? `${counts.total} unit · ${counts.kosong} kosong` : null}
        right={<Button title="Tambah" icon="plus" size="sm" onPress={openAdd} testID="add-unit-button" />}
      />

      {isFree && plan ? (
        <PressableScale onPress={() => showUpgrade(plan.hidden_units > 0 ? "hidden_units" : "general")} testID="unit-usage">
          <RNText style={s.usage}>
            {plan.hidden_units > 0
              ? `${plan.hidden_units} unit disembunyikan (paket Free) · Upgrade untuk menampilkan`
              : `${plan.usage.units}/${plan.limits.max_units} unit · paket Free`}
          </RNText>
        </PressableScale>
      ) : null}

      <ChipRow testID="unit-filter-row">
        {STATUS_FILTERS.map((st) => (
          <Chip key={st.key} label={st.label} active={filter === st.key} onPress={() => setFilter(st.key)} testID={`unit-filter-${st.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner label="Memuat unit…" />
      ) : error ? (
        <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>
      ) : (
        <FlatList
          key={`cols-${numColumns}`}
          data={data || []}
          keyExtractor={(u) => u.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: spacing.md } : undefined}
          contentContainerStyle={s.gridContent}
          renderItem={({ item }) => (
            <View style={{ flex: 1 / numColumns }}>
              <Card
                testID={`unit-card-${item.id}`}
                onPress={() => open(item.id)}
                style={[STATE_TRANSITION, s.unitCard, wide && selected === item.id && s.unitCardSelected]}
              >
                <View>
                  <UnitThumb photo={item.photos?.[0]} height={wide ? 130 : 118} radiusSize={0} testID={`unit-thumb-${item.id}`} />
                  <View style={s.statusOverlay}>
                    <StatusPill label={UNIT_STATUS[item.status] || item.status} tone={item.status === "kosong" ? "info" : item.status === "terisi" ? "success" : item.status === "reserved" ? "warning" : "error"} testID={`unit-status-${item.id}`} solid />
                  </View>
                </View>
                <View style={s.unitBody}>
                  <RNText style={s.unitName} numberOfLines={1}>{item.name}</RNText>
                  <RNText style={s.unitSub} numberOfLines={1}>{item.unit_type} · {item.property_name || "-"}</RNText>
                  <RNText style={s.price} numberOfLines={1}>
                    {rupiah(item.monthly_price)}
                    <RNText style={s.perMonth}>/bln</RNText>
                  </RNText>
                  <RNText style={s.vacant} numberOfLines={1}>
                    {item.status === "kosong"
                      ? `Kosong ${Math.max(daysFromNow(item.vacant_since) ?? 0, 0)} hari`
                      : item.status === "reserved" && item.available_date
                        ? `Available ${item.available_date}`
                        : item.status === "terisi"
                          ? "Ada tenant"
                          : " "}
                  </RNText>
                </View>
              </Card>
            </View>
          )}
          ListEmptyComponent={
            empty ? (
              <EmptyState
                art="units"
                title={filter === "semua" ? "Belum ada unit" : "Tidak ada unit di status ini"}
                subtitle="Tambah unit yang kamu pasarkan. SewAIn cocokkan dengan prospek yang masuk."
                action={
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <Button title="Tambah Unit" icon="plus" onPress={openAdd} testID="empty-add-unit-button" />
                    <Button title="Halaman Setup" variant="ghost" onPress={() => router.push("/setup")} testID="empty-setup-button" />
                  </View>
                }
              />
            ) : null
          }
        />
      )}
    </View>
  );

  return (
    <>
      <SplitView
        list={list}
        listWidth={520}
        detail={selected ? <UnitDetail key={selected} id={selected} embedded onGone={() => setSelected(null)} /> : null}
        emptyArt="units"
        emptyText="Pilih unit untuk lihat detail, pemilik, dan tenant-nya."
      />
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Tambah Unit" testID="add-unit-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          {(properties?.length ?? 0) === 0 ? (
            <View style={{ gap: spacing.md }}>
              <ErrorBox message="Tambahkan properti (gedung / kos / area) dulu, lalu kembali ke sini." />
              <Button title="Tambah Properti" onPress={() => { setAddOpen(false); router.push("/setup"); }} testID="units-go-setup" />
            </View>
          ) : (
            <>
              <Field label="Properti">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {properties!.map((p) => (
                    <Chip key={p.id} label={p.name} active={f.property_id === p.id} onPress={() => setF({ ...f, property_id: p.id })} />
                  ))}
                </ScrollView>
              </Field>
              <Field label="Nama unit">
                <Input testID="unit-name-input" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="mis. A12" />
              </Field>
              <Field label="Tipe unit">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {TYPE_OPTIONS.map((t) => (
                    <Chip key={t} label={t} active={f.unit_type === t} onPress={() => setF({ ...f, unit_type: t })} />
                  ))}
                </ScrollView>
              </Field>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Harga / bulan">
                    <Input testID="unit-price-input" value={f.monthly_price} onChangeText={(v) => setF({ ...f, monthly_price: v })} placeholder="3200000" keyboardType="numeric" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Deposit">
                    <Input testID="unit-deposit-input" value={f.deposit} onChangeText={(v) => setF({ ...f, deposit: v })} placeholder="1200000" keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Kamar tidur">
                    <Input testID="unit-bedrooms-input" value={f.bedrooms} onChangeText={(v) => setF({ ...f, bedrooms: v })} keyboardType="numeric" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Kamar mandi">
                    <Input testID="unit-bathrooms-input" value={f.bathrooms} onChangeText={(v) => setF({ ...f, bathrooms: v })} keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <Field label="Fasilitas (pisah pakai koma)">
                <Input testID="unit-facilities-input" value={f.facilities} onChangeText={(v) => setF({ ...f, facilities: v })} placeholder="AC, WiFi, Kasur" />
              </Field>
              <SwitchRow label="Fully furnished" value={f.furnished} onChange={(v) => setF({ ...f, furnished: v })} testID="unit-furnished-switch" />
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Pemilik (opsional)">
                    <Input testID="unit-owner-name-input" value={f.owner_name} onChangeText={(v) => setF({ ...f, owner_name: v })} placeholder="mis. Pak Hendra" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="HP pemilik">
                    <Input testID="unit-owner-phone-input" value={f.owner_phone} onChangeText={(v) => setF({ ...f, owner_phone: v })} placeholder="0812…" keyboardType="phone-pad" />
                  </Field>
                </View>
              </View>
              <Button title="Simpan Unit" onPress={() => createUnit.mutate()} loading={createUnit.isPending} testID="unit-save-button" />
            </>
          )}
        </View>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  usage: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14, paddingHorizontal: spacing.lg, marginTop: -4, marginBottom: spacing.sm },
  gridContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.md },
  unitCard: { padding: 0, overflow: "hidden", borderWidth: 1.5, borderColor: "transparent" },
  unitCardSelected: { borderColor: colors.brandPrimary },
  statusOverlay: { position: "absolute", top: 10, left: 10 },
  unitBody: { padding: 14, gap: 3 },
  unitName: { color: colors.onSurface, ...fonts.semibold, fontSize: 17, letterSpacing: -0.2 },
  unitSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 13.5 },
  price: { color: colors.onSurface, ...fonts.bold, fontSize: 17, marginTop: 6 },
  perMonth: { color: colors.muted, ...fonts.regular, fontSize: 13 },
  vacant: { color: colors.muted, ...fonts.regular, fontSize: 13 },
}));
