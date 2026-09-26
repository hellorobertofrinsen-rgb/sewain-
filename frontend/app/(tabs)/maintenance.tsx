import React, { useState } from "react";
import { FlatList, Pressable, Text as RNText, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";
import { Sheet } from "@/src/components/Sheet";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Field, Spinner, StatusPill, Textarea } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { MAINT_STATUS, PRIORITY_LABEL, relTime } from "@/src/lib/format";
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
  const [created, setCreated] = useState<any>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["maintenance"],
    queryFn: () => api<any[]>("/maintenance"),
  });

  const { data: units } = useQuery({ queryKey: ["units", "semua"], queryFn: () => api<any[]>("/units?status=semua"), enabled: reportOpen });

  const create = useMutation({
    mutationFn: () => api("/maintenance", { method: "POST", body: { description: desc, unit_id: unitId } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["impact"] });
      qc.invalidateQueries({ queryKey: ["units"] });
      setCreated(r);
      setDesc("");
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
      qc.invalidateQueries({ queryKey: ["impact"] });
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
        <Pressable testID="report-issue-button" onPress={() => { setReportOpen(true); setCreated(null); }} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}>
          <Icon name="plus" size={18} color={colors.onBrandPrimary} />
          <RNText style={s.addText}>Lapor</RNText>
        </Pressable>
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
                  <RNText style={s.desc}>{item.ai_summary || item.description}</RNText>
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
            <EmptyState icon="wrench" title="Tidak ada masalah aktif" subtitle="Laporkan komplain tenant di sini — Sewain yang pilah katagori dan prioritasnya." />
          }
        />
      )}

      <Sheet visible={reportOpen} onClose={() => setReportOpen(false)} title="Lapor Masalah" testID="report-issue-sheet" scroll>
        {created ? (
          <View style={{ gap: spacing.md }}>
            <View style={s.aiResult}>
              <RNText style={s.aiResultTitle}>Sewain sudah pilah laporannya:</RNText>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <StatusPill label={created.category} tone="neutral" testID="ai-category-pill" />
                <StatusPill label={PRIORITY_LABEL[created.priority]} tone={created.priority === "urgent" ? "error" : "neutral"} testID="ai-priority-pill" />
                {created.unit_name !== undefined ? null : null}
              </View>
              <RNText style={s.aiResultSummary}>{created.ai_summary}</RNText>
            </View>
            <Button title="Lihat Daftar Masalah" onPress={() => setReportOpen(false)} testID="ai-result-close-button" />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Field label="Ceritakan masalahnya">
              <Textarea
                testID="issue-description-input"
                value={desc}
                onChangeText={setDesc}
                placeholder="mis. AC kamar A12 bocor dari tadi malam dan airnya kena kasur."
              />
            </Field>
            <Field label="Unit (opsional — biar Sewain yang tebak)">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(units || []).slice(0, 14).map((u: any) => (
                  <Chip key={u.id} label={u.name} active={unitId === u.id} onPress={() => setUnitId(unitId === u.id ? null : u.id)} />
                ))}
              </View>
            </Field>
            <Button title="Kirim & Klasifikasikan dengan AI" onPress={() => create.mutate()} loading={create.isPending} testID="issue-submit-button" />
            <RNText style={s.note}>Sewain otomatis menentukan katagori, prioritas, dan unit terkait.</RNText>
          </View>
        )}
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
  aiResult: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md },
  aiResultTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  aiResultSummary: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
}));
