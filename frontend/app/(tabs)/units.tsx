import React, { useState } from "react";
import { FlatList, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Sheet } from "@/src/components/Sheet";
import { TabHeader } from "@/src/components/TabHeader";
import { SplitView } from "@/src/components/SplitView";
import { UnitDetail } from "@/app/unit/[id]";
import { useIsWide } from "@/src/lib/layout";
import { t } from "@/src/lib/i18n";
import { useParamTrigger } from "@/src/lib/useParamTrigger";
import { UnitForm, UnitFormValue, emptyUnitForm, unitFormBody, unitFormValid } from "@/src/components/UnitForm";
import { unitKind } from "@/src/lib/unitKinds";
import { STATE_TRANSITION } from "@/src/motion";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Spinner, StatusPill, PressableScale } from "@/src/components/ui";
import { UnitThumb } from "@/src/components/UnitThumb";
import { PriceTags, hasPrice } from "@/src/components/PriceTags";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { UNIT_STATUS, daysFromNow } from "@/src/lib/format";
import { fonts, makeStyles, spacing } from "@/src/theme";

const STATUS_FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "kosong", label: "Kosong" },
  { key: "terisi", label: "Terisi" },
  { key: "reserved", label: "Reserved" },
  { key: "maintenance", label: "Renovating" },
];


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
  // form
  const [f, setF] = useState<UnitFormValue>(emptyUnitForm);

  const createUnit = useMutation({
    mutationFn: () => api("/units", { method: "POST", body: unitFormBody(f) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      toast(t("Unit ditambahkan ✓"));
      setAddOpen(false);
      setF(emptyUnitForm);
    },
    onError: (e: any) => {
      if (e?.code) setAddOpen(false);
      else toast(e?.message || t("Gagal menambah unit"), "error");
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
                    <StatusPill label={UNIT_STATUS[item.status] || item.status} tone={item.status === "kosong" ? "info" : item.status === "terisi" ? "success" : item.status === "reserved" ? "warning" : "neutral"} testID={`unit-status-${item.id}`} solid />
                  </View>
                </View>
                <View style={s.unitBody}>
                  <RNText style={s.unitName} numberOfLines={1}>{item.name}</RNText>
                  <RNText style={s.unitSub} numberOfLines={1}>{unitKind(item) || "-"}</RNText>
                  <View style={{ marginTop: 6 }}>
                    {hasPrice(item) ? <PriceTags unit={item} size="sm" testID={`unit-prices-${item.id}`} /> : <RNText style={s.noPrice}>{t("Belum ada harga")}</RNText>}
                  </View>
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
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t("Tambah Unit")} testID="add-unit-sheet" scroll>
        <View style={{ gap: spacing.lg }}>
          <UnitForm value={f} onChange={setF} />
          <Button title={t("Simpan Unit")} onPress={() => createUnit.mutate()} loading={createUnit.isPending} disabled={!unitFormValid(f)} testID="unit-save-button" />
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
  noPrice: { color: colors.muted, ...fonts.medium, fontSize: 13.5 },
  priceHint: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 19, marginTop: -6 },
}));
