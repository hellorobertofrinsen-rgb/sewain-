import React, { useState } from "react";
import { FlatList, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Field, Input, Spinner, StatusPill, SwitchRow } from "@/src/components/ui";
import { UnitThumb } from "@/src/components/UnitThumb";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { UNIT_STATUS, daysFromNow, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

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
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const params = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState(params.status || "semua");
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["units", filter],
    queryFn: () => api<any[]>(`/units?status=${filter}`),
  });
  const { data: properties } = useQuery({ queryKey: ["properties"], queryFn: () => api<any[]>("/properties") });

  // form
  const [f, setF] = useState({ property_id: "", name: "", unit_type: "Studio", monthly_price: "", deposit: "", bedrooms: "1", bathrooms: "1", furnished: true, facilities: "", notes: "" });

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
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["impact"] });
      toast("Unit ditambahkan ✓");
      setAddOpen(false);
      setF({ ...f, name: "", monthly_price: "", deposit: "", facilities: "", notes: "" });
    },
    onError: (e: any) => toast(e?.message || "Gagal menambah unit", "error"),
  });

  const empty = !isLoading && data && data.length === 0;

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <RNText style={s.title}>Unit</RNText>
        <Pressable testID="add-unit-button" onPress={() => setAddOpen(true)} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}>
          <Icon name="plus" size={18} color={colors.onBrandPrimary} />
          <RNText style={s.addText}>Tambah</RNText>
        </Pressable>
      </View>

      <ChipRow testID="unit-filter-row">
        {STATUS_FILTERS.map((st) => (
          <Chip key={st.key} label={st.label} active={filter === st.key} onPress={() => setFilter(st.key)} testID={`unit-filter-${st.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner label="Memuat unit…" />
      ) : error ? (
        <ErrorBox message={(error as any)?.message} onRetry={refetch} />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + spacing.xxxl, gap: spacing.md, paddingTop: spacing.xs }}
          renderItem={({ item }) => (
            <Card testID={`unit-card-${item.id}`} onPress={() => router.push(`/unit/${item.id}` as any)} style={{ padding: 0, overflow: "hidden" }}>
              <View style={{ position: "relative" }}>
                <UnitThumb photo={item.photos?.[0]} height={150} radiusSize={0} testID={`unit-thumb-${item.id}`} />
                <View style={s.statusOverlay}>
                  <StatusPill label={UNIT_STATUS[item.status] || item.status} tone={item.status === "kosong" ? "info" : item.status === "terisi" ? "success" : item.status === "reserved" ? "warning" : "error"} testID={`unit-status-${item.id}`} />
                </View>
              </View>
              <View style={{ padding: spacing.lg, gap: 2 }}>
                <RNText style={s.unitName}>{item.name}</RNText>
                <RNText style={s.unitSub}>{item.unit_type} · {item.property_name || "-"}</RNText>
                <View style={s.cardFoot}>
                  <RNText style={s.price}>
                    {rupiah(item.monthly_price)}
                    <RNText style={s.perMonth}> / bulan</RNText>
                  </RNText>
                  {item.status === "kosong" ? (
                    <RNText style={s.vacant}>Kosong {Math.max(daysFromNow(item.vacant_since) ?? 0, 0)} hari</RNText>
                  ) : item.status === "reserved" && item.available_date ? (
                    <RNText style={s.vacant}>Available {item.available_date}</RNText>
                  ) : null}
                </View>
              </View>
            </Card>
          )}
          ListEmptyComponent={
            empty ? (
              <EmptyState
                icon="grid"
                title={filter === "semua" ? "Belum ada unit terdaftar" : "Tidak ada unit di status ini"}
                subtitle="Tambah unit manual, impor CSV, atau isi lewat halaman setup."
                action={
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button title="Tambah Unit" onPress={() => setAddOpen(true)} testID="empty-add-unit-button" />
                    <Button title="Halaman Setup" variant="ghost" onPress={() => router.push("/setup")} testID="empty-setup-button" />
                  </View>
                }
              />
            ) : null
          }
        />
      )}

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Tambah Unit" testID="add-unit-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          {(properties?.length ?? 0) === 0 ? (
            <ErrorBox message="Tambahkan properti dulu di halaman Setup, lalu kembali ke sini." />
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
              <Button title="Simpan Unit" onPress={() => createUnit.mutate()} loading={createUnit.isPending} testID="unit-save-button" />
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
  statusOverlay: { position: "absolute", top: spacing.md, right: spacing.md },
  unitName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  unitSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13 },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  price: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  perMonth: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  vacant: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
}));
