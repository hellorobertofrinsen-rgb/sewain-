import React, { useState } from "react";
import { FlatList, Linking, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/src/components/Icon";
import { TabHeader } from "@/src/components/TabHeader";
import { SplitView } from "@/src/components/SplitView";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Input, Spinner, StatusPill, PressableScale } from "@/src/components/ui";
import { LeadDetail } from "@/app/lead/[id]";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { useIsWide } from "@/src/lib/layout";
import { waLink } from "@/src/lib/messages";
import { LEAD_STATUS, dayLabel, relTime, rupiahShort } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import { STATE_TRANSITION } from "@/src/motion";

const STATUS_FILTERS = [
  { key: "aktif", label: "Aktif" },
  { key: "baru", label: "Baru" },
  { key: "sedang_ngobrol", label: "Dihubungi" },
  { key: "viewing", label: "Viewing" },
  { key: "negotiation", label: "Negosiasi" },
  { key: "deal", label: "Deal" },
  { key: "tidak_jadi", label: "Tidak jadi" },
];

function toneFor(status: string): "success" | "warning" | "error" | "info" | "neutral" | "brand" {
  if (status === "deal") return "success";
  if (status === "perlu_followup" || status === "negotiation") return "warning";
  if (status === "viewing") return "info";
  if (status === "baru") return "brand";
  return "neutral";
}

const unanswered = (l: any) => l.status === "baru" && !l.last_contact_at;

export default function LeadsScreen() {
  const s = useStyles();
  const wide = useIsWide();
  const [filter, setFilter] = useState("aktif");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { plan, isFree, atLeadLimit, showUpgrade } = usePlan();
  const addLead = () => (atLeadLimit ? showUpgrade("limit_leads") : router.push("/lead/new" as any));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["leads", filter],
    queryFn: () => api<any[]>(`/leads?status=${filter}`),
  });

  const needle = q.trim().toLowerCase();
  // Unanswered new prospects first: reply speed is what wins the tenant.
  const rows = [...(data || [])].sort((a, b) => Number(unanswered(b)) - Number(unanswered(a))).filter(
    (l) => !needle || l.name?.toLowerCase().includes(needle) || (l.phone || "").replace(/\D/g, "").includes(needle.replace(/\D/g, "") || "~"),
  );
  const waiting = (data || []).filter(unanswered).length;
  const sub =
    filter === "aktif" && data
      ? [`${data.length} aktif`, waiting ? `${waiting} belum dibalas` : null].filter(Boolean).join(" · ")
      : null;

  const open = (id: string) => (wide ? setSelected(id) : router.push(`/lead/${id}` as any));

  const list = (
    <View style={s.root}>
      <TabHeader
        title="Prospek"
        sub={sub}
        right={<Button title="Tambah" icon="plus" size="sm" onPress={addLead} testID="add-lead-button" />}
      />
      {isFree && plan ? (
        <RNText style={s.usage}>
          {plan.usage.active_leads}/{plan.limits.max_active_leads} prospek aktif · paket Free
        </RNText>
      ) : null}
      <View style={s.searchWrap}>
        <Input
          testID="lead-search-input"
          value={q}
          onChangeText={setQ}
          placeholder="Cari nama atau nomor"
          autoCorrect={false}
          style={s.search}
          {...({ enterKeyHint: "search" } as any)}
        />
      </View>
      <ChipRow testID="lead-filter-row">
        {STATUS_FILTERS.map((st) => (
          <Chip key={st.key} label={st.label} active={filter === st.key} onPress={() => setFilter(st.key)} testID={`lead-filter-${st.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner label="Memuat prospek…" />
      ) : error ? (
        <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => l.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => <LeadCard item={item} selected={wide && selected === item.id} onPress={() => open(item.id)} />}
          ListEmptyComponent={
            needle ? (
              <EmptyState art="leads" title={`Tidak ada “${q.trim()}”`} subtitle="Coba nama lain, atau cek filter di atas." />
            ) : (
              <EmptyState
                art="leads"
                title={filter === "aktif" ? "Belum ada prospek aktif" : "Tidak ada prospek di status ini"}
                subtitle="Catat setiap orang yang tanya unit. Sewain carikan unit yang cocok dan ingatkan kapan harus dibalas."
                action={<Button title="Tambah Prospek" icon="plus" onPress={addLead} testID="empty-new-lead-button" />}
              />
            )
          }
        />
      )}
    </View>
  );

  return (
    <SplitView
      list={list}
      detail={selected ? <LeadDetail key={selected} id={selected} embedded onGone={() => setSelected(null)} /> : null}
      emptyArt="leads"
      emptyText="Pilih prospek untuk lihat detail dan langkah berikutnya."
    />
  );
}

function LeadCard({ item, selected, onPress }: { item: any; selected: boolean; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const wa = waLink(item.phone);
  const isNew = unanswered(item);
  const closed = ["deal", "tidak_jadi"].includes(item.status);
  return (
    <Card testID={`lead-card-${item.id}`} onPress={onPress} style={[STATE_TRANSITION, s.card, selected && s.cardSelected]}>
      <View style={s.cardHead}>
        <View style={{ flex: 1, gap: 4 }}>
          <RNText style={s.name} numberOfLines={1}>{item.name}</RNText>
          <RNText style={s.meta} numberOfLines={1}>
            {[
              item.unit_type,
              item.budget_max || item.budget_min ? `≤ ${rupiahShort(item.budget_max || item.budget_min)}` : null,
              item.move_in_date ? `pindah ${item.move_in_date}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Kebutuhan belum dicatat"}
          </RNText>
        </View>
        {wa && !closed ? (
          <PressableScale
            testID={`lead-wa-${item.id}`}
            accessibilityLabel={`WhatsApp ${item.name}`}
            onPress={() => Linking.openURL(wa)}
            style={s.waBtn}
          >
            <Icon name="message" size={20} color={colors.success} />
          </PressableScale>
        ) : null}
      </View>
      <View style={s.foot}>
        <StatusPill label={isNew ? "Baru · belum dibalas" : LEAD_STATUS[item.status] || item.status} tone={toneFor(item.status)} testID={`lead-status-${item.id}`} />
        <RNText style={[s.when, isNew && { color: colors.brandPrimary, ...fonts.semibold }]} numberOfLines={1}>
          {isNew
            ? `masuk ${relTime(item.created_at)}`
            : item.next_followup_date && !closed
              ? `Follow-up ${dayLabel(item.next_followup_date + "T00:00:00").toLowerCase()}`
              : item.last_interaction_at
                ? `Kontak ${relTime(item.last_interaction_at)}`
                : ""}
        </RNText>
      </View>
      {item.matched_unit ? (
        <RNText style={s.matchLine} numberOfLines={1}>
          Cocok: <RNText style={s.matchUnit}>{item.matched_unit.name}</RNText> · {rupiahShort(item.matched_unit.monthly_price)}/bln
        </RNText>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  usage: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14, paddingHorizontal: spacing.lg, marginTop: -4, marginBottom: spacing.sm },
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  search: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, minHeight: 46 },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.md },
  card: { borderWidth: 1.5, borderColor: "transparent" },
  cardSelected: { borderColor: colors.brandPrimary },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { color: colors.onSurface, ...fonts.semibold, fontSize: 18, letterSpacing: -0.2 },
  meta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15 },
  waBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(30,122,79,0.1)" },
  foot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  when: { color: colors.muted, ...fonts.regular, fontSize: 14, flex: 1, textAlign: "right" },
  matchLine: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14, marginTop: spacing.sm },
  matchUnit: { color: colors.onSurface, ...fonts.semibold },
}));
