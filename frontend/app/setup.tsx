import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { PropertyForm, emptyProperty } from "@/src/components/PropertyForm";
import { Button, Card, Chip, Field, Input, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { moneyInput, parseMoney } from "@/src/lib/format";
import { fonts, makeStyles, spacing } from "@/src/theme";

const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom", "Kost", "Rumah", "Villa"];

export default function SetupScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { plan, isFree, atUnitLimit, showUpgrade } = usePlan();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [pOpen, setPOpen] = useState(false);
  const [pf, setPf] = useState(emptyProperty);
  const [uf, setUf] = useState({ property_id: "", name: "", unit_type: "Studio", monthly_price: "", owner_name: "", owner_phone: "" });
  const [added, setAdded] = useState<string[]>([]);

  const { data: properties } = useQuery({ queryKey: ["properties"], queryFn: () => api<any[]>("/properties") });
  const propertyId = uf.property_id || properties?.[properties.length - 1]?.id || "";

  const createProperty = useMutation({
    mutationFn: () => api<any>("/properties", { method: "POST", body: { ...pf, city: pf.city || null, area: pf.area || null } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast("Properti ditambahkan ✓ — lanjut isi unitnya");
      setUf((cur) => ({ ...cur, property_id: r.id })); // keep whatever was typed meanwhile
      setPOpen(false);
      setPf(emptyProperty);
    },
    onError: (e: any) => toast(e?.message || "Gagal menambah properti", "error"),
  });
  const createUnit = useMutation({
    mutationFn: (_saved: { name: string; raw: string }) =>
      api("/units", {
        method: "POST",
        body: {
          property_id: propertyId,
          name: uf.name.trim(),
          unit_type: uf.unit_type,
          monthly_price: parseMoney(uf.monthly_price) ?? 0,
          owner_name: uf.owner_name.trim() || null,
          owner_phone: uf.owner_phone.trim() || null,
        },
      }),
    onSuccess: (_r: unknown, saved: { name: string; raw: string }) => {
      for (const key of ["units", "today", "properties", "plan"]) qc.invalidateQueries({ queryKey: [key] });
      toast(`Unit ${saved.name} tersimpan ✓`);
      setAdded((cur) => [...cur, saved.name]);
      // Only clear the fields if they still hold the unit that was just saved.
      setUf((cur) => (cur.name === saved.raw ? { ...cur, name: "", monthly_price: "" } : cur));
    },
    onError: (e: any) => {
      if (!e?.code) toast(e?.message || "Gagal menambah unit", "error");
    },
  });

  const canAddUnit = !!uf.name.trim() && !!parseMoney(uf.monthly_price) && !!propertyId;
  const hasProperty = (properties?.length ?? 0) > 0;

  return (
    <View style={s.root}>
      <ScreenHeader title="Isi Unit & Properti" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled" testID="setup-screen">
        <RNText style={s.intro}>Dua langkah: properti (gedung, kos, atau area), lalu unit-unit yang kamu pasarkan di dalamnya.</RNText>

        <Card testID="setup-property-card">
          <RNText style={s.step}>1 · Properti</RNText>
          <View style={s.wrap}>
            {(properties || []).map((p) => (
              <Chip key={p.id} label={p.name} active={propertyId === p.id} onPress={() => setUf({ ...uf, property_id: p.id })} testID={`setup-prop-${p.id}`} />
            ))}
          </View>
          <Button title={hasProperty ? "Properti Lain" : "Tambah Properti"} variant={hasProperty ? "ghost" : "primary"} size="sm" icon="plus" onPress={() => setPOpen(true)} testID="setup-add-property-button" style={{ alignSelf: "flex-start", marginTop: spacing.md }} />
        </Card>

        <Card testID="setup-unit-card" style={!hasProperty ? { opacity: 0.5 } : undefined}>
          <View style={s.titleRow}>
            <RNText style={s.step}>2 · Unit</RNText>
            {isFree && plan ? <RNText style={s.usage}>{plan.usage.units}/{plan.limits.max_units} unit · Free</RNText> : null}
          </View>
          <View style={{ gap: spacing.md, marginTop: spacing.md }}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Field label="Nama unit">
                  <Input testID="setup-unit-name-input" value={uf.name} onChangeText={(v) => setUf({ ...uf, name: v })} placeholder="mis. A12" editable={hasProperty} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Harga / bulan">
                  <Input testID="setup-unit-price-input" value={uf.monthly_price} onChangeText={(v) => setUf({ ...uf, monthly_price: moneyInput(parseMoney(v)) })} placeholder="3.200.000" keyboardType="numeric" editable={hasProperty} />
                </Field>
              </View>
            </View>
            <Field label="Tipe">
              <View style={s.wrap}>
                {UNIT_TYPES.map((t) => (
                  <Chip key={t} label={t} active={uf.unit_type === t} onPress={() => setUf({ ...uf, unit_type: t })} testID={`setup-type-${t}`} />
                ))}
              </View>
            </Field>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Field label="Pemilik (opsional)">
                  <Input testID="setup-owner-name-input" value={uf.owner_name} onChangeText={(v) => setUf({ ...uf, owner_name: v })} placeholder="mis. Pak Hendra" editable={hasProperty} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="HP pemilik">
                  <Input testID="setup-owner-phone-input" value={uf.owner_phone} onChangeText={(v) => setUf({ ...uf, owner_phone: v })} placeholder="0812…" keyboardType="phone-pad" editable={hasProperty} />
                </Field>
              </View>
            </View>
            <Button
              title={atUnitLimit ? "Batas unit Free tercapai" : canAddUnit ? `Simpan Unit ${uf.name.trim().toUpperCase()}` : "Isi nama unit & harga dulu"}
              onPress={() => (atUnitLimit ? showUpgrade("limit_units") : createUnit.mutate({ name: uf.name.trim(), raw: uf.name }))}
              loading={createUnit.isPending}
              disabled={!atUnitLimit && !canAddUnit}
              testID="setup-save-unit-button"
            />
            {added.length ? <RNText style={s.added}>Tersimpan: {added.join(", ")}</RNText> : null}
          </View>
        </Card>

        <Card testID="setup-csv-card">
          <View style={s.titleRow}>
            <RNText style={s.step}>Punya banyak unit di Excel?</RNText>
            {isFree ? <StatusPill label="Premium" tone="neutral" testID="setup-csv-premium" /> : null}
          </View>
          <RNText style={s.sub}>Impor semua unit sekaligus dari file CSV.</RNText>
          <Button
            title="Impor dari CSV"
            variant="ghost"
            size="sm"
            icon="file"
            onPress={() => (plan && !plan.limits.bulk_import ? showUpgrade("feature_bulk_import") : router.push("/settings"))}
            testID="setup-open-csv-button"
            style={{ alignSelf: "flex-start", marginTop: spacing.md }}
          />
        </Card>

        {hasProperty ? <Button title="Selesai — Lihat Hari Ini" variant={added.length ? "primary" : "ghost"} onPress={() => router.replace("/today")} testID="setup-done-button" /> : null}
      </ScrollView>

      <Sheet visible={pOpen} onClose={() => setPOpen(false)} title="Tambah Properti" testID="setup-property-sheet" scroll>
        <PropertyForm f={pf} setF={setPf} onSave={() => createProperty.mutate()} saving={createProperty.isPending} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: "100%", alignSelf: "center" },
  intro: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15.5, lineHeight: 21 },
  step: { color: colors.onSurface, ...fonts.semibold, fontSize: 15.5 },
  sub: { color: colors.muted, ...fonts.regular, fontSize: 14, lineHeight: 18, marginTop: 3 },
  usage: { color: colors.muted, ...fonts.regular, fontSize: 13.5 },
  added: { color: colors.success, ...fonts.medium, fontSize: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
}));
