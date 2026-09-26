import React, { useState } from "react";
import { Clipboard, ScrollView, Text as RNText, View } from "react-native";
import * as ClipboardLib from "expo-clipboard";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, ErrorBox, Field, Input, SectionTitle } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

const PROP_TYPES = ["apartment", "kos", "villa", "kontrakan", "coliving"];
const TYPE_LABEL: Record<string, string> = {
  apartment: "Apartemen",
  kos: "Kos",
  villa: "Villa",
  kontrakan: "Kontrakan",
  coliving: "Coliving",
  lainnya: "Lainnya",
};

export default function SetupScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState<any>(null);

  const [pOpen, setPOpen] = useState(false);
  const [pf, setPf] = useState({ name: "", type: "apartment", city: "", area: "" });

  const { data: properties } = useQuery({ queryKey: ["properties"], queryFn: () => api<any[]>("/properties") });
  const { data: csvExample } = useQuery({ queryKey: ["csv-example"], queryFn: () => api<{ csv: string }>("/examples/units-csv"), staleTime: Infinity });

  const [uf, setUf] = useState({ property_id: "", name: "", unit_type: "Studio", monthly_price: "", bedrooms: "1", bathrooms: "1" });

  const createProperty = useMutation({
    mutationFn: () => api("/properties", { method: "POST", body: { ...pf, city: pf.city || null, area: pf.area || null } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast("Properti ditambahkan ✓ — lanjut tambah unitnya");
      setUf({ ...uf, property_id: r.id });
      setPOpen(false);
      setPf({ name: "", type: "apartment", city: "", area: "" });
    },
    onError: (e: any) => toast(e?.message || "Gagal menambah properti", "error"),
  });

  const createUnit = useMutation({
    mutationFn: () =>
      api("/units", {
        method: "POST",
        body: {
          property_id: uf.property_id || properties?.[0]?.id,
          name: uf.name,
          unit_type: uf.unit_type,
          monthly_price: parseInt(uf.monthly_price.replace(/\D/g, "") || "0", 10),
          deposit: 0,
          bedrooms: parseInt(uf.bedrooms || "1", 10) || 1,
          bathrooms: parseInt(uf.bathrooms || "1", 10) || 1,
          furnished: true,
          facilities: [],
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      toast(`Unit ${uf.name} disimpan — tambah lagi atau selesai`);
      setUf({ ...uf, name: "", monthly_price: "" });
    },
    onError: (e: any) => toast(e?.message || "Gagal menambah unit", "error"),
  });

  const importCsv = useMutation({
    mutationFn: () => api("/units/import-csv", { method: "POST", body: { csv_text: csvText } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      setCsvResult(r);
    },
    onError: (e: any) => toast(e?.message || "Gagal impor CSV", "error"),
  });

  const canAddUnit = !!uf.name.trim() && !!uf.monthly_price.trim() && !!(uf.property_id || properties?.length);

  return (
    <View style={s.root}>
      <ScreenHeader title="Mulai Pakai Sewain" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false} testID="setup-screen">
        <RNText style={s.intro}>
          Isi dulu properti & unitmu. Setelah itu, setiap chat calon penyewa bisa langsung dibaca AI Sewain.
        </RNText>

        {/* Option 1: manual */}
        <Card testID="setup-manual-card">
          <RNText style={s.optTitle}>1 · Tambah Manual</RNText>
          <RNText style={s.optSub}>Tambah properti, lalu masukkan unit satu per satu.</RNText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" }}>
            <Button title="Tambah Properti" variant="ghost" size="sm" onPress={() => setPOpen(true)} testID="setup-add-property-button" />
            <Button title="Lihat Properti di Pengaturan" variant="ghost" size="sm" onPress={() => router.push("/settings")} testID="setup-see-properties-button" />
          </View>
          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <Field label="Properti untuk unit baru">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(properties || []).map((p) => (
                  <Chip key={p.id} label={p.name} active={uf.property_id === p.id} onPress={() => setUf({ ...uf, property_id: p.id })} testID={`setup-prop-${p.id}`} />
                ))}
                {(properties || []).length === 0 ? <RNText style={s.hintText}>Belum ada properti — tambah dulu di atas.</RNText> : null}
              </View>
            </Field>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Nama unit">
                  <Input testID="setup-unit-name-input" value={uf.name} onChangeText={(v) => setUf({ ...uf, name: v })} placeholder="mis. A12" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Harga / bulan">
                  <Input testID="setup-unit-price-input" value={uf.monthly_price} onChangeText={(v) => setUf({ ...uf, monthly_price: v })} placeholder="3200000" keyboardType="numeric" />
                </Field>
              </View>
            </View>
            <Field label="Tipe">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["Studio", "1 Bedroom", "2 Bedroom", "Kost 3x3", "Kost 4x5", "Lainnya"].map((t) => (
                  <Chip key={t} label={t} active={uf.unit_type === t} onPress={() => setUf({ ...uf, unit_type: t })} testID={`setup-type-${t}`} />
                ))}
              </View>
            </Field>
            <Button title={canAddUnit ? `Simpan Unit ${uf.name.toUpperCase()}` : "Isi nama unit & harga dulu"} onPress={() => createUnit.mutate()} loading={createUnit.isPending} disabled={!canAddUnit} testID="setup-save-unit-button" />
          </View>
        </Card>

        {/* Option 2: CSV */}
        <Card testID="setup-csv-card">
          <RNText style={s.optTitle}>2 · Impor dari CSV</RNText>
          <RNText style={s.optSub}>Punya daftar unit di Excel? Impor sekali jalan — kolom bisa fleksibel.</RNText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" }}>
            <Button title="Buka Impor CSV" size="sm" onPress={() => setCsvOpen(true)} testID="setup-open-csv-button" />
            <Button
              title="Salin Template"
              variant="ghost"
              size="sm"
              onPress={async () => {
                if (csvExample?.csv) {
                  await ClipboardLib.setStringAsync(csvExample.csv);
                  toast("Template CSV disalin");
                }
              }}
              testID="setup-template-button"
            />
          </View>
        </Card>

        {/* Option 3: chat */}
        <Card testID="setup-chat-card">
          <RNText style={s.optTitle}>3 · Biar AI yang Baca Chat</RNText>
          <RNText style={s.optSub}>Upload ekspor chat WhatsApp (atau tempel teksnya) — Sewain menemukan calon penyewa yang hampir hilang dan mencocokkannya dengan unit kosong.</RNText>
          <Button title="Analisis Chat WhatsApp" onPress={() => router.push("/import-chat")} testID="setup-go-chat-button" style={{ marginTop: spacing.md }} />
        </Card>

        {(properties?.length ?? 0) > 0 ? (
          <Button title="Selesai — Lihat Hari Ini" variant="ghost" onPress={() => router.replace("/today")} testID="setup-done-button" />
        ) : null}
      </ScrollView>

      <Sheet visible={pOpen} onClose={() => setPOpen(false)} title="Tambah Properti" testID="setup-property-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Field label="Nama properti">
            <Input testID="setup-property-name-input" value={pf.name} onChangeText={(v) => setPf({ ...pf, name: v })} placeholder="mis. Tokyo Riverside Apartment" />
          </Field>
          <Field label="Tipe">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PROP_TYPES.map((t) => (
                <Chip key={t} label={TYPE_LABEL[t]} active={pf.type === t} onPress={() => setPf({ ...pf, type: t })} testID={`setup-ptype-${t}`} />
              ))}
            </View>
          </Field>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Kota">
                <Input testID="setup-property-city-input" value={pf.city} onChangeText={(v) => setPf({ ...pf, city: v })} placeholder="Jakarta Utara" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Area">
                <Input testID="setup-property-area-input" value={pf.area} onChangeText={(v) => setPf({ ...pf, area: v })} placeholder="PIK 2" />
              </Field>
            </View>
          </View>
          <Button title="Simpan Properti" onPress={() => createProperty.mutate()} loading={createProperty.isPending} testID="setup-property-save-button" />
        </View>
      </Sheet>

      <Sheet visible={csvOpen} onClose={() => setCsvOpen(false)} title="Impor Unit dari CSV" testID="setup-csv-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Input
            testID="setup-csv-text-input"
            value={csvText}
            onChangeText={setCsvText}
            multiline
            placeholder="Tempel isi CSV di sini…"
            style={{ minHeight: 140 }}
          />
          <Button title="Impor Sekarang" onPress={() => importCsv.mutate()} loading={importCsv.isPending} disabled={!csvText.trim()} testID="setup-csv-import-button" />
          {csvResult ? (
            <Card testID="setup-csv-result-card">
              <RNText style={s.optTitle}>{csvResult.imported} unit berhasil diimpor</RNText>
              {csvResult.errors?.length ? <RNText style={s.optSub}>{csvResult.errors.join("\n")}</RNText> : null}
            </Card>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  optTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15.5 },
  optSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  hintText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5 },
}));
