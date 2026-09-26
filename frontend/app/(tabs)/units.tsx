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
import { UnitForm, UnitFormValue, emptyUnitForm, unitFormBody, unitFormMissing } from "@/src/components/UnitForm";
import { FACILITIES, furnishingLabel, unitKind } from "@/src/lib/unitKinds";
import { Icon } from "@/src/components/Icon";
import { availability } from "@/src/lib/availability";
import { STATE_TRANSITION } from "@/src/motion";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Spinner, StatusPill, PressableScale } from "@/src/components/ui";
import { UnitThumb } from "@/src/components/UnitThumb";
import { PriceTags, hasPrice } from "@/src/components/PriceTags";
import { useToast } from "@/src/components/Toast";
import { api, uploadFile } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

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
  const { colors } = useTheme();
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
  const missing = unitFormMissing(f, true);

  const createUnit = useMutation({
    mutationFn: async () => {
      const u = await api<any>("/units", { method: "POST", body: unitFormBody(f) });
      // Photos go up one by one after the unit exists; the first becomes the cover.
      for (let i = 0; i < f.photos.length; i++) {
        await uploadFile(`/units/${u.id}/photos`, f.photos[i], `foto-${i + 1}.jpg`).catch(() => null);
      }
      return u;
    },
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
        title={t("Unit||tab")}
        sub={counts && filter === "semua" ? t("{n} unit · {k} kosong", { n: counts.total, k: counts.kosong }) : null}
        right={<Button title={t("Tambah")} icon="plus" size="sm" onPress={openAdd} testID="add-unit-button" />}
      />

      {isFree && plan ? (
        <PressableScale onPress={() => showUpgrade(plan.hidden_units > 0 ? "hidden_units" : "general")} testID="unit-usage">
          <RNText style={s.usage}>
            {plan.hidden_units > 0
              ? t("{n} unit disembunyikan (paket Free) · Upgrade untuk menampilkan", { n: plan.hidden_units })
              : t("{a}/{b} unit · paket Free", { a: plan.usage.units, b: plan.limits.max_units })}
          </RNText>
        </PressableScale>
      ) : null}

      <ChipRow testID="unit-filter-row">
        {STATUS_FILTERS.map((st) => (
          <Chip key={st.key} label={t(st.label)} active={filter === st.key} onPress={() => setFilter(st.key)} testID={`unit-filter-${st.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner label={t("Memuat unit…")} />
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
                    <StatusPill label={availability(item).label} tone={availability(item).tone} testID={`unit-status-${item.id}`} solid />
                  </View>
                </View>
                <View style={s.unitBody}>
                  <RNText style={s.unitName} numberOfLines={1}>{item.name}</RNText>
                  <RNText style={s.unitSub} numberOfLines={1}>{unitKind(item) || "-"}</RNText>
                  {item.residence ? <RNText style={s.unitSub} numberOfLines={1} testID={`unit-residence-${item.id}`}>{item.residence}</RNText> : null}
                  <View style={{ marginTop: 6 }}>
                    {hasPrice(item) ? <PriceTags unit={item} size="sm" testID={`unit-prices-${item.id}`} /> : <RNText style={s.noPrice}>{t("Belum ada harga")}</RNText>}
                  </View>
                  {item.furnishing ? <RNText style={s.vacant} numberOfLines={1}>{furnishingLabel(item.furnishing)}</RNText> : null}
                  {facilities(item).length ? (
                    <View style={s.facilities} testID={`unit-facilities-${item.id}`}>
                      {facilities(item).map((f) => (
                        <View key={f} style={s.facility}>
                          <Icon name="check" size={11} color={colors.success} strokeWidth={2.8} />
                          <RNText style={s.facilityText}>{f}</RNText>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Card>
            </View>
          )}
          ListEmptyComponent={
            empty ? (
              <EmptyState
                art="units"
                title={filter === "semua" ? t("Belum ada unit") : t("Tidak ada unit di status ini")}
                subtitle={t("Tambah unit yang kamu pasarkan. SewAIn cocokkan dengan prospek yang masuk.")}
                action={
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <Button title={t("Tambah Unit")} icon="plus" onPress={openAdd} testID="empty-add-unit-button" />
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
        emptyText={t("Pilih unit untuk lihat detail, pemilik, dan tenant-nya.")}
      />
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t("Tambah Unit")} testID="add-unit-sheet" scroll>
        <View style={{ gap: spacing.lg }}>
          <UnitForm value={f} onChange={setF} withPhotos />
          {missing.length ? <RNText style={s.missing} testID="unit-missing">{t("Belum diisi: {fields}", { fields: missing.join(", ") })}</RNText> : null}
          <Button title={t("Simpan Unit")} onPress={() => createUnit.mutate()} loading={createUnit.isPending} disabled={missing.length > 0} testID="unit-save-button" />
        </View>
      </Sheet>
    </>
  );
}

const facilities = (u: any): string[] => (u.facilities || []).filter((f: string) => FACILITIES.includes(f));

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
  facilities: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  facility: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surface },
  facilityText: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 12 },
  missing: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 19, textAlign: "center" },
  noPrice: { color: colors.muted, ...fonts.medium, fontSize: 13.5 },
  priceHint: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 19, marginTop: -6 },
}));
