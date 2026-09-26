import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, ErrorBox, Field, Input, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, readPickedText } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const PROP_TYPES = ["apartment", "kos", "villa", "kontrakan", "coliving"];
const TYPE_LABEL: Record<string, string> = {
  apartment: "Apartemen",
  kos: "Kos",
  villa: "Villa",
  kontrakan: "Kontrakan",
  coliving: "Coliving",
  lainnya: "Lainnya",
};

export default function SettingsScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();
  const [propOpen, setPropOpen] = useState(params.open === "property");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState<any>(null);
  const [f, setF] = useState({ name: "", type: "apartment", city: "", area: "" });

  const { data: properties, isLoading } = useQuery({ queryKey: ["properties"], queryFn: () => api<any[]>("/properties") });
  const { data: csvExample } = useQuery({ queryKey: ["csv-example"], queryFn: () => api<{ csv: string }>("/examples/units-csv"), staleTime: Infinity });

  const createProperty = useMutation({
    mutationFn: () => api("/properties", { method: "POST", body: { ...f, city: f.city || null, area: f.area || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast("Properti ditambahkan ✓ — sekarang tambah unitnya");
      setPropOpen(false);
      setF({ name: "", type: "apartment", city: "", area: "" });
    },
    onError: (e: any) => toast(e?.message || "Gagal menambah properti", "error"),
  });

  const importCsv = useMutation({
    mutationFn: () => api("/units/import-csv", { method: "POST", body: { csv_text: csvText } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["impact"] });
      setCsvResult(r);
    },
    onError: (e: any) => toast(e?.message || "Gagal impor CSV", "error"),
  });

  const pickCsv = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/plain", "application/csv", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const content = await readPickedText(res.assets[0].uri);
      setCsvText(content);
      setCsvResult(null);
    } catch (e: any) {
      toast(e?.message || "Gagal membaca file", "error");
    }
  };

  const initial = (user?.name || "S").charAt(0).toUpperCase();

  return (
    <View style={s.root}>
      <ScreenHeader title="Pengaturan" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false} testID="settings-screen">
        <Card testID="account-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={s.avatar}>
              <RNText style={s.avatarText}>{initial}</RNText>
            </View>
            <View style={{ flex: 1 }}>
              <RNText style={s.userName}>{user?.name}</RNText>
              <RNText style={s.userEmail}>{user?.email}</RNText>
            </View>
            {user?.is_demo ? <StatusPill label="Mode Demo" tone="warning" testID="demo-badge" /> : null}
          </View>
        </Card>

        <View style={{ gap: spacing.md }}>
          <SectionTitle>Properti</SectionTitle>
          {isLoading ? (
            <Spinner />
          ) : (
            (properties || []).map((p) => (
              <Card key={p.id} testID={`property-card-${p.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <RNText style={s.propName}>{p.name}</RNText>
                    <RNText style={s.propMeta}>{TYPE_LABEL[p.type] || p.type}{p.area ? ` · ${p.area}` : ""}{p.city ? `, ${p.city}` : ""}</RNText>
                  </View>
                  <StatusPill label={`${p.unit_count} unit`} tone="neutral" testID={`property-unit-count-${p.id}`} />
                </View>
              </Card>
            ))
          )}
          <Button title="Tambah Properti" variant="ghost" icon="plus" onPress={() => setPropOpen(true)} testID="add-property-button" />
        </View>

        <View style={{ gap: spacing.md }}>
          <SectionTitle>Impor data</SectionTitle>
          <Card>
            <RNText style={s.importTitle}>Impor Unit dari CSV</RNText>
            <RNText style={s.importSub}>Cocok untuk pindahan dari catatan Excel. Ada contoh template yang bisa kamu salin.</RNText>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" }}>
              <Button title="Pilih / Tempel CSV" variant="ghost" size="sm" icon="file" onPress={() => { setCsvOpen(true); setCsvResult(null); }} testID="settings-open-csv-button" />
              <Button
                title="Salin Template"
                variant="ghost"
                size="sm"
                icon="copy"
                onPress={async () => {
                  if (csvExample?.csv) {
                    await Clipboard.setStringAsync(csvExample.csv);
                    toast("Template CSV disalin — tempel di sheet/Excel lalu isi datamu");
                  }
                }}
                testID="settings-template-button"
              />
            </View>
          </Card>
          <Card>
            <RNText style={s.importTitle}>Baca Chat WhatsApp dengan AI</RNText>
            <RNText style={s.importSub}>Upload ekspor chat atau tempel teksnya — Sewain menemukan calon penyewa yang hampir hilang.</RNText>
            <View style={{ marginTop: spacing.md }}>
              <Button title="Buka Analisis Chat" onPress={() => router.push("/import-chat")} testID="settings-go-chat-button" />
            </View>
          </Card>
        </View>

        <View style={{ gap: spacing.md }}>
          <SectionTitle>Data</SectionTitle>
          <Card testID="data-note-card">
            <RNText style={s.aboutBody}>
              {user?.is_demo
                ? "Akun ini berisi data contoh (ditandai “contoh” di log aktivitas). Semua aksi kamu sendiri tercatat sebagai data nyata dan dihitung di halaman Impact."
                : "Data di akun ini milikmu sendiri: properti, unit, calon penyewa, tenant, sampai log aktivitas. Semua tersimpan permanen di database."}
            </RNText>
          </Card>
          <Button title="Keluar" variant="danger" onPress={() => logout()} testID="logout-button" />
        </View>
      </ScrollView>

      <Sheet visible={propOpen} onClose={() => setPropOpen(false)} title="Tambah Properti" testID="add-property-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Field label="Nama properti">
            <Input testID="property-name-input" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="mis. Tokyo Riverside Apartment" />
          </Field>
          <Field label="Tipe">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PROP_TYPES.map((t) => (
                <Chip key={t} label={TYPE_LABEL[t]} active={f.type === t} onPress={() => setF({ ...f, type: t })} testID={`property-type-${t}`} />
              ))}
            </View>
          </Field>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Kota">
                <Input testID="property-city-input" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} placeholder="Jakarta Utara" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Area">
                <Input testID="property-area-input" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} placeholder="PIK 2" />
              </Field>
            </View>
          </View>
          <Button title="Simpan Properti" onPress={() => createProperty.mutate()} loading={createProperty.isPending} testID="property-save-button" />
        </View>
      </Sheet>

      <Sheet visible={csvOpen} onClose={() => setCsvOpen(false)} title="Impor Unit dari CSV" testID="csv-import-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Button title="Pilih File CSV" variant="ghost" icon="file" onPress={pickCsv} testID="csv-pick-button" />
          <Input
            testID="csv-text-input"
            value={csvText}
            onChangeText={setCsvText}
            multiline
            placeholder="…atau tempel isi CSV di sini (kolom: name, property, unit_type, monthly_price, …)"
            style={{ minHeight: 140 }}
          />
          <Button title="Impor Sekarang" onPress={() => importCsv.mutate()} loading={importCsv.isPending} testID="csv-import-button" disabled={!csvText.trim()} />
          {csvResult ? (
            <Card testID="csv-result-card">
              <RNText style={s.userName}>{csvResult.imported} unit berhasil diimpor</RNText>
              {csvResult.properties_created > 0 ? <RNText style={s.propMeta}>{csvResult.properties_created} properti baru dibuat otomatis</RNText> : null}
              {csvResult.errors?.length ? <RNText style={s.importSub}>{csvResult.errors.join("\n")}</RNText> : null}
            </Card>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 17 },
  userName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  userEmail: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  propName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  propMeta: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12.5, marginTop: 2 },
  importTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  importSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  aboutBody: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
}));
