import React, { useEffect, useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Input, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { PropertyForm, TYPE_LABEL } from "@/src/components/PropertyForm";
import { api, downloadFile, readPickedText } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { usePlan } from "@/src/lib/plan";
import { canPromptInstall, isIOS, isInstalled, onInstallChange, promptInstall } from "@/src/lib/install";
import { dateLabel, todayISO } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const EXPORTS = [
  { kind: "units", label: "Unit" },
  { kind: "leads", label: "Calon penyewa" },
  { kind: "tenants", label: "Tenant" },
  { kind: "payments", label: "Tagihan" },
];

export default function SettingsScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { plan, isFree, showUpgrade } = usePlan();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();
  const [propOpen, setPropOpen] = useState(params.open === "property");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState<any>(null);
  const [f, setF] = useState({ name: "", type: "apartment", city: "", area: "" });
  const [, rerender] = useState(0);

  useEffect(() => {
    const off = onInstallChange(() => rerender((x) => x + 1));
    return () => { off(); };
  }, []);

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
      for (const key of ["units", "today", "properties", "plan"]) qc.invalidateQueries({ queryKey: [key] });
      setCsvResult(r);
    },
    onError: (e: any) => {
      if (e?.code) setCsvOpen(false);
      else toast(e?.message || "Gagal impor CSV", "error");
    },
  });

  const openCsv = () => {
    if (plan && !plan.limits.bulk_import) return showUpgrade("feature_bulk_import");
    setCsvOpen(true);
    setCsvResult(null);
  };
  const doExport = async (kind: string) => {
    if (plan && !plan.limits.export_data) return showUpgrade("feature_export");
    try {
      await downloadFile(`/export/${kind}`, `sewain-${kind}-${todayISO()}.csv`);
    } catch (e: any) {
      if (!e?.code) toast(e?.message || "Gagal export", "error");
    }
  };
  const pickCsv = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/plain", "application/csv", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      setCsvText(await readPickedText(res.assets[0].uri));
      setCsvResult(null);
    } catch (e: any) {
      toast(e?.message || "Gagal membaca file", "error");
    }
  };

  const initial = (user?.name || "S").charAt(0).toUpperCase();
  const installed = isInstalled();

  return (
    <View style={s.root}>
      <ScreenHeader title="Pengaturan" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} showsVerticalScrollIndicator={false} testID="settings-screen">
        <Card testID="account-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={s.avatar}>
              <RNText style={s.avatarText}>{initial}</RNText>
            </View>
            <View style={{ flex: 1 }}>
              <RNText style={s.userName}>{user?.name}</RNText>
              <RNText style={s.userEmail}>{user?.email}</RNText>
            </View>
            {plan ? <StatusPill label={plan.label} tone={plan.plan === "premium" ? "brand" : plan.plan === "demo" ? "warning" : "neutral"} testID="plan-pill" /> : null}
          </View>
        </Card>

        {/* Plan */}
        {plan ? (
          <Card testID="plan-card">
            <RNText style={s.cardTitle}>Paket {plan.label}</RNText>
            {plan.plan === "premium" ? (
              <RNText style={s.cardSub}>
                {plan.premium_until ? `Aktif sampai ${dateLabel(plan.premium_until + "T00:00:00")}.` : "Aktif."} Unit & calon penyewa tanpa batas.
              </RNText>
            ) : plan.plan === "demo" ? (
              <RNText style={s.cardSub}>
                Akun demo berisi data contoh{plan.demo_expires_at ? ` dan otomatis dihapus ${dateLabel(plan.demo_expires_at)}` : ""}. Daftar akun sendiri untuk menyimpan datamu.
              </RNText>
            ) : (
              <>
                <Usage label="Unit" used={plan.usage.units} max={plan.limits.max_units} />
                <Usage label="Calon penyewa aktif" used={plan.usage.active_leads} max={plan.limits.max_active_leads} />
                {plan.hidden_units > 0 ? <RNText style={s.warn}>{plan.hidden_units} unit disembunyikan. Upgrade untuk menampilkan lagi.</RNText> : null}
              </>
            )}
            {plan.plan !== "demo" ? (
              <Button
                title={plan.plan === "premium" ? "Perpanjang Premium" : "Upgrade ke Premium"}
                variant={plan.plan === "premium" ? "ghost" : "primary"}
                onPress={() => showUpgrade("general")}
                testID="settings-upgrade-button"
                style={{ marginTop: spacing.md }}
              />
            ) : null}
          </Card>
        ) : null}

        {!installed ? (
          <Card testID="install-card">
            <RNText style={s.cardTitle}>Pasang Sewain di HP</RNText>
            {canPromptInstall() ? (
              <>
                <RNText style={s.cardSub}>Buka Sewain langsung dari layar utama, tampil penuh seperti aplikasi.</RNText>
                <Button title="Pasang Aplikasi" icon="upload" onPress={() => promptInstall()} testID="install-button" style={{ marginTop: spacing.md }} />
              </>
            ) : isIOS() ? (
              <RNText style={s.cardSub}>Di iPhone: buka di Safari, ketuk tombol Bagikan (kotak dengan panah ke atas), lalu pilih “Tambah ke Layar Utama”.</RNText>
            ) : (
              <RNText style={s.cardSub}>Di Chrome: buka menu ⋮ lalu pilih “Instal aplikasi” atau “Tambahkan ke layar utama”.</RNText>
            )}
          </Card>
        ) : null}

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
          <SectionTitle>Data</SectionTitle>
          <Card>
            <View style={s.titleRow}>
              <RNText style={s.cardTitle}>Impor unit dari CSV</RNText>
              {isFree ? <StatusPill label="Premium" tone="neutral" testID="csv-premium-pill" /> : null}
            </View>
            <RNText style={s.cardSub}>Pindahan dari catatan Excel sekaligus. Kolom fleksibel — salin template-nya dulu.</RNText>
            <View style={s.btnRow}>
              <Button title="Impor CSV" variant="ghost" size="sm" icon="file" onPress={openCsv} testID="settings-open-csv-button" />
              <Button
                title="Salin Template"
                variant="ghost"
                size="sm"
                icon="copy"
                onPress={async () => {
                  if (csvExample?.csv) {
                    await Clipboard.setStringAsync(csvExample.csv);
                    toast("Template CSV disalin — tempel di Excel / Google Sheets");
                  }
                }}
                testID="settings-template-button"
              />
            </View>
          </Card>
          <Card>
            <View style={s.titleRow}>
              <RNText style={s.cardTitle}>Export data</RNText>
              {isFree ? <StatusPill label="Premium" tone="neutral" testID="export-premium-pill" /> : null}
            </View>
            <RNText style={s.cardSub}>Unduh datamu kapan saja dalam format CSV (bisa dibuka di Excel).</RNText>
            <View style={s.btnRow}>
              {EXPORTS.map((e) => (
                <Button key={e.kind} title={e.label} variant="ghost" size="sm" icon="upload" onPress={() => doExport(e.kind)} testID={`export-${e.kind}`} />
              ))}
            </View>
          </Card>
          <Button title="Keluar" variant="danger" onPress={() => logout()} testID="logout-button" />
        </View>
      </ScrollView>

      <Sheet visible={propOpen} onClose={() => setPropOpen(false)} title="Tambah Properti" testID="add-property-sheet" scroll>
        <PropertyForm f={f} setF={setF} onSave={() => createProperty.mutate()} saving={createProperty.isPending} />
      </Sheet>

      <Sheet visible={csvOpen} onClose={() => setCsvOpen(false)} title="Impor Unit dari CSV" testID="csv-import-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Button title="Pilih File CSV" variant="ghost" icon="file" onPress={pickCsv} testID="csv-pick-button" />
          <Input
            testID="csv-text-input"
            value={csvText}
            onChangeText={setCsvText}
            multiline
            placeholder="…atau tempel isi CSV di sini (kolom: name, property, unit_type, monthly_price, owner_name, …)"
            style={{ minHeight: 140 }}
          />
          <Button title="Impor Sekarang" onPress={() => importCsv.mutate()} loading={importCsv.isPending} testID="csv-import-button" disabled={!csvText.trim()} />
          {csvResult ? (
            <Card testID="csv-result-card">
              <RNText style={s.userName}>{csvResult.imported} unit berhasil diimpor</RNText>
              {csvResult.properties_created > 0 ? <RNText style={s.propMeta}>{csvResult.properties_created} properti baru dibuat otomatis</RNText> : null}
              {csvResult.errors?.length ? <RNText style={s.cardSub}>{csvResult.errors.join("\n")}</RNText> : null}
            </Card>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const s = useStyles();
  const { colors } = useTheme();
  const pct = max ? Math.min(1, used / max) : 0;
  const full = max != null && used >= max;
  return (
    <View style={{ marginTop: spacing.md, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <RNText style={s.cardSub}>{label}</RNText>
        <RNText style={[s.cardSub, full && { color: colors.warning }]}>{used}/{max ?? "∞"}</RNText>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.max(pct * 100, 2)}%`, backgroundColor: full ? colors.warning : colors.onSurface }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: "100%", alignSelf: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 17 },
  userName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  userEmail: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  propName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  propMeta: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12.5, marginTop: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  cardTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  cardSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  warn: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12.5, marginTop: spacing.md },
  btnRow: { flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
}));
