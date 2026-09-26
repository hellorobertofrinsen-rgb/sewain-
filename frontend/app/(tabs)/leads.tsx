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
import { viewingInviteMessage, waLink } from "@/src/lib/messages";
import { dateTimeLabel, dayLabel, daysAgoLabel, expiredLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import { STATE_TRANSITION } from "@/src/motion";

// "hot" is the agent's own label (not a status), filtered on this side.
const STATUS_FILTERS = [
  { key: "aktif", label: "Aktif" },
  { key: "hot", label: "Hot buyer" },
  { key: "viewing", label: "Viewing" },
  { key: "negotiation", label: "Negosiasi" },
  { key: "deal", label: "Deal" },
  { key: "tidak_jadi", label: "Tidak jadi" },
];

export default function LeadsScreen() {
  const s = useStyles();
  const wide = useIsWide();
  const [filter, setFilter] = useState("aktif");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [openSheet, setOpenSheet] = useState<string | undefined>(undefined);
  const { plan, isFree, atLeadLimit, showUpgrade } = usePlan();
  const addLead = () => (atLeadLimit ? showUpgrade("limit_leads") : router.push("/lead/new" as any));

  const status = filter === "hot" ? "aktif" : filter;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["leads", status],
    queryFn: () => api<any[]>(`/leads?status=${status}`),
  });

  const needle = q.trim().toLowerCase();
  const rows = (data || [])
    .filter((l) => filter !== "hot" || l.interest === "high")
    .filter((l) => !needle || l.name?.toLowerCase().includes(needle) || (l.phone || "").replace(/\D/g, "").includes(needle.replace(/\D/g, "") || "~"));
  const hotCount = (data || []).filter((l) => l.interest === "high").length;
  const sub = filter === "aktif" && data ? [`${data.length} aktif`, hotCount ? `${hotCount} hot buyer` : null].filter(Boolean).join(" · ") : null;

  const open = (id: string) => {
    if (!wide) return router.push(`/lead/${id}` as any);
    setOpenSheet(undefined);
    setSelected(id);
  };

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
          renderItem={({ item }) => (
            <LeadCard
              item={item}
              selected={wide && selected === item.id}
              onPress={() => open(item.id)}
              onOpenUnit={(uid) => router.push(`/unit/${uid}` as any)}
              onSchedule={() => (wide ? (setSelected(item.id), setOpenSheet("viewing")) : router.push(`/lead/${item.id}?open=viewing` as any))}
            />
          )}
          ListEmptyComponent={
            needle ? (
              <EmptyState art="leads" title={`Tidak ada “${q.trim()}”`} subtitle="Coba nama lain, atau cek filter di atas." />
            ) : (
              <EmptyState
                art="leads"
                title={filter === "aktif" ? "Belum ada prospek aktif" : "Tidak ada prospek di status ini"}
                subtitle="Catat setiap orang yang tanya unit. SewAIn carikan unit yang cocok dan ingatkan kapan harus dibalas."
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
      detail={selected ? <LeadDetail key={`${selected}-${openSheet ?? ""}`} id={selected} open={openSheet} embedded onGone={() => setSelected(null)} /> : null}
      emptyArt="leads"
      emptyText="Pilih prospek untuk lihat detail dan langkah berikutnya."
    />
  );
}

/** One line of fact the agent recorded, most useful first; nothing when there's nothing recorded. */
function factLine(item: any): string | null {
  const closed = ["deal", "tidak_jadi"].includes(item.status);
  if (!closed && item.next_viewing_at) return `Viewing ${dateTimeLabel(item.next_viewing_at)}`;
  if (item.last_viewing_at) return `Sudah viewing ${daysAgoLabel(item.last_viewing_at)}`;
  if (!closed && item.next_followup_date) return `Follow-up ${dayLabel(item.next_followup_date + "T00:00:00").toLowerCase()}`;
  return null;
}

function LeadCard({ item, selected, onPress, onOpenUnit, onSchedule }: { item: any; selected: boolean; onPress: () => void; onOpenUnit: (id: string) => void; onSchedule: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const wa = waLink(item.phone);
  const closed = ["deal", "tidak_jadi"].includes(item.status);
  const hot = item.interest === "high";
  const stage = item.status === "negotiation" ? "Negosiasi" : item.status === "deal" ? "Deal" : item.status === "tidak_jadi" ? "Tidak jadi" : null;
  const fact = factLine(item);
  const meta = [
    item.unit_type,
    item.budget_max || item.budget_min ? `Budget ${rupiah(item.budget_max || item.budget_min)}` : null,
    expiredLabel(item.move_in_date),
  ].filter(Boolean);
  return (
    <Card testID={`lead-card-${item.id}`} onPress={onPress} style={[STATE_TRANSITION, s.card, selected && s.cardSelected]}>
      <View style={s.cardHead}>
        <View style={{ flex: 1, gap: 4 }}>
          <RNText style={s.name} numberOfLines={1}>{item.name}</RNText>
          {meta.length ? <RNText style={s.meta}>{meta.join(" · ")}</RNText> : null}
        </View>
        {wa && !closed ? (
          <PressableScale
            testID={`lead-wa-${item.id}`}
            accessibilityLabel={`WhatsApp ${item.name}`}
            onPress={() => Linking.openURL(wa)}
            style={s.waBtn}
          >
            <Icon name="whatsapp" size={21} color={colors.success} />
          </PressableScale>
        ) : null}
      </View>
      {hot || stage || fact ? (
        <View style={s.foot}>
          {hot ? <StatusPill label="Hot buyer" tone="error" testID={`lead-hot-${item.id}`} /> : null}
          {stage ? <StatusPill label={stage} tone={item.status === "deal" ? "success" : item.status === "negotiation" ? "warning" : "neutral"} testID={`lead-status-${item.id}`} /> : null}
          {fact ? <RNText style={s.when} numberOfLines={1}>{fact}</RNText> : null}
        </View>
      ) : null}
      {!closed ? (
        <View style={s.actions}>
          {item.next_viewing ? (
            wa ? (
              <Button
                title="Undang Viewing"
                icon="whatsapp"
                size="sm"
                variant="secondary"
                onPress={() => Linking.openURL(waLink(item.phone, viewingInviteMessage({ name: item.name, unit_name: item.next_viewing.unit_name, scheduled_at: item.next_viewing.at, location: item.next_viewing.location }))!)}
                testID={`lead-invite-${item.id}`}
              />
            ) : null
          ) : (
            <Button title="Jadwalkan Viewing" icon="calendar-check" size="sm" variant="secondary" onPress={onSchedule} testID={`lead-schedule-${item.id}`} />
          )}
        </View>
      ) : null}
      {item.matched_unit ? (
        <PressableScale testID={`lead-match-${item.id}`} role="link" onPress={() => onOpenUnit(item.matched_unit.id)} style={s.matchRow}>
          <RNText style={s.matchLine} numberOfLines={1}>
            Cocok: <RNText style={s.matchUnit}>{item.matched_unit.name}</RNText> · {rupiah(item.matched_unit.monthly_price)}/bln
          </RNText>
          <Icon name="chevron-right" size={16} color={colors.brandPrimary} />
        </PressableScale>
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
  foot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  when: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md, alignSelf: "flex-start", paddingVertical: 4 },
  matchLine: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5 },
  matchUnit: { color: colors.onSurface, ...fonts.semibold },
}));
