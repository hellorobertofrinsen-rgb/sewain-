import React, { useState } from "react";
import { FlatList, Linking, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/src/components/Icon";
import { TabHeader } from "@/src/components/TabHeader";
import { SplitView } from "@/src/components/SplitView";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Input, Spinner, StatusPill, PressableScale } from "@/src/components/ui";
import { LeadDetail } from "@/app/lead/[id]";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { useIsWide } from "@/src/lib/layout";
import { googleCalendarLink, viewingInviteMessage, waLink } from "@/src/lib/messages";
import { CalendarActions } from "@/src/components/CalendarActions";
import { useToast } from "@/src/components/Toast";
import { t } from "@/src/lib/i18n";
import { lookingFor } from "@/src/lib/unitKinds";
import { Avatar } from "@/src/components/Avatar";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import { STATE_TRANSITION } from "@/src/motion";

// "hot" is the agent's own label (not a status), filtered on this side.
const STATUS_FILTERS = [
  { key: "aktif", label: "Aktif" },
  { key: "hot", label: "Hot Buyer" },
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
  const sub = filter === "aktif" && data ? [t("{n} aktif", { n: data.length }), hotCount ? t("{n} hot buyer", { n: hotCount }) : null].filter(Boolean).join(" · ") : null;

  const open = (id: string) => {
    if (!wide) return router.push(`/lead/${id}` as any);
    setOpenSheet(undefined);
    setSelected(id);
  };

  const list = (
    <View style={s.root}>
      <TabHeader
        title={t("Prospek||tab")}
        sub={sub}
        right={<Button title={t("Tambah")} icon="plus" size="sm" onPress={addLead} testID="add-lead-button" />}
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
          placeholder={t("Cari nama atau nomor")}
          autoCorrect={false}
          style={s.search}
          {...({ enterKeyHint: "search" } as any)}
        />
      </View>
      <ChipRow testID="lead-filter-row">
        {STATUS_FILTERS.map((st) => (
          <Chip key={st.key} label={t(st.label)} active={filter === st.key} onPress={() => setFilter(st.key)} testID={`lead-filter-${st.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner label={t("Memuat prospek…")} />
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
              <EmptyState art="leads" title={t("Tidak ada “{q}”", { q: q.trim() })} subtitle={t("Coba nama lain, atau cek filter di atas.")} />
            ) : (
              <EmptyState
                art="leads"
                title={filter === "aktif" ? t("Belum ada prospek aktif") : t("Tidak ada prospek di status ini")}
                subtitle={t("Catat setiap orang yang tanya unit. SewAIn carikan unit yang cocok dan ingatkan kapan harus dibalas.")}
                action={<Button title={t("Tambah Prospek")} icon="plus" onPress={addLead} testID="empty-new-lead-button" />}
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
      emptyText={t("Pilih prospek untuk lihat detail dan langkah berikutnya.")}
    />
  );
}

/** Add the next viewing to Google Calendar, then [Batal] [Undang Viewing]. */
function CardViewingActions({ lead }: { lead: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const v = lead.next_viewing;
  const info = { name: lead.name, phone: lead.phone, unit_name: v.unit_name, scheduled_at: v.at, location: v.location, units: v.units };
  const wa = waLink(lead.phone, viewingInviteMessage(info));
  const refresh = () => {
    for (const key of ["leads", "lead", "today"]) qc.invalidateQueries({ queryKey: [key] });
  };
  const mark = useMutation({ mutationFn: () => api(`/viewings/${v.id}/calendar`, { method: "POST" }), onSuccess: refresh });
  const cancel = useMutation({
    mutationFn: () => api(`/viewings/${v.id}/cancel`, { method: "POST" }),
    onSuccess: () => { refresh(); toast(t("Viewing dibatalkan")); },
  });
  return (
    <CalendarActions
      added={!!v.calendar_added}
      onAdd={() => {
        Linking.openURL(googleCalendarLink(info));
        mark.mutate();
      }}
      onCancel={() => cancel.mutate()}
      primaryLabel={t("Undang Viewing")}
      onPrimary={wa ? () => Linking.openURL(wa) : null}
      size="sm"
      testID={`lead-viewing-${lead.id}`}
    />
  );
}

function LeadCard({ item, selected, onPress, onOpenUnit, onSchedule }: { item: any; selected: boolean; onPress: () => void; onOpenUnit: (id: string) => void; onSchedule: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const wa = waLink(item.phone);
  const closed = ["deal", "tidak_jadi"].includes(item.status);
  const hot = item.interest === "high";
  const looking = lookingFor(item);
  return (
    <Card testID={`lead-card-${item.id}`} onPress={onPress} style={[STATE_TRANSITION, s.card, selected && s.cardSelected]}>
      <View style={s.cardHead}>
        <Avatar name={item.name} photo={item.photo} size={48} testID={`lead-avatar-${item.id}`} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={s.nameRow}>
            <RNText style={s.name} numberOfLines={1}>{item.name}</RNText>
            {hot ? <StatusPill label={t("Hot Buyer")} tone="error" testID={`lead-hot-${item.id}`} /> : null}
          </View>
          {looking ? <RNText style={s.meta} numberOfLines={1} testID={`lead-looking-${item.id}`}>{looking}</RNText> : null}
        </View>
        {wa && !closed ? (
          <PressableScale
            testID={`lead-wa-${item.id}`}
            accessibilityLabel={t("WhatsApp {name}", { name: item.name })}
            onPress={() => Linking.openURL(wa)}
            style={s.waBtn}
          >
            <Icon name="whatsapp" size={21} color={colors.success} />
          </PressableScale>
        ) : null}
      </View>
      {!closed ? (
        <View style={s.actions}>
          {item.next_viewing ? (
            <View style={{ flex: 1 }}>
              <CardViewingActions lead={item} />
            </View>
          ) : (
            <Button title={t("Jadwalkan Viewing")} icon="calendar-check" size="sm" variant="secondary" onPress={onSchedule} testID={`lead-schedule-${item.id}`} />
          )}
        </View>
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
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
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
