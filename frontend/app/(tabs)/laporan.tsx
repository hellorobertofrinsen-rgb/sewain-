import React, { useState } from "react";
import { ScrollView, Switch, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { TabHeader } from "@/src/components/TabHeader";
import { DateInput } from "@/src/components/DateInput";
import { Icon, IconName } from "@/src/components/Icon";
import { Card, Chip, ErrorBox, Field, IconCircle, PressableScale, Spinner, Tone } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { t } from "@/src/lib/i18n";
import { dateLabel, rupiah } from "@/src/lib/format";
import { useIsWide } from "@/src/lib/layout";
import { cardShadow, fonts, makeStyles, spacing, useTheme } from "@/src/theme";

// Portfolio numbers for today / this week / this month / any range, each compared
// with the same-length period right before it. Only recorded data, no estimates.

type Numbers = { prospects: number; tenants: number; units: number; monthly_income: number; daily_income: number; daily_nights: number; collected: number };
type Step = { key: string; label: string; count: number; of: number; percent: number | null };
type UnitRow = { id: string; name: string; status: string; viewings: number; prospects: number; nights: number; score: number; vacant_days: number | null };
type Stats = {
  period: { start: string; end: string; days: number };
  previous_period: { start: string; end: string; days: number };
  current: Numbers;
  previous: Numbers;
  prospects: number;
  steps: Step[];
  totals: { direct_deals: number };
  hot_units: UnitRow[];
  least_units: UnitRow[];
};

type Period = "today" | "week" | "month" | "custom";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function range(p: Period, custom: { start: string; end: string }): { start: string; end: string } {
  const now = new Date();
  if (p === "today") return { start: iso(now), end: iso(now) };
  if (p === "week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // weeks start on Monday
    return { start: iso(monday), end: iso(now) };
  }
  if (p === "month") return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(now) };
  return custom;
}

const STEP_BASE: Record<string, string> = {
  viewing: "prospek",
  negotiation: "yang sudah viewing",
  deal: "yang sudah negosiasi",
  extend: "tenant baru",
};

export default function LaporanScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const wide = useIsWide();
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState(() => {
    const now = new Date();
    return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(now) };
  });
  const [compare, setCompare] = useState(true);
  const r = range(period, custom);
  const valid = r.start && r.end && r.start <= r.end;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stats", r.start, r.end],
    queryFn: () => api<Stats>(`/stats?start=${r.start}&end=${r.end}`),
    enabled: !!valid,
  });

  const periodLabel = data
    ? data.period.start === data.period.end
      ? dateLabel(data.period.start + "T00:00:00")
      : `${dateLabel(data.period.start + "T00:00:00")} – ${dateLabel(data.period.end + "T00:00:00")}`
    : null;

  const tiles: { key: keyof Numbers; label: string; icon: IconName; tone: Tone; money?: boolean; sub?: (n: Numbers) => string }[] = [
    { key: "monthly_income", label: "Pemasukan bulanan (tenant)", icon: "wallet", tone: "success", money: true },
    { key: "daily_income", label: "Total sewa harian", icon: "calendar-check", tone: "info", money: true, sub: (n) => t("{n} malam", { n: n.daily_nights }) },
    { key: "collected", label: "Sewa diterima", icon: "check", tone: "brand", money: true },
    { key: "prospects", label: "Prospek baru", icon: "person", tone: "brand" },
    { key: "tenants", label: "Tenant aktif", icon: "key", tone: "warning" },
    { key: "units", label: "Unit||tab", icon: "building", tone: "neutral" },
  ];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false} testID="laporan-screen">
        <TabHeader title={t("Laporan")} sub={periodLabel} menu />
        <View style={s.controls}>
          <View style={s.periods}>
            {([["today", "Hari ini"], ["week", "Minggu ini"], ["month", "Bulan ini"], ["custom", "Pilih tanggal"]] as [Period, string][]).map(([k, l]) => (
              <Chip key={k} label={t(l)} active={period === k} onPress={() => setPeriod(k)} testID={`laporan-period-${k}`} />
            ))}
          </View>
          {period === "custom" ? (
            <View style={s.customRow}>
              <View style={{ flex: 1 }}>
                <Field label={t("Dari")}><DateInput testID="laporan-start" value={custom.start} onChange={(v) => setCustom((c) => ({ ...c, start: v }))} /></Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t("Sampai")}><DateInput testID="laporan-end" value={custom.end} onChange={(v) => setCustom((c) => ({ ...c, end: v }))} /></Field>
              </View>
            </View>
          ) : null}
          <View style={s.compareRow}>
            <RNText style={s.compareText}>
              {t("Bandingkan dengan periode sebelumnya")}
              {compare && data ? (
                <RNText style={s.compareSub}>{`\n${dateLabel(data.previous_period.start + "T00:00:00")} – ${dateLabel(data.previous_period.end + "T00:00:00")}`}</RNText>
              ) : null}
            </RNText>
            <Switch testID="laporan-compare" value={compare} onValueChange={setCompare} trackColor={{ false: colors.borderStrong, true: colors.brandPrimary }} thumbColor="#FFFFFF" />
          </View>
        </View>

        {!valid ? (
          <View style={{ padding: spacing.lg }}><ErrorBox message={t("Tanggal akhir harus setelah tanggal mulai")} /></View>
        ) : isLoading ? (
          <Spinner label={t("Menghitung…")} />
        ) : error || !data ? (
          <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message || t("Gagal memuat.")} onRetry={refetch} /></View>
        ) : (
          <View style={s.content}>
            <View style={s.grid}>
              {tiles.map((tl) => {
                const v = data.current[tl.key];
                const prev = data.previous[tl.key];
                return (
                  <Card key={tl.key} testID={`stat-${tl.key}`} style={[s.tile, wide && s.tileWide]}>
                    <IconCircle icon={tl.icon} tone={tl.tone} size={34} />
                    <RNText style={[s.tileValue, tl.money && String(rupiah(v)).length > 11 && s.tileValueLong]} numberOfLines={1}>
                      {tl.money ? rupiah(v) : v}
                    </RNText>
                    <RNText style={s.tileLabel}>{t(tl.label)}</RNText>
                    {tl.sub ? <RNText style={s.tileSub}>{tl.sub(data.current)}</RNText> : null}
                    {compare ? <Delta now={v} before={prev} money={tl.money} /> : null}
                  </Card>
                );
              })}
            </View>

            <UnitList
              title={t("Top 3 unit paling diminati")}
              empty={t("Belum ada viewing, prospek, atau booking di periode ini.")}
              rows={data.hot_units}
              tone="success"
              icon="trending-up"
              testID="hot-units"
            />
            <UnitList
              title={t("3 unit paling sepi peminat")}
              empty={t("Semua unit terisi.")}
              rows={data.least_units}
              tone="warning"
              icon="clock"
              testID="least-units"
            />

            <RNText style={s.section}>{t("Dari prospek sampai perpanjang")}</RNText>
            {data.steps.map((st, i) => (
              <Card key={st.key} testID={`funnel-${st.key}`} style={{ gap: 6 }}>
                <View style={s.stepHead}>
                  <View style={s.stepNo}><RNText style={s.stepNoText}>{i + 1}</RNText></View>
                  <RNText style={s.stepLabel}>{t(st.label)}</RNText>
                  <RNText style={s.stepPct}>{st.percent != null ? `${st.percent}%` : "–"}</RNText>
                </View>
                <RNText style={s.caption}>{st.of ? t("{a} dari {b} {base}", { a: st.count, b: st.of, base: t(STEP_BASE[st.key]) }) : t("Belum ada {base}", { base: t(STEP_BASE[st.key]) })}</RNText>
                <View style={s.track}><View style={[s.fill, { width: `${st.percent ?? 0}%` }]} /></View>
              </Card>
            ))}
            <RNText style={s.note}>
              {t("Semua angka dihitung dari yang kamu catat di SewAIn. Viewing dihitung setelah jadwalnya lewat dan tidak dibatalkan.")}
              {data.totals.direct_deals ? ` ${t("{n} deal langsung tanpa negosiasi tidak masuk langkah 3.", { n: data.totals.direct_deals })}` : ""}
            </RNText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Delta({ now, before, money }: { now: number; before: number; money?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const diff = now - before;
  if (diff === 0) return <RNText style={s.deltaFlat}>{t("Sama dengan sebelumnya")}</RNText>;
  const up = diff > 0;
  const pct = before ? Math.round((Math.abs(diff) / before) * 100) : null;
  const text = money ? rupiah(Math.abs(diff)) : String(Math.abs(diff));
  return (
    <View style={s.deltaRow}>
      <Icon name={up ? "trending-up" : "chevron-right"} size={14} color={up ? colors.success : colors.error} />
      <RNText style={[s.delta, { color: up ? colors.success : colors.error }]} numberOfLines={1}>
        {up ? "+" : "−"}{text}{pct != null ? ` (${pct}%)` : ""}
      </RNText>
    </View>
  );
}

function UnitList({ title, empty, rows, tone, icon, testID }: { title: string; empty: string; rows: UnitRow[]; tone: Tone; icon: IconName; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <RNText style={s.section}>{title}</RNText>
      <View style={s.list}>
        {rows.length === 0 ? <RNText style={s.emptyText}>{empty}</RNText> : null}
        {rows.map((u, i) => (
          <PressableScale soft key={u.id} onPress={() => router.push(`/unit/${u.id}` as any)} style={[s.row, i === rows.length - 1 && { borderBottomWidth: 0 }]} testID={`${testID}-${u.id}`}>
            <IconCircle icon={icon} tone={tone} size={38} />
            <View style={{ flex: 1, gap: 2 }}>
              <RNText style={s.rowTitle}>{u.name}</RNText>
              <RNText style={s.rowSub}>
                {[
                  u.vacant_days != null ? t("Kosong {n} hari", { n: u.vacant_days }) : null,
                  t("{n} viewing", { n: u.viewings }),
                  t("{n} prospek", { n: u.prospects }),
                  u.nights ? t("{n} malam", { n: u.nights }) : null,
                ].filter(Boolean).join(" · ")}
              </RNText>
            </View>
            <Icon name="chevron-right" size={16} color={colors.borderStrong} />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  controls: { paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing.lg, maxWidth: 760, width: "100%", alignSelf: "center" },
  periods: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  customRow: { flexDirection: "row", gap: spacing.md },
  compareRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: 16, paddingHorizontal: spacing.md, paddingVertical: 10, ...cardShadow },
  compareText: { color: colors.onSurface, ...fonts.medium, fontSize: 15, flex: 1 },
  compareSub: { color: colors.muted, ...fonts.regular, fontSize: 13 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, maxWidth: 760, width: "100%", alignSelf: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { flexBasis: "45%", flexGrow: 1, gap: 4, padding: spacing.md },
  tileWide: { flexBasis: "30%" },
  tileValue: { color: colors.onSurface, ...fonts.bold, fontSize: 24, letterSpacing: -0.5, marginTop: 6 },
  tileValueLong: { fontSize: 19, letterSpacing: -0.3 },
  tileLabel: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 13.5, lineHeight: 18 },
  tileSub: { color: colors.muted, ...fonts.regular, fontSize: 13 },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  delta: { ...fonts.semibold, fontSize: 13 },
  deltaFlat: { color: colors.muted, ...fonts.regular, fontSize: 13, marginTop: 4 },
  section: { color: colors.onSurface, ...fonts.bold, fontSize: 20, letterSpacing: -0.3, marginTop: spacing.md },
  list: { backgroundColor: colors.surfaceSecondary, borderRadius: 20, overflow: "hidden", ...cardShadow },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 16 },
  rowSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 13.5 },
  emptyText: { color: colors.muted, ...fonts.regular, fontSize: 14.5, padding: spacing.md },
  stepHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepNoText: { color: colors.onBrandTertiary, ...fonts.bold, fontSize: 14 },
  stepLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 16, flex: 1 },
  stepPct: { color: colors.onSurface, ...fonts.bold, fontSize: 22, letterSpacing: -0.4 },
  caption: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginTop: 4 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  note: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 20, marginTop: spacing.sm },
}));
