import React, { useEffect, useState } from "react";
import { Image, Linking, Platform, ScrollView, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabHeader } from "@/src/components/TabHeader";
import { Sheet } from "@/src/components/Sheet";
import { Crop, CropEditor } from "@/src/components/CropEditor";
import { Icon } from "@/src/components/Icon";
import { Button, Card, Chip, EmptyState, ErrorBox, PressableScale, Spinner } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, BASE, getAuthToken } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { t } from "@/src/lib/i18n";
import { composeTestimonial, dataUrlToFile, loadImage } from "@/src/lib/testimonial";
import { cardShadow, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Cetak Testimoni: pick a tenant, add 1–5 chat screenshots and crop the part with
// the praise. The tenant's photo, the unit photo and the crops become one image.

const MAX_SHOTS = 5;
type Shot = { key: string; uri: string; crop: Crop | null; preview: string | null };

async function cropPreview(uri: string, c: Crop): Promise<string> {
  const img = await loadImage(uri);
  const w = 360;
  const h = Math.max(1, Math.round((c.h / c.w) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/** The first unit photo as a local object URL (fetched with the auth header, so the canvas stays untainted). */
async function fetchUnitPhoto(unitId: string): Promise<string | null> {
  const unit = await api<any>(`/units/${unitId}`);
  const p: string | undefined = unit?.photos?.[0];
  if (!p) return null;
  const url = p.startsWith("http") ? p : `${BASE}/files/${p}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` } });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

export default function TestimoniScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantsQ = useQuery({ queryKey: ["tenants"], queryFn: () => api<any[]>("/tenants") });

  const [tenantId, setTenantId] = useState<string | null>(null);
  const tenant = tenantsQ.data?.find((x) => x.id === tenantId) || null;
  const [clientPhoto, setClientPhoto] = useState<string | null>(null);
  const [unitPhoto, setUnitPhoto] = useState<string | null>(null);
  const [unitPhotoLoading, setUnitPhotoLoading] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [cropping, setCropping] = useState<Shot | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New tenant → start from their unit's photo and a fresh client photo.
  const selectTenant = (x: any) => {
    if (x.id === tenantId) return;
    setTenantId(x.id);
    setClientPhoto(null);
    setUnitPhoto(null);
    setUnitPhotoLoading(!!x.unit_id);
  };
  useEffect(() => {
    if (!tenant?.unit_id) return;
    let alive = true;
    fetchUnitPhoto(tenant.unit_id)
      .then((u) => alive && setUnitPhoto(u))
      .catch(() => {})
      .finally(() => alive && setUnitPhotoLoading(false));
    return () => {
      alive = false;
    };
  }, [tenant?.id, tenant?.unit_id]);

  const pick = async (multi: boolean, limit = 1) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) Linking.openSettings();
      else toast(t("Izinkan akses galeri untuk memilih foto"), "info");
      return [];
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsMultipleSelection: multi,
      selectionLimit: limit,
    });
    if (res.canceled) return [];
    return (res.assets || []).map((a) => a.uri);
  };

  const addShots = async () => {
    const room = MAX_SHOTS - shots.length;
    if (room <= 0) return;
    const uris = (await pick(true, room)).slice(0, room);
    if (!uris.length) return;
    const fresh = uris.map((uri, i) => ({ key: `${Date.now()}-${i}`, uri, crop: null, preview: null }));
    setShots((cur) => [...cur, ...fresh]);
    setCropping(fresh[0]);
  };

  const onCropDone = async (c: Crop) => {
    const shot = cropping!;
    const preview = await cropPreview(shot.uri, c).catch(() => shot.uri);
    let next: Shot | null = null;
    setShots((cur) => {
      const list = cur.map((x) => (x.key === shot.key ? { ...x, crop: c, preview } : x));
      next = list.find((x) => !x.crop) || null;
      return list;
    });
    // Queue: straight on to the next screenshot that still needs a crop.
    setTimeout(() => setCropping(next), 0);
  };

  const onCropCancel = () => {
    const shot = cropping!;
    let next: Shot | null = null;
    setShots((cur) => {
      // A screenshot that was never cropped is dropped; a re-crop keeps the old one.
      const list = shot.crop ? cur : cur.filter((x) => x.key !== shot.key);
      next = list.find((x) => !x.crop) || null;
      return list;
    });
    setTimeout(() => setCropping(next), 0);
  };

  const ready = !!tenant && shots.length > 0 && shots.every((x) => x.crop);

  const build = async () => {
    if (!tenant) return;
    setBusy(true);
    try {
      const agentLine = [user?.agency, user?.phone].filter(Boolean).join(" · ");
      const url = await composeTestimonial({
        unitPhoto,
        clientPhoto,
        clientName: tenant.name,
        subtitle: t("Tenant · {unit}", { unit: tenant.unit_name && tenant.unit_name !== "-" ? tenant.unit_name : "" }).replace(/ · $/, ""),
        heading: t("Kata tenant kami"),
        shots: shots.map((x) => ({ uri: x.uri, crop: x.crop! })),
        agentName: user?.name || "SewAIn",
        agentLine,
        brand: t("dibuat dengan SewAIn"),
      });
      setResult(url);
    } catch {
      toast(t("Gagal membuat gambar. Coba screenshot lain."), "error");
    } finally {
      setBusy(false);
    }
  };

  const filename = `testimoni-${(tenant?.name || "tenant").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;
  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(t("Gambar disimpan"));
  };
  const canShare = Platform.OS === "web" && typeof navigator !== "undefined" && !!(navigator as any).canShare;
  const share = async () => {
    if (!result) return;
    try {
      const file = await dataUrlToFile(result, filename);
      if ((navigator as any).canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t("Testimoni") });
      } else download();
    } catch (e: any) {
      if (e?.name !== "AbortError") download();
    }
  };

  if (Platform.OS !== "web") {
    return (
      <View style={s.root}>
        <TabHeader title={t("Cetak Testimoni")} menu />
        <EmptyState icon="image" title={t("Buka SewAIn di browser")} subtitle={t("Fitur ini jalan di versi web.")} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled" testID="testimoni-screen">
        <TabHeader title={t("Cetak Testimoni")} sub={t("Foto tenant, foto unit, dan chat pujiannya jadi satu gambar.")} menu />
        <View style={s.content}>
          {tenantsQ.isLoading ? <Spinner /> : tenantsQ.error ? (
            <ErrorBox message={(tenantsQ.error as Error).message} onRetry={() => tenantsQ.refetch()} />
          ) : !tenantsQ.data?.length ? (
            <EmptyState
              icon="users"
              title={t("Belum ada tenant")}
              subtitle={t("Tambah tenant dulu, lalu kembali ke sini.")}
              action={<Button title={t("Tambah Tenant")} icon="plus" onPress={() => router.push("/tenants?add=1" as any)} testID="testimoni-add-tenant" />}
            />
          ) : (
            <>
              <Card style={s.card}>
                <StepTitle n={1} title={t("Pilih tenant")} />
                <View style={s.chips}>
                  {tenantsQ.data.map((x) => (
                    <Chip key={x.id} label={x.name} active={x.id === tenantId} onPress={() => selectTenant(x)} testID={`testimoni-tenant-${x.id}`} />
                  ))}
                </View>
              </Card>

              <Card style={[s.card, !tenant && s.dim]}>
                <StepTitle n={2} title={t("Foto")} />
                <View style={s.photoRow}>
                  <View style={s.photoCol}>
                    <PressableScale
                      onPress={async () => { const [u] = await pick(false); if (u) setClientPhoto(u); }}
                      disabled={!tenant}
                      style={s.clientBtn}
                      testID="testimoni-client-photo"
                      accessibilityLabel={t("Foto tenant")}
                    >
                      {clientPhoto ? <Image source={{ uri: clientPhoto }} style={s.clientImg} /> : (
                        <RNText style={s.initial}>{(tenant?.name || "?").charAt(0).toUpperCase()}</RNText>
                      )}
                      <View style={s.badge}><Icon name="camera" size={14} color={colors.onBrandPrimary} /></View>
                    </PressableScale>
                    <RNText style={s.photoLabel}>{t("Foto tenant")}</RNText>
                    <RNText style={s.photoHint}>{clientPhoto ? t("Ketuk untuk ganti") : t("Opsional")}</RNText>
                  </View>
                  <View style={[s.photoCol, { flex: 1 }]}>
                    <PressableScale
                      onPress={async () => { const [u] = await pick(false); if (u) setUnitPhoto(u); }}
                      disabled={!tenant}
                      style={s.unitBtn}
                      testID="testimoni-unit-photo"
                      accessibilityLabel={t("Foto unit")}
                    >
                      {unitPhoto ? <Image source={{ uri: unitPhoto }} style={s.unitImg} resizeMode="cover" /> : unitPhotoLoading ? <Spinner /> : (
                        <View style={{ alignItems: "center", gap: 4 }}>
                          <Icon name="image" size={22} color={colors.muted} />
                          <RNText style={s.photoHint}>{t("Tambah foto")}</RNText>
                        </View>
                      )}
                    </PressableScale>
                    <RNText style={s.photoLabel}>{tenant ? t("Foto unit {name}", { name: tenant.unit_name }) : t("Foto unit")}</RNText>
                    <RNText style={s.photoHint}>{unitPhoto ? t("Dari foto unit. Ketuk untuk ganti") : t("Unit belum punya foto")}</RNText>
                  </View>
                </View>
              </Card>

              <Card style={[s.card, !tenant && s.dim]}>
                <StepTitle n={3} title={t("Screenshot chat")} right={<RNText style={s.count}>{shots.length}/{MAX_SHOTS}</RNText>} />
                <RNText style={s.sub}>{t("Pilih 1–5 screenshot, lalu potong bagian pujiannya.")}</RNText>
                {shots.length ? (
                  <View style={s.shots}>
                    {shots.map((x, i) => (
                      <View key={x.key} style={s.shot} testID={`testimoni-shot-${i}`}>
                        <PressableScale onPress={() => setCropping(x)} style={s.shotImgWrap} accessibilityLabel={t("Potong ulang")} testID={`testimoni-shot-crop-${i}`}>
                          <Image source={{ uri: x.preview || x.uri }} style={s.shotImg} resizeMode="contain" />
                        </PressableScale>
                        <View style={s.shotBar}>
                          <PressableScale onPress={() => setCropping(x)} style={s.shotAction}>
                            <Icon name="crop" size={15} color={colors.brandPrimary} />
                            <RNText style={s.shotActionText}>{t("Potong")}</RNText>
                          </PressableScale>
                          <PressableScale
                            onPress={() => setShots((cur) => cur.filter((y) => y.key !== x.key))}
                            style={s.shotAction}
                            testID={`testimoni-shot-remove-${i}`}
                            accessibilityLabel={t("Hapus")}
                          >
                            <Icon name="trash" size={15} color={colors.error} />
                          </PressableScale>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Button
                  title={shots.length ? t("Tambah screenshot") : t("Pilih screenshot")}
                  icon="plus"
                  variant="secondary"
                  onPress={addShots}
                  disabled={!tenant || shots.length >= MAX_SHOTS}
                  testID="testimoni-add-shot"
                />
              </Card>

              <Button title={t("Buat Gambar")} size="lg" icon="image" onPress={build} loading={busy} disabled={!ready} testID="testimoni-build" />
            </>
          )}
        </View>
      </ScrollView>

      {cropping ? <CropEditor key={cropping.key} uri={cropping.uri} initial={cropping.crop} onDone={onCropDone} onCancel={onCropCancel} /> : null}

      <Sheet visible={!!result} onClose={() => setResult(null)} title={t("Testimoni siap")} testID="testimoni-result">
        <View style={{ gap: spacing.md }}>
          <ScrollView style={s.resultScroll} contentContainerStyle={{ alignItems: "center" }}>
            {result ? <ResultImage uri={result} /> : null}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title={t("Simpan")} icon="download" variant="secondary" onPress={download} testID="testimoni-download" style={{ flex: 1 }} />
            {canShare ? <Button title={t("Bagikan")} icon="share" onPress={share} testID="testimoni-share" style={{ flex: 1 }} /> : null}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function ResultImage({ uri }: { uri: string }) {
  const s = useStyles();
  const [ratio, setRatio] = useState(1.6);
  useEffect(() => {
    Image.getSize(uri, (w, h) => setRatio(h / w), () => {});
  }, [uri]);
  return <Image source={{ uri }} style={[s.resultImg, { aspectRatio: 1 / ratio }]} resizeMode="contain" testID="testimoni-result-image" />;
}

function StepTitle({ n, title, right }: { n: number; title: string; right?: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.stepRow}>
      <View style={s.stepNum}><RNText style={s.stepNumText}>{n}</RNText></View>
      <RNText style={s.stepTitle}>{title}</RNText>
      {right}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, maxWidth: 760, width: "100%", alignSelf: "center" },
  card: { gap: spacing.md },
  dim: { opacity: 0.55 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: colors.onBrandTertiary, ...fonts.bold, fontSize: 14 },
  stepTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 18, flex: 1 },
  count: { color: colors.muted, ...fonts.medium, fontSize: 14, fontVariant: ["tabular-nums"] },
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, lineHeight: 20, marginTop: -6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  photoCol: { alignItems: "center", gap: 4 },
  clientBtn: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", ...cardShadow,
  },
  clientImg: { width: 88, height: 88, borderRadius: 44 },
  initial: { color: colors.onBrandTertiary, ...fonts.bold, fontSize: 34 },
  badge: {
    position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.surfaceSecondary,
  },
  unitBtn: {
    width: "100%", height: 88, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  unitImg: { width: "100%", height: "100%" },
  photoLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 14, textAlign: "center", marginTop: 4 },
  photoHint: { color: colors.muted, ...fonts.regular, fontSize: 13, textAlign: "center" },
  shots: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  shot: {
    width: "31.5%", minWidth: 96, borderRadius: radius.md, overflow: "hidden",
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  shotImgWrap: { height: 120, alignItems: "center", justifyContent: "center", padding: 6 },
  shotImg: { width: "100%", height: "100%" },
  shotBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary },
  shotAction: { flex: 1, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", paddingVertical: 9 },
  shotActionText: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 13.5 },
  resultScroll: { maxHeight: 460, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  resultImg: { width: "100%", maxWidth: 420 },
}));
