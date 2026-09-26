import React, { useEffect, useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { MyAvatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Lang, t, useLang } from "@/src/lib/i18n";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Field, Input, ListGroup, ListRow, PressableScale, SectionTitle, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, downloadFile, readPickedText } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { usePlan } from "@/src/lib/plan";
import { canPromptInstall, isIOS, isInstalled, onInstallChange, promptInstall } from "@/src/lib/install";
import { dateLabel, todayISO } from "@/src/lib/format";
import { cardShadow, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const ZONES = [
  { id: "Asia/Jakarta", label: "WIB", sub: "Jawa, Sumatra, Kalimantan Barat & Tengah" },
  { id: "Asia/Makassar", label: "WITA", sub: "Bali, NTB, NTT, Sulawesi, Kalimantan Timur & Selatan" },
  { id: "Asia/Jayapura", label: "WIT", sub: "Maluku, Papua" },
];
const SUPPORT_WA = "6282122232421";

const EXPORTS = [
  { kind: "units", label: "Unit" },
  { kind: "leads", label: "Prospek" },
  { kind: "tenants", label: "Tenant" },
  { kind: "payments", label: "Tagihan" },
];

export default function SettingsScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, logout, applySession, setUserProfile } = useAuth();
  const { plan, isFree, showUpgrade } = usePlan();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState<any>(null);
  const [, rerender] = useState(0);
  const [sheet, setSheet] = useState<null | "zone" | "password" | "delete" | "language">(null);
  const { lang, setLang } = useLang();
  const { colors } = useTheme();
  const changeLang = async (l: Lang) => {
    setSheet(null);
    try {
      const u = await api<any>("/me", { method: "PATCH", body: { language: l } });
      await setUserProfile({ ...user!, ...u });
    } catch {
      // offline: still switch on this device
    }
    setLang(l);
  };
  const [pw, setPw] = useState({ current: "", next: "" });
  const [delPw, setDelPw] = useState("");

  useEffect(() => {
    const off = onInstallChange(() => rerender((x) => x + 1));
    return () => { off(); };
  }, []);

  const { data: csvExample } = useQuery({ queryKey: ["csv-example"], queryFn: () => api<{ csv: string }>("/examples/units-csv"), staleTime: Infinity });

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

  const setZone = useMutation({
    mutationFn: (tz: string) => api<any>("/me", { method: "PATCH", body: { timezone: tz } }),
    onSuccess: async (u) => {
      await setUserProfile({ ...user!, ...u });
      qc.invalidateQueries();
      setSheet(null);
      toast("Zona waktu disimpan ✓");
    },
    onError: (e: any) => toast(e?.message || "Gagal menyimpan", "error"),
  });
  const changePw = useMutation({
    mutationFn: () => api<any>("/auth/change-password", { method: "POST", body: { current_password: pw.current, new_password: pw.next } }),
    onSuccess: async (res) => {
      setSheet(null);
      setPw({ current: "", next: "" });
      await applySession(res);
      toast("Password diganti. Perangkat lain otomatis keluar.");
    },
    onError: (e: any) => toast(e?.message || "Gagal mengganti password", "error"),
  });
  const deleteAccount = useMutation({
    mutationFn: () => api("/auth/delete-account", { method: "POST", body: { password: delPw || null } }),
    onSuccess: async () => {
      setSheet(null);
      await logout();
      toast("Akun dan semua datamu sudah dihapus.");
    },
    onError: (e: any) => toast(e?.message || "Gagal menghapus akun", "error"),
  });
  const zoneLabel = ZONES.find((z) => z.id === (user?.timezone || "Asia/Jakarta"))?.label ?? "WIB";

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

  const installed = isInstalled();

  return (
    <View style={s.root}>
      <ScreenHeader title="Pengaturan" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} showsVerticalScrollIndicator={false} testID="settings-screen">
        <PressableScale soft testID="account-card" onPress={() => router.push("/profile" as any)} style={s.profileCard}>
          <MyAvatar size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={s.userName} numberOfLines={1}>{user?.name}</RNText>
            <RNText style={s.userEmail} numberOfLines={1}>{user?.agency || user?.email}</RNText>
          </View>
          {plan ? <StatusPill label={plan.label} tone={plan.plan === "premium" ? "brand" : plan.plan === "demo" ? "warning" : "neutral"} testID="plan-pill" /> : null}
          <Icon name="chevron-right" size={18} color={colors.borderStrong} />
        </PressableScale>

        {/* Plan */}
        {plan ? (
          <Card testID="plan-card">
            <RNText style={s.cardTitle}>Paket {plan.label}</RNText>
            {plan.plan === "premium" && plan.trial ? (
              <RNText style={s.cardSub}>
                Trial berakhir dalam {plan.trial_days_left} hari{plan.premium_until ? ` (${dateLabel(plan.premium_until + "T00:00:00")})` : ""}. Setelah itu paket Free: {plan.limits.max_units ?? 3} unit pertama tetap tampil, sisanya disimpan aman sampai kamu upgrade.
              </RNText>
            ) : plan.plan === "premium" ? (
              <RNText style={s.cardSub}>
                {plan.premium_until ? `Aktif sampai ${dateLabel(plan.premium_until + "T00:00:00")}.` : "Aktif."} Unit & prospek tanpa batas.
              </RNText>
            ) : plan.plan === "demo" ? (
              <RNText style={s.cardSub}>
                Akun demo berisi data contoh{plan.demo_expires_at ? ` dan otomatis dihapus ${dateLabel(plan.demo_expires_at)}` : ""}. Daftar akun sendiri untuk menyimpan datamu.
              </RNText>
            ) : (
              <>
                <Usage label="Unit" used={plan.usage.units} max={plan.limits.max_units} />
                {plan.trial_ended ? <RNText style={s.cardSub}>Trial Premium sudah selesai. Semua data tetap aman.</RNText> : null}
                <Usage label="Prospek aktif" used={plan.usage.active_leads} max={plan.limits.max_active_leads} />
                {plan.hidden_units > 0 ? <RNText style={s.warn}>{plan.hidden_units} unit disembunyikan. Upgrade untuk menampilkan lagi.</RNText> : null}
              </>
            )}
            {plan.plan !== "demo" ? (
              <Button
                title={plan.plan === "premium" && !plan.trial ? "Perpanjang Premium" : "Upgrade ke Premium"}
                variant={plan.plan === "premium" && !plan.trial ? "ghost" : "primary"}
                onPress={() => showUpgrade("general")}
                testID="settings-upgrade-button"
                style={{ marginTop: spacing.md }}
              />
            ) : null}
          </Card>
        ) : null}

        {!installed ? (
          <Card testID="install-card">
            <RNText style={s.cardTitle}>Pasang SewAIn di HP</RNText>
            {canPromptInstall() ? (
              <>
                <RNText style={s.cardSub}>Buka SewAIn langsung dari layar utama, tampil penuh seperti aplikasi.</RNText>
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
        </View>

        <ListGroup title="Akun" testID="account-group">
          <ListRow label={t("Bahasa")} value={lang === "en" ? "English" : "Bahasa Indonesia"} icon="language" tone="brand" onPress={() => setSheet("language")} testID="settings-language" />
          <ListRow label="Zona waktu" value={zoneLabel} icon="clock" tone="info" onPress={() => setSheet("zone")} testID="settings-timezone" />
          {!user?.is_demo ? <ListRow label="Ganti password" icon="lock" tone="neutral" onPress={() => setSheet("password")} testID="settings-password" /> : null}
          <ListRow
            label="Bantuan lewat WhatsApp"
            icon="whatsapp"
            tone="success"
            onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(`Halo SewAIn, saya butuh bantuan. Email akun: ${user?.email || ""}`)}`)}
            testID="settings-help"
          />
        </ListGroup>

        <ListGroup title="Privasi" footer="Datamu milikmu. Export kapan saja, atau hapus akun beserta seluruh isinya." testID="privacy-group">
          <ListRow label="Kebijakan Privasi" icon="shield" tone="neutral" onPress={() => router.push("/privasi" as any)} testID="settings-privacy" />
          <ListRow label="Ketentuan Layanan" icon="file" tone="neutral" onPress={() => router.push("/ketentuan" as any)} testID="settings-terms" />
          <ListRow label="Hapus akun & semua data" icon="trash" tone="error" destructive onPress={() => setSheet("delete")} testID="settings-delete-account" />
        </ListGroup>

        <Button title="Keluar" variant="ghost" icon="logout" onPress={() => logout()} testID="logout-button" />
      </ScrollView>

      <Sheet visible={sheet === "language"} onClose={() => setSheet(null)} title={t("Bahasa")} testID="language-sheet">
        <ListGroup>
          {(["id", "en"] as Lang[]).map((l) => (
            <ListRow
              key={l}
              label={l === "en" ? "English" : "Bahasa Indonesia"}
              onPress={() => changeLang(l)}
              right={lang === l ? <StatusPill label={t("Dipakai")} tone="brand" /> : undefined}
              testID={`language-${l}`}
            />
          ))}
        </ListGroup>
      </Sheet>

      <Sheet visible={sheet === "zone"} onClose={() => setSheet(null)} title="Zona waktu" testID="timezone-sheet">
        <View style={{ gap: spacing.sm }}>
          <RNText style={s.cardSub}>Dipakai untuk “hari ini”, jatuh tempo tagihan, dan jam viewing.</RNText>
          <ListGroup>
            {ZONES.map((z) => (
              <ListRow
                key={z.id}
                label={z.label}
                sub={z.sub}
                onPress={() => setZone.mutate(z.id)}
                right={zoneLabel === z.label ? <StatusPill label="Dipakai" tone="brand" /> : undefined}
                testID={`timezone-${z.label}`}
              />
            ))}
          </ListGroup>
        </View>
      </Sheet>

      <Sheet visible={sheet === "password"} onClose={() => setSheet(null)} title="Ganti password" testID="password-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Field label="Password sekarang">
            <Input testID="pw-current" value={pw.current} onChangeText={(v) => setPw({ ...pw, current: v })} secureTextEntry autoComplete="current-password" />
          </Field>
          <Field label="Password baru" hint="Minimal 8 karakter. Perangkat lain akan otomatis keluar.">
            <Input testID="pw-new" value={pw.next} onChangeText={(v) => setPw({ ...pw, next: v })} secureTextEntry autoComplete="new-password" />
          </Field>
          <Button title="Simpan Password" onPress={() => changePw.mutate()} loading={changePw.isPending} disabled={!pw.current || pw.next.length < 8} testID="pw-save" />
        </View>
      </Sheet>

      <Sheet visible={sheet === "delete"} onClose={() => setSheet(null)} title="Hapus akun?" testID="delete-account-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <RNText style={s.body2}>
            Semua unit, prospek, tenant, tagihan, dan foto di akun ini dihapus permanen dan tidak bisa dikembalikan. Kalau perlu, export datamu dulu.
          </RNText>
          {!user?.is_demo ? (
            <Field label="Ketik password untuk konfirmasi">
              <Input testID="delete-password" value={delPw} onChangeText={setDelPw} secureTextEntry autoComplete="current-password" />
            </Field>
          ) : null}
          <Button title="Hapus Permanen" variant="danger" onPress={() => deleteAccount.mutate()} loading={deleteAccount.isPending} disabled={!user?.is_demo && !delPw} testID="delete-confirm" />
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
        <View style={[s.fill, { width: `${Math.max(pct * 100, 2)}%`, backgroundColor: full ? colors.warning : colors.brandPrimary }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.xl, maxWidth: 720, width: "100%", alignSelf: "center" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: colors.surfaceSecondary, ...cardShadow },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, ...fonts.bold, fontSize: 20 },
  userName: { color: colors.onSurface, ...fonts.semibold, fontSize: 18 },
  userEmail: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5 },
  propName: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  propMeta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, marginTop: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  cardTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 18 },
  cardSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, marginTop: 4 },
  body2: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15.5, lineHeight: 23 },
  warn: { color: colors.warning, ...fonts.semibold, fontSize: 14.5, marginTop: spacing.md },
  btnRow: { flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill },
}));
