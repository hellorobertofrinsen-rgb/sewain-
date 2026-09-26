import React, { useState } from "react";
import { FlatList, Pressable, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Spinner, StatusPill } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { LEAD_STATUS, relTime, rupiahShort } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const STATUS_FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "perlu_followup", label: "Perlu follow-up" },
  { key: "baru", label: "Baru" },
  { key: "sedang_ngobrol", label: "Sedang ngobrol" },
  { key: "viewing", label: "Viewing" },
  { key: "negotiation", label: "Negosiasi" },
  { key: "deal", label: "Deal" },
  { key: "tidak_jadi", label: "Tidak jadi" },
];

function toneFor(status: string): "success" | "warning" | "error" | "info" | "neutral" {
  if (status === "deal") return "success";
  if (status === "perlu_followup" || status === "negotiation") return "warning";
  if (status === "viewing") return "info";
  if (status === "tidak_jadi") return "neutral";
  return "neutral";
}

export default function LeadsScreen() {
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [filter, setFilter] = useState("semua");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["leads", filter],
    queryFn: () => api<any[]>(`/leads?status=${filter}`),
  });

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <RNText style={s.title}>Calon Penyewa</RNText>
        <Pressable testID="leads-analyze-button" onPress={() => router.push("/import-chat")} style={({ pressed }) => [s.aiBtn, pressed && { opacity: 0.7 }]}>
          <Icon name="chat" size={16} color={colors.onBrandPrimary} />
          <RNText style={s.aiBtnText}>Analisis Chat</RNText>
        </Pressable>
      </View>

      <ChipRow testID="lead-filter-row">
        {STATUS_FILTERS.map((st) => (
          <Chip key={st.key} label={st.label} active={filter === st.key} onPress={() => setFilter(st.key)} testID={`lead-filter-${st.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner label="Memuat calon penyewa…" />
      ) : error ? (
        <ErrorBox message={(error as any)?.message} onRetry={refetch} />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + spacing.xxxl, gap: spacing.md, paddingTop: spacing.xs }}
          renderItem={({ item }) => (
            <Card testID={`lead-card-${item.id}`} onPress={() => router.push(`/lead/${item.id}` as any)}>
              <View style={s.cardHead}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={s.name}>{item.name}</RNText>
                  <RNText style={s.meta}>
                    {[
                      item.unit_type,
                      item.budget_max || item.budget_min ? `Budget max ${rupiahShort(item.budget_max || item.budget_min)}` : null,
                      item.move_in_date ? `Move-in: ${item.move_in_date}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </RNText>
                </View>
                <StatusPill label={LEAD_STATUS[item.status] || item.status} tone={toneFor(item.status)} testID={`lead-status-${item.id}`} />
              </View>
              <RNText style={s.lastContact}>
                {item.last_interaction_at ? `Chat terakhir ${relTime(item.last_interaction_at)}` : "Belum ada interaksi"}
              </RNText>
              {item.ai_note ? <RNText style={s.aiNote}>“{item.ai_note}”</RNText> : null}
              {item.matched_unit ? (
                <RNText style={s.matchLine}>
                  Cocok: <RNText style={s.matchUnit}>{item.matched_unit.name}</RNText> · {rupiahShort(item.matched_unit.monthly_price)}/bln
                </RNText>
              ) : null}
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="Belum ada calon penyewa"
              subtitle="Upload atau tempel chat WhatsApp — Sewain yang baca dan racik jadi daftar."
              action={
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button title="Analisis Chat WA" onPress={() => router.push("/import-chat")} testID="empty-analyze-button" />
                  <Button title="Tambah Manual" variant="ghost" onPress={() => router.push("/lead/new" as any)} testID="empty-manual-lead-button" />
                </View>
              }
            />
          }
        />
      )}
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
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 40 },
  aiBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 13 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  name: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  meta: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13 },
  lastContact: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: spacing.sm },
  aiNote: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontStyle: "italic", fontSize: 13, lineHeight: 19, marginTop: 4 },
  matchLine: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: spacing.sm },
  matchUnit: { color: colors.onSurface, fontFamily: fonts.semibold },
}));
