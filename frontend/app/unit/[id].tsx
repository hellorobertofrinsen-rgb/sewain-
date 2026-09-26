import React, { useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { UnitForm, UnitFormValue, unitFormBody, unitFormValid, unitToForm } from "@/src/components/UnitForm";
import { prefSummary, unitKind } from "@/src/lib/unitKinds";
import { Bookings } from "@/src/components/Bookings";
import { PriceTags, hasPrice } from "@/src/components/PriceTags";
import { t } from "@/src/lib/i18n";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, EmptyState, ErrorBox, ListGroup, ListRow, SectionTitle, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, photoUrl, uploadFile } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { unitShareMessage, waLink, waShareLink } from "@/src/lib/messages";
import { UNIT_STATUS, dateLabel, daysFromNow, leaseLeftLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

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
  const [editOpen, setEditOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [f, setF] = useState<UnitFormValue | null>(null);

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
      toast("Status unit diperbarui");
    },
    onError: (e: any) => toast(e?.message || "Gagal update status", "error"),
  });

  const save = useMutation({
    mutationFn: () => api(`/units/${id}`, { method: "PATCH", body: unitFormBody(f!) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unit", id] });
      qc.invalidateQueries({ queryKey: ["units"] });
      toast("Unit tersimpan ✓");
      setEditOpen(false);
    },
    onError: (e: any) => toast(e?.message || "Gagal menyimpan", "error"),
  });

  const remove = useMutation({
    mutationFn: () => api(`/units/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      toast("Unit dihapus");
      if (embedded) onGone?.();
      else router.back();
    },
    onError: (e: any) => {
      setDeleteOpen(false);
      toast(e?.message || "Gagal menghapus", "error");
    },
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain) {
        toast("Izinkan akses galeri untuk menambah foto unit", "info");
      } else {
        toast("Akses galeri diblokir — buka pengaturan aplikasi", "error");
        Linking.openSettings();
      }
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    try {
      await uploadFile(`/units/${id}/photos`, asset.uri, `foto.${asset.uri.split(".").pop() || "jpg"}`);
      qc.invalidateQueries({ queryKey: ["unit", id] });
      toast("Foto ditambahkan ✓");
    } catch (e: any) {
      toast(e?.message || "Gagal unggah foto", "error");
    }
  };

  if (isLoading) return <View style={s.root}><Spinner label="Memuat unit…" /></View>;
  if (error || !unit) return <View style={s.root}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>;

  const openEdit = () => {
    setF(unitToForm(unit));
    setEditOpen(true);
  };

  return (
    <View style={s.root}>
      <ScreenHeader embedded={embedded}
        title={unit.name}
        right={<StatusPill label={UNIT_STATUS[unit.status] || unit.status} tone={unit.status === "kosong" ? "info" : unit.status === "terisi" ? "success" : unit.status === "reserved" ? "warning" : "neutral"} testID="unit-status-pill" />}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: (embedded ? 0 : insets.bottom) + spacing.xxxl, gap: spacing.xl, maxWidth: 720, width: "100%", alignSelf: "center" }} showsVerticalScrollIndicator={false} testID="unit-detail-screen">
        {unit.photos?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {unit.photos.map((p: string, i: number) => (
              <Image
                key={i}
                source={{ uri: photoUrl(p, token) }}
                style={{ width: 280, height: 190, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary }}
                contentFit="cover"
                transition={200}
                testID={`unit-photo-${i}`}
              />
            ))}
          </ScrollView>
        ) : null}

        <ListGroup title="Detail unit" testID="unit-info">
          {hasPrice(unit) ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 8 }}>
              <RNText style={s.rowLabel}>{t("Harga")}</RNText>
              <PriceTags unit={unit} testID="unit-detail-prices" />
            </View>
          ) : (
            <ListRow label={t("Harga")} value={t("Belum ada harga")} icon="wallet" tone="neutral" />
          )}
          <ListRow label={t("Jenis")} value={unitKind(unit) || "-"} icon="building" tone="info" testID="unit-kind-row" />
          <ListRow label={t("Lokasi")} value={unit.location || "-"} icon="globe" tone="neutral" testID="unit-location-row" />
          {unit.deposit ? <ListRow label="Deposit" value={rupiah(unit.deposit)} icon="shield" tone="neutral" /> : null}
          {unit.available_date ? <ListRow label="Available" value={unit.available_date} icon="calendar-check" tone="warning" /> : null}
          {unit.status === "kosong" ? <ListRow label="Kosong selama" value={`${Math.max(daysFromNow(unit.vacant_since) ?? 0, 0)} hari`} icon="clock" tone="warning" /> : null}
        </ListGroup>

        {unit.facilities?.length || unit.notes ? (
          <Card>
            {unit.facilities?.length ? (
              <View style={{ gap: 8 }}>
                <RNText style={s.rowLabel}>Fasilitas</RNText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {unit.facilities.map((fc: string, i: number) => (
                    <StatusPill key={i} label={fc} tone="neutral" testID={`unit-facility-${i}`} />
                  ))}
                </View>
              </View>
            ) : null}
            {unit.notes ? <RNText style={[s.notes, !unit.facilities?.length && { marginTop: 0 }]}>{unit.notes}</RNText> : null}
          </Card>
        ) : null}

        {unit.tenant || unit.owner_name || unit.owner_phone ? (
          <ListGroup title="Orang" testID="unit-people">
            {unit.tenant ? (
              <ListRow
                testID="unit-tenant-card"
                label={unit.tenant.name}
                sub={unit.tenant.end_date ? `Tenant · kontrak sampai ${dateLabel(unit.tenant.end_date + "T00:00:00")} · ${leaseLeftLabel(unit.tenant.days_left)}` : "Tenant"}
                icon="key"
                tone="success"
                onPress={() => router.push(`/tenant/${unit.tenant.id}` as any)}
              />
            ) : null}
            {unit.owner_name || unit.owner_phone ? (
              <ListRow
                testID="unit-owner-card"
                label={unit.owner_name || "Pemilik"}
                sub={`Pemilik${unit.owner_phone ? ` · ${unit.owner_phone}` : ""}`}
                icon="user"
                tone="brand"
                right={
                  waLink(unit.owner_phone) ? (
                    <Button title="WhatsApp" icon="whatsapp" variant="secondary" size="sm" onPress={() => Linking.openURL(waLink(unit.owner_phone)!)} testID="unit-owner-wa" />
                  ) : undefined
                }
              />
            ) : null}
          </ListGroup>
        ) : null}

        <Bookings unit={unit} />

        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Ubah status</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(UNIT_STATUS).map(([k, label]) => (
              <Chip key={k} label={label} active={unit.status === k} onPress={() => setStatus.mutate(k)} testID={`unit-set-status-${k}`} />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Button
            title="Share Unit"
            icon="whatsapp"
            onPress={() => Linking.openURL(waShareLink(unitShareMessage(unit)))}
            testID="unit-share-button"
          />
          {unit.status === "kosong" ? (
            <Button title="Cari Prospek yang Cocok" variant="secondary" icon="search" onPress={() => setMatchesOpen(true)} testID="find-matches-button" />
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title="Edit" variant="ghost" icon="pencil" onPress={openEdit} testID="unit-edit-button" style={{ flex: 1 }} />
            <Button title="Tambah Foto" variant="ghost" icon="upload" onPress={pickPhoto} testID="unit-add-photo-button" style={{ flex: 1 }} />
          </View>
          <Button title="Hapus Unit" variant="danger" onPress={() => setDeleteOpen(true)} testID="unit-delete-button" />
        </View>
      </ScrollView>

      <Sheet visible={matchesOpen} onClose={() => setMatchesOpen(false)} title={`Prospek cocok untuk ${unit.name}`} testID="unit-matches-sheet" scroll>
        {matchesLoading ? (
          <Spinner label="SewAIn mencocokkan prospek…" />
        ) : matches?.matches?.length ? (
          <View style={{ gap: spacing.md }}>
            {matches.matches.map((m: any, i: number) => (
              <Card key={m.lead.id} testID={`match-card-${m.lead.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <RNText style={s.matchLeadName}>{m.lead.name}</RNText>
                  <StatusPill label={`${m.score}`} tone={m.score >= 60 ? "success" : "neutral"} testID={`match-score-${m.lead.id}`} />
                </View>
                <RNText style={s.matchLeadMeta}>
                  {prefSummary(m.lead) || (m.lead.phone ?? "")}
                </RNText>
                <View style={{ marginTop: 8, gap: 3 }}>
                  {m.reasons.map((r: string, ri: number) => (
                    <View key={ri} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <RNText style={s.checkMark}>✓</RNText>
                      <RNText style={s.checkText}>{r}</RNText>
                    </View>
                  ))}
                </View>
                <Button title="Lihat Prospek" variant="ghost" size="sm" onPress={() => { setMatchesOpen(false); router.push(`/lead/${m.lead.id}` as any); }} testID={`match-open-${m.lead.id}`} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} />
              </Card>
            ))}
          </View>
        ) : (
          <EmptyState art="leads" title="Belum ada prospek yang cocok" subtitle="Prospek aktif dengan budget & tipe yang pas akan muncul di sini." action={<Button title="Tambah Prospek" onPress={() => { setMatchesOpen(false); router.push("/lead/new" as any); }} testID="matches-empty-new-lead" />} />
        )}
      </Sheet>

      <Sheet visible={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${unit.name}`} testID="unit-edit-sheet" scroll>
        {f ? (
          <View style={{ gap: spacing.lg }}>
            <UnitForm value={f} onChange={setF} prefix="edit-unit" />
            <Button title={t("Simpan")} onPress={() => save.mutate()} loading={save.isPending} disabled={!unitFormValid(f)} testID="edit-unit-save-button" />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title={`Hapus ${unit.name}?`} testID="unit-delete-sheet">
        <RNText style={s.notes}>Unit diarsipkan (tidak terhapus permanen). Riwayat tenant & pembayaran tetap aman. Unit dengan tenant aktif harus checkout dulu.</RNText>
        <Button title="Ya, Hapus" variant="danger" onPress={() => remove.mutate()} loading={remove.isPending} testID="unit-delete-confirm-button" style={{ marginTop: spacing.lg }} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  rowLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  notes: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, marginTop: spacing.md },
  matchLeadName: { color: colors.onSurface, ...fonts.semibold, fontSize: 18 },
  matchLeadMeta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, marginTop: 2 },
  checkMark: { color: colors.success, ...fonts.semibold, fontSize: 14 },
  checkText: { color: colors.onSurfaceTertiary, ...fonts.regular, fontSize: 14 },
}));

