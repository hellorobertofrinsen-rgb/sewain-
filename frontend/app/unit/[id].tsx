import React, { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text as RNText, View, useWindowDimensions } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { MAX_PHOTOS, UnitForm, UnitFormValue, unitFormBody, unitFormMissing, unitToForm } from "@/src/components/UnitForm";
import { FACILITIES, furnishingLabel, lookingFor, unitKind } from "@/src/lib/unitKinds";
import { availability } from "@/src/lib/availability";
import { Avatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Bookings } from "@/src/components/Bookings";
import { PriceTags, hasPrice } from "@/src/components/PriceTags";
import { t } from "@/src/lib/i18n";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, EmptyState, ErrorBox, ListGroup, ListRow, PressableScale, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, photoUrl, uploadFile } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { unitShareMessage, waLink, waShareLink } from "@/src/lib/messages";
import { UNIT_STATUS, dateLabel, leaseLeftLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";

export default function UnitDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <UnitDetail id={id} />;
}

/** Also rendered inline in the desktop split view (embedded). */
export function UnitDetail({ id, embedded, onGone }: { id: string; embedded?: boolean; onGone?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [boxW, setBoxW] = useState(0); // the split view on desktop is narrower than the window
  const [editOpen, setEditOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [f, setF] = useState<UnitFormValue | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: unit, isLoading, error, refetch } = useQuery({
    queryKey: ["unit", id],
    queryFn: () => api<any>(`/units/${id}`),
  });

  const { data: matches, isFetching: matchesLoading } = useQuery({
    queryKey: ["unit-matches", id],
    queryFn: () => api<any>(`/units/${id}/matches`),
    enabled: matchesOpen,
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api(`/units/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unit", id] });
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      toast(t("Status unit diperbarui"));
    },
    onError: (e: any) => toast(e?.message || t("Gagal update status"), "error"),
  });

  const save = useMutation({
    mutationFn: () => api(`/units/${id}`, { method: "PATCH", body: unitFormBody(f!) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unit", id] });
      qc.invalidateQueries({ queryKey: ["units"] });
      toast(t("Unit tersimpan ✓"));
      setEditOpen(false);
    },
    onError: (e: any) => toast(e?.message || t("Gagal menyimpan"), "error"),
  });

  const remove = useMutation({
    mutationFn: () => api(`/units/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      toast(t("Unit dihapus"));
      if (embedded) onGone?.();
      else router.back();
    },
    onError: (e: any) => {
      setDeleteOpen(false);
      toast(e?.message || t("Gagal menghapus"), "error");
    },
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain) {
        toast(t("Izinkan akses galeri untuk menambah foto unit"), "info");
      } else {
        toast(t("Akses galeri diblokir — buka pengaturan aplikasi"), "error");
        Linking.openSettings();
      }
      return;
    }
    const room = MAX_PHOTOS - (unit?.photos?.length || 0);
    if (room <= 0) return toast(t("Maksimal {n} foto per unit", { n: MAX_PHOTOS }), "info");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsMultipleSelection: true, selectionLimit: room });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    try {
      for (const [i, asset] of res.assets.slice(0, room).entries()) {
        await uploadFile(`/units/${id}/photos`, asset.uri, `foto-${i + 1}.jpg`);
      }
      qc.invalidateQueries({ queryKey: ["unit", id] });
      qc.invalidateQueries({ queryKey: ["units"] });
      toast(t("Foto ditambahkan ✓"));
    } catch (e: any) {
      toast(e?.message || t("Gagal unggah foto"), "error");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <View style={s.root}><Spinner label={t("Memuat unit…")} /></View>;
  // One photo (or none yet) fills the width; several scroll sideways.
  const single = (unit?.photos?.length || 0) <= 1;
  const fullW = Math.min(boxW || winW, 720) - spacing.lg * 2;
  if (error || !unit) return <View style={s.root}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>;

  const openEdit = () => {
    setF(unitToForm(unit));
    setEditOpen(true);
  };

  return (
    <View style={s.root}>
      <ScreenHeader embedded={embedded}
        title={unit.name}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: (embedded ? 0 : insets.bottom) + spacing.xxxl, gap: spacing.xl, maxWidth: 720, width: "100%", alignSelf: "center" }} showsVerticalScrollIndicator={false} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} testID="unit-detail-screen">
        {/* Photos: the camera button on the first photo adds more (up to 10). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {(unit.photos?.length ? unit.photos : [null]).map((p: string | null, i: number) => (
            <View key={i} style={s.photoBox}>
              {p ? (
                <Image source={{ uri: photoUrl(p, token) }} style={[s.photo, single && { width: fullW }]} contentFit="cover" transition={200} testID={`unit-photo-${i}`} />
              ) : (
                <View style={[s.photo, s.photoEmpty, { width: fullW }]}><Icon name="image" size={32} color={colors.muted} /></View>
              )}
              {i === 0 ? (
                <PressableScale onPress={pickPhoto} disabled={uploading} style={s.cameraBtn} testID="unit-add-photo-button" accessibilityLabel={t("Tambah foto")}>
                  {uploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="camera" size={18} color="#FFFFFF" />}
                </PressableScale>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={{ gap: 4 }}>
          <View style={s.titleRow}>
            <RNText style={s.code} testID="unit-code">{unit.name}</RNText>
            <StatusPill label={availability(unit).label} tone={availability(unit).tone} testID="unit-availability" />
          </View>
          {unit.residence ? <RNText style={s.residence}>{unit.residence}</RNText> : null}
          <RNText style={s.kind}>{[unitKind(unit), furnishingLabel(unit.furnishing)].filter(Boolean).join(" · ")}</RNText>
        </View>

        <ListGroup title={t("Detail unit")} testID="unit-info">
          {hasPrice(unit) ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 8 }}>
              <RNText style={s.rowLabel}>{t("Harga")}</RNText>
              <PriceTags unit={unit} testID="unit-detail-prices" />
            </View>
          ) : (
            <ListRow label={t("Harga")} value={t("Belum ada harga")} icon="wallet" tone="neutral" />
          )}
          <ListRow label={t("Deposit")} value={rupiah(unit.deposit || 0)} icon="shield" tone="neutral" testID="unit-deposit-row" />
          {unit.view ? <ListRow label={t("View")} value={unit.view} icon="eye" tone="info" testID="unit-view-row" /> : null}
          {!unit.residence && unit.location ? <ListRow label={t("Lokasi")} value={unit.location} icon="globe" tone="neutral" testID="unit-location-row" /> : null}
        </ListGroup>

        {facilityList(unit).length || unit.notes ? (
          <Card>
            {facilityList(unit).length ? (
              <View style={{ gap: 8 }}>
                <RNText style={s.rowLabel}>{t("Fasilitas")}</RNText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {facilityList(unit).map((fc: string, i: number) => (
                    <StatusPill key={fc} label={`✓ ${fc}`} tone="success" testID={`unit-facility-${i}`} />
                  ))}
                </View>
              </View>
            ) : null}
            {unit.notes ? <RNText style={[s.notes, !facilityList(unit).length && { marginTop: 0 }]}>{unit.notes}</RNText> : null}
          </Card>
        ) : null}

        {unit.tenant || unit.owner_name || unit.owner_phone ? (
          <ListGroup title={t("Orang")} testID="unit-people">
            {unit.tenant ? (
              <ListRow
                testID="unit-tenant-card"
                label={unit.tenant.name}
                sub={unit.tenant.end_date ? `${t("Tenant · kontrak sampai {date}", { date: dateLabel(unit.tenant.end_date + "T00:00:00") })} · ${leaseLeftLabel(unit.tenant.days_left)}` : t("Tenant")}
                icon="key"
                tone="success"
                onPress={() => router.push(`/tenant/${unit.tenant.id}` as any)}
              />
            ) : null}
            {unit.owner_name || unit.owner_phone ? (
              <ListRow
                testID="unit-owner-card"
                label={unit.owner_name || t("Owner")}
                sub={`${t("Owner")}${unit.owner_phone ? ` · ${unit.owner_phone}` : ""}`}
                icon="user"
                tone="brand"
                right={
                  waLink(unit.owner_phone) ? (
                    <Button title={t("WA Owner")} icon="whatsapp" variant="secondary" size="sm" onPress={() => Linking.openURL(waLink(unit.owner_phone)!)} testID="unit-owner-wa" />
                  ) : undefined
                }
              />
            ) : null}
          </ListGroup>
        ) : null}

        <Bookings unit={unit} />

        <View style={{ gap: spacing.sm }}>
          <SectionTitle>{t("Ubah status")}</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(UNIT_STATUS).map(([k, label]) => (
              <Chip key={k} label={label} active={unit.status === k} onPress={() => setStatus.mutate(k)} testID={`unit-set-status-${k}`} />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Button
            title={t("Share Unit")}
            icon="whatsapp"
            onPress={() => Linking.openURL(waShareLink(unitShareMessage(unit)))}
            testID="unit-share-button"
          />
          <Button title={t("Cari Penyewa yang Cocok")} variant="secondary" icon="search" onPress={() => setMatchesOpen(true)} testID="find-matches-button" />
          <Button title={t("Edit")} variant="ghost" icon="pencil" onPress={openEdit} testID="unit-edit-button" />
          <Button title={t("Hapus Unit")} variant="danger" onPress={() => setDeleteOpen(true)} testID="unit-delete-button" />
        </View>
      </ScrollView>

      <Sheet visible={matchesOpen} onClose={() => setMatchesOpen(false)} title={t("Penyewa cocok untuk {name}", { name: unit.name })} testID="unit-matches-sheet" scroll>
        {matchesLoading ? (
          <Spinner label={t("Mencari yang cocok…")} />
        ) : matches?.matches?.length || matches?.tenants?.length ? (
          <View style={{ gap: spacing.sm }}>
            <RNText style={s.matchIntro}>{t("Yang mencari atau menyewa tipe {type}.", { type: t(unit.unit_type) })}</RNText>
            {(matches.matches || []).map((m: any) => (
              <Card key={m.lead.id} testID={`match-card-${m.lead.id}`} onPress={() => { setMatchesOpen(false); router.push(`/lead/${m.lead.id}` as any); }} style={s.matchCard}>
                <Avatar name={m.lead.name} photo={m.lead.photo} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.matchNameRow}>
                    <RNText style={s.matchLeadName} numberOfLines={1}>{m.lead.name}</RNText>
                    <StatusPill label={t("Prospek")} tone="brand" testID={`match-kind-${m.lead.id}`} />
                    {m.lead.interest === "high" ? <StatusPill label={t("Hot Buyer")} tone="error" /> : null}
                  </View>
                  {lookingFor(m.lead) ? <RNText style={s.matchLeadMeta}>{lookingFor(m.lead)}</RNText> : null}
                </View>
                {waLink(m.lead.phone) ? (
                  <PressableScale onPress={() => Linking.openURL(waLink(m.lead.phone)!)} style={s.waBtn} accessibilityLabel={t("WhatsApp {name}", { name: m.lead.name })} testID={`match-wa-${m.lead.id}`}>
                    <Icon name="whatsapp" size={19} color={colors.success} />
                  </PressableScale>
                ) : null}
              </Card>
            ))}
            {(matches.tenants || []).map((tn: any) => (
              <Card key={tn.id} testID={`match-tenant-${tn.id}`} onPress={() => { setMatchesOpen(false); router.push(`/tenant/${tn.id}` as any); }} style={[s.matchCard, s.matchTenant]}>
                <Avatar name={tn.name} photo={tn.photo} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.matchNameRow}>
                    <RNText style={s.matchLeadName} numberOfLines={1}>{tn.name}</RNText>
                    <StatusPill label={t("Tenant")} tone="success" testID={`match-tenant-label-${tn.id}`} />
                  </View>
                  <RNText style={s.matchLeadMeta}>{`${t("Unit {name}", { name: tn.unit_name })} · ${leaseLeftLabel(tn.days_left)}`}</RNText>
                </View>
                {waLink(tn.phone) ? (
                  <PressableScale onPress={() => Linking.openURL(waLink(tn.phone)!)} style={s.waBtn} accessibilityLabel={t("WhatsApp {name}", { name: tn.name })} testID={`match-tenant-wa-${tn.id}`}>
                    <Icon name="whatsapp" size={19} color={colors.success} />
                  </PressableScale>
                ) : null}
              </Card>
            ))}
          </View>
        ) : (
          <EmptyState art="leads" title={t("Belum ada yang cocok")} subtitle={t("Prospek yang mencari tipe ini dan tenant yang menyewa tipe yang sama akan muncul di sini.")} action={<Button title={t("Tambah Prospek")} onPress={() => { setMatchesOpen(false); router.push("/lead/new" as any); }} testID="matches-empty-new-lead" />} />
        )}
      </Sheet>

      <Sheet visible={editOpen} onClose={() => setEditOpen(false)} title={t("Edit {name}", { name: unit.name })} testID="unit-edit-sheet" scroll>
        {f ? (
          <View style={{ gap: spacing.lg }}>
            <UnitForm value={f} onChange={setF} prefix="edit-unit" />
            <Button title={t("Simpan")} onPress={() => save.mutate()} loading={save.isPending} disabled={unitFormMissing(f, false).length > 0} testID="edit-unit-save-button" />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("Hapus {name}?", { name: unit.name })} testID="unit-delete-sheet">
        <RNText style={s.notes}>{t("Unit diarsipkan (tidak terhapus permanen). Riwayat tenant & pembayaran tetap aman. Unit dengan tenant aktif harus checkout dulu.")}</RNText>
        <Button title={t("Ya, Hapus")} variant="danger" onPress={() => remove.mutate()} loading={remove.isPending} testID="unit-delete-confirm-button" style={{ marginTop: spacing.lg }} />
      </Sheet>
    </View>
  );
}

const facilityList = (u: any): string[] => (u.facilities || []).filter((f: string) => FACILITIES.includes(f));

const useStyles = makeStyles((colors) => ({
  photoBox: { position: "relative" },
  photo: { width: 300, height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  photoEmpty: { alignItems: "center", justifyContent: "center" },
  cameraBtn: {
    position: "absolute", left: 10, bottom: 10, width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(10,12,16,0.62)", alignItems: "center", justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  code: { color: colors.onSurface, ...fonts.bold, fontSize: 26, letterSpacing: -0.4 },
  residence: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  kind: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15.5 },
  matchIntro: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, marginBottom: 4 },
  matchCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  matchTenant: { backgroundColor: withAlpha(colors.success, 0.07), borderWidth: 1, borderColor: withAlpha(colors.success, 0.25) },
  matchNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  waBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(colors.success, 0.1) },
  root: { flex: 1, backgroundColor: colors.surface },
  rowLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  notes: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, marginTop: spacing.md },
  matchLeadName: { color: colors.onSurface, ...fonts.semibold, fontSize: 18 },
  matchLeadMeta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, marginTop: 2 },
  checkMark: { color: colors.success, ...fonts.semibold, fontSize: 14 },
  checkText: { color: colors.onSurfaceTertiary, ...fonts.regular, fontSize: 14 },
}));

