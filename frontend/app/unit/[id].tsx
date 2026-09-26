import React, { useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, EmptyState, ErrorBox, Field, Input, SectionTitle, Spinner, StatusPill, SwitchRow, Textarea } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, photoUrl, uploadFile } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { waLink } from "@/src/lib/messages";
import { UNIT_STATUS, dateLabel, daysFromNow, leaseLeftLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function UnitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [editOpen, setEditOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [f, setF] = useState<any>(null);

  const { data: unit, isLoading, error, refetch } = useQuery({
    queryKey: ["unit", id],
    queryFn: () => api<any>(`/units/${id}`),
  });

  const { data: matches, isFetching: matchesLoading } = useQuery({
    queryKey: ["unit-matches", id],
    queryFn: () => api<any>(`/units/${id}/matches`),
    enabled: matchesOpen,
  });

  const buildBody = (u: any) => ({
    property_id: u.property_id,
    name: u.name,
    unit_type: u.unit_type,
    monthly_price: u.monthly_price,
    deposit: u.deposit || 0,
    bedrooms: u.bedrooms || 1,
    bathrooms: u.bathrooms || 1,
    furnished: !!u.furnished,
    facilities: u.facilities || [],
    available_date: u.available_date || null,
    status: u.status,
    notes: u.notes || null,
    owner_name: u.owner_name || null,
    owner_phone: u.owner_phone || null,
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
    mutationFn: () => api(`/units/${id}`, { method: "PATCH", body: { ...f } }),
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
      router.back();
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
    setF(buildBody(unit));
    setEditOpen(true);
  };

  return (
    <View style={s.root}>
      <ScreenHeader
        title={unit.name}
        right={<StatusPill label={UNIT_STATUS[unit.status] || unit.status} tone={unit.status === "kosong" ? "info" : unit.status === "terisi" ? "success" : unit.status === "reserved" ? "warning" : "error"} testID="unit-status-pill" />}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false} testID="unit-detail-screen">
        {unit.photos?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {unit.photos.map((p: string, i: number) => (
              <Image
                key={i}
                source={{ uri: photoUrl(p, token) }}
                style={{ width: 260, height: 165, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary }}
                contentFit="cover"
                transition={200}
                testID={`unit-photo-${i}`}
              />
            ))}
          </ScrollView>
        ) : null}

        <Card>
          <Row label="Properti" value={unit.property_name || "-"} />
          <Row label="Tipe" value={unit.unit_type} />
          <Row label="Harga" value={`${rupiah(unit.monthly_price)} / bulan`} />
          <Row label="Deposit" value={unit.deposit ? rupiah(unit.deposit) : "-"} />
          <Row label="Kamar" value={`${unit.bedrooms} tidur · ${unit.bathrooms} mandi`} />
          <Row label="Furnished" value={unit.furnished ? "Ya" : "Tidak"} />
          {unit.available_date ? <Row label="Available" value={unit.available_date} /> : null}
          {unit.status === "kosong" ? <Row label="Kosong selama" value={`${Math.max(daysFromNow(unit.vacant_since) ?? 0, 0)} hari`} /> : null}
          <Row label="Kota" value={unit.city || "-"} last />
          {unit.facilities?.length ? (
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              <RNText style={s.rowLabel}>Fasilitas</RNText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {unit.facilities.map((fc: string, i: number) => (
                  <StatusPill key={i} label={fc} tone="neutral" testID={`unit-facility-${i}`} />
                ))}
              </View>
            </View>
          ) : null}
          {unit.notes ? <RNText style={s.notes}>{unit.notes}</RNText> : null}
        </Card>

        {unit.tenant ? (
          <Card testID="unit-tenant-card" onPress={() => router.push(`/tenant/${unit.tenant.id}` as any)}>
            <RNText style={s.rowLabel}>Tenant sekarang</RNText>
            <RNText style={s.matchLeadName}>{unit.tenant.name}</RNText>
            {unit.tenant.end_date ? (
              <RNText style={s.matchLeadMeta}>
                Kontrak sampai {dateLabel(unit.tenant.end_date + "T00:00:00")} · {leaseLeftLabel(unit.tenant.days_left)}
              </RNText>
            ) : null}
          </Card>
        ) : null}

        {unit.owner_name || unit.owner_phone ? (
          <Card testID="unit-owner-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <RNText style={s.rowLabel}>Pemilik</RNText>
                <RNText style={s.matchLeadName}>{unit.owner_name || "-"}</RNText>
                {unit.owner_phone ? <RNText style={s.matchLeadMeta}>{unit.owner_phone}</RNText> : null}
              </View>
              {waLink(unit.owner_phone) ? (
                <Button title="WhatsApp" variant="ghost" size="sm" icon="phone" onPress={() => Linking.openURL(waLink(unit.owner_phone)!)} testID="unit-owner-wa" />
              ) : null}
            </View>
          </Card>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Ubah status</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(UNIT_STATUS).map(([k, label]) => (
              <Chip key={k} label={label} active={unit.status === k} onPress={() => setStatus.mutate(k)} testID={`unit-set-status-${k}`} />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          {unit.status === "kosong" ? (
            <Button title="Cari Penyewa yang Cocok" icon="search" onPress={() => setMatchesOpen(true)} testID="find-matches-button" />
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title="Edit" variant="ghost" icon="pencil" onPress={openEdit} testID="unit-edit-button" style={{ flex: 1 }} />
            <Button title="Tambah Foto" variant="ghost" icon="upload" onPress={pickPhoto} testID="unit-add-photo-button" style={{ flex: 1 }} />
          </View>
          <Button title="Hapus Unit" variant="danger" onPress={() => setDeleteOpen(true)} testID="unit-delete-button" />
        </View>
      </ScrollView>

      <Sheet visible={matchesOpen} onClose={() => setMatchesOpen(false)} title={`Calon penyewa cocok untuk ${unit.name}`} testID="unit-matches-sheet" scroll>
        {matchesLoading ? (
          <Spinner label="Sewain mencocokkan calon penyewa…" />
        ) : matches?.matches?.length ? (
          <View style={{ gap: spacing.md }}>
            {matches.matches.map((m: any, i: number) => (
              <Card key={m.lead.id} testID={`match-card-${m.lead.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <RNText style={s.matchLeadName}>{m.lead.name}</RNText>
                  <StatusPill label={`${m.score}`} tone={m.score >= 60 ? "success" : "neutral"} testID={`match-score-${m.lead.id}`} />
                </View>
                <RNText style={s.matchLeadMeta}>
                  {[m.lead.unit_type, m.lead.budget_max ? `Budget max ${rupiah(m.lead.budget_max)}` : null].filter(Boolean).join(" · ")}
                </RNText>
                <View style={{ marginTop: 8, gap: 3 }}>
                  {m.reasons.map((r: string, ri: number) => (
                    <View key={ri} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <RNText style={s.checkMark}>✓</RNText>
                      <RNText style={s.checkText}>{r}</RNText>
                    </View>
                  ))}
                </View>
                <Button title="Lihat Calon Penyewa" variant="ghost" size="sm" onPress={() => { setMatchesOpen(false); router.push(`/lead/${m.lead.id}` as any); }} testID={`match-open-${m.lead.id}`} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} />
              </Card>
            ))}
          </View>
        ) : (
          <EmptyState icon="users" title="Belum ada calon yang cocok" subtitle="Calon penyewa aktif dengan budget & tipe yang pas akan muncul di sini." action={<Button title="Tambah Calon Penyewa" onPress={() => { setMatchesOpen(false); router.push("/lead/new" as any); }} testID="matches-empty-new-lead" />} />
        )}
      </Sheet>

      <Sheet visible={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${unit.name}`} testID="unit-edit-sheet" scroll>
        {f ? (
          <View style={{ gap: spacing.md }}>
            <Field label="Nama unit">
              <Input testID="edit-unit-name-input" value={f.name} onChangeText={(v: string) => setF({ ...f, name: v })} />
            </Field>
            <Field label="Tipe">
              <Input testID="edit-unit-type-input" value={f.unit_type} onChangeText={(v: string) => setF({ ...f, unit_type: v })} />
            </Field>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Harga / bulan">
                  <Input testID="edit-unit-price-input" value={String(f.monthly_price)} onChangeText={(v: string) => setF({ ...f, monthly_price: parseInt(v.replace(/\D/g, "") || "0", 10) })} keyboardType="numeric" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Deposit">
                  <Input testID="edit-unit-deposit-input" value={String(f.deposit)} onChangeText={(v: string) => setF({ ...f, deposit: parseInt(v.replace(/\D/g, "") || "0", 10) })} keyboardType="numeric" />
                </Field>
              </View>
            </View>
            <Field label="Fasilitas (pisah pakai koma)">
              <Input testID="edit-unit-facilities-input" value={(f.facilities || []).join(", ")} onChangeText={(v: string) => setF({ ...f, facilities: v.split(",").map((x: string) => x.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Catatan">
              <Textarea testID="edit-unit-notes-input" value={f.notes || ""} onChangeText={(v: string) => setF({ ...f, notes: v })} />
            </Field>
            <SwitchRow label="Fully furnished" value={f.furnished} onChange={(v: boolean) => setF({ ...f, furnished: v })} testID="edit-unit-furnished-switch" />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Pemilik">
                  <Input testID="edit-unit-owner-name" value={f.owner_name || ""} onChangeText={(v: string) => setF({ ...f, owner_name: v || null })} placeholder="Nama pemilik" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="HP pemilik">
                  <Input testID="edit-unit-owner-phone" value={f.owner_phone || ""} onChangeText={(v: string) => setF({ ...f, owner_phone: v || null })} placeholder="0812…" keyboardType="phone-pad" />
                </Field>
              </View>
            </View>
            <Button title="Simpan" onPress={() => save.mutate()} loading={save.isPending} testID="edit-unit-save-button" />
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

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const s2 = rowStyles();
  return (
    <View style={[s2.row, !last && s2.rowBorder]}>
      <RNText style={s2.rowLabel}>{label}</RNText>
      <RNText style={s2.rowValue}>{value}</RNText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  rowLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  notes: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.md, fontStyle: "italic" },
  matchLeadName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  matchLeadMeta: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
  checkMark: { color: colors.success, fontFamily: fonts.semibold, fontSize: 13 },
  checkText: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: 13 },
}));

const rowStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  rowValue: { color: colors.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 13, textAlign: "right", flex: 1, marginLeft: spacing.lg },
}));
