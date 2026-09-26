import React, { useState } from "react";
import { FlatList, Text as RNText, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Field, Spinner, StatusPill, SwitchRow, Textarea, PressableScale } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { MAINT_STATUS, relTime } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "aktif", label: "Aktif" },
  { key: "darurat", label: "Darurat" },
  { key: "selesai", label: "Selesai" },
];

export default function MaintenanceScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [filter, setFilter] = useState("aktif");
  const [reportOpen, setReportOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [urgent, setUrgent] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["maintenance"],
    queryFn: () => api<any[]>("/maintenance"),
  });

  const { data: units } = useQuery({ queryKey: ["units", "semua"], queryFn: () => api<any[]>("/units?status=semua"), enabled: reportOpen });

  const create = useMutation({
    mutationFn: () => api("/maintenance", { method: "POST", body: { description: desc, unit_id: unitId, urgent } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      toast(urgent ? "Masalah urgent dicatat — muncul paling atas di Hari Ini" : "Masalah dicatat ✓");
      setReportOpen(false);
      setDesc("");
      setUnitId(null);
      setUrgent(false);
    },
    onError: (e: any) => toast(e?.message || "Gagal melapor", "error"),
  });

  const start = useMutation({
    mutationFn: (id: string) => api(`/maintenance/${id}/start`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["today"] });
    },
  });
  const resolve = useMutation({
    mutationFn: (id: string) => api(`/maintenance/${id}/resolve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["units"] });
      toast("Masalah ditandai selesai ✓");
    },
    onError: (e: any) => toast(e?.message || "Gagal menandai selesai", "error"),
  });

  const filtered = (data || []).filter((m: any) => {
    if (filter === "aktif") return m.status !== "selesai";
    if (filter === "darurat") return m.priority === "urgent" && m.status !== "selesai";
    if (filter === "selesai") return m.status === "selesai";
    return true;
  });

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <RNText style={s.title}>Masalah</RNText>
        <PressableScale testID="report-issue-button" onPress={() => setReportOpen(true)} style={[s.addBtn]}>
          <Icon name="plus" size={18} color={colors.onBrandPrimary} />
          <RNText style={s.addText}>Lapor</RNText>
        </PressableScale>
      </View>

      <ChipRow testID="maintenance-filter-row">
        {FILTERS.map((ft) => (
          <Chip key={ft.key} label={ft.label} active={filter === ft.key} onPress={() => setFilter(ft.key)} testID={`maintenance-filter-${ft.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner label="Memuat masalah…" />
      ) : error ? (
        <ErrorBox message={(error as any)?.message} onRetry={refetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + spacing.xxxl, gap: spacing.md, paddingTop: spacing.xs }}
          renderItem={({ item }) => (
            <Card testID={`maintenance-card-${item.id}`}>
              <View style={s.cardHead}>
                <View style={{ flex: 1, gap: 3 }}>
                  <RNText style={s.unitName}>
                    {item.unit_name ? `Unit ${item.unit_name}` : "Area umum"} · {item.category}
                  </RNText>
                  <RNText style={s.desc}>{item.description}</RNText>
                </View>
                {item.priority === "urgent" && item.status !== "selesai" ? (
                  <StatusPill label="URGENT" tone="error" testID={`maint-urgent-${item.id}`} />
                ) : null}
              </View>
              <View style={s.cardFoot}>
                <StatusPill label={MAINT_STATUS[item.status] || item.status} tone={item.status === "selesai" ? "success" : item.status === "sedang" ? "info" : "warning"} testID={`maint-status-${item.id}`} />
                <RNText style={s.time}>{relTime(item.created_at)}</RNText>
              </View>
              {item.status !== "selesai" ? (
                <View style={s.actions}>
                  {item.status === "baru" ? (
                    <Button title="Mulai Kerjakan" variant="ghost" size="sm" onPress={() => start.mutate(item.id)} testID={`maint-start-${item.id}`} />
                  ) : null}
                  <Button title="Tandai Selesai" size="sm" onPress={() => resolve.mutate(item.id)} testID={`maint-resolve-${item.id}`} />
                </View>
              ) : null}
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState icon="wrench" title={filter === "selesai" ? "Belum ada masalah yang selesai" : "Tidak ada masalah aktif"} subtitle="Catat komplain tenant atau kerusakan unit di sini supaya nggak lupa ditindaklanjuti." />
          }
        />
      )}

      <Sheet visible={reportOpen} onClose={() => setReportOpen(false)} title="Lapor Masalah" testID="report-issue-sheet" scroll>
        <View style={{ gap: spacing.md }}>
          <Field label="Masalahnya apa?">
            <Textarea
              testID="issue-description-input"
              value={desc}
              onChangeText={setDesc}
              placeholder="mis. AC kamar A12 bocor, airnya kena kasur."
            />
          </Field>
          <Field label="Unit (opsional)">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(units || []).map((u: any) => (
                <Chip key={u.id} label={u.name} active={unitId === u.id} onPress={() => setUnitId(unitId === u.id ? null : u.id)} testID={`issue-unit-${u.id}`} />
              ))}
            </View>
          </Field>
          <SwitchRow label="Urgent — perlu ditangani hari ini" value={urgent} onChange={setUrgent} testID="issue-urgent-switch" />
          <Button title="Catat Masalah" onPress={() => create.mutate()} loading={create.isPending} disabled={desc.trim().length < 3} testID="issue-submit-button" />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.4 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 40 },
  addText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 13 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  unitName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  desc: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  time: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
}));
