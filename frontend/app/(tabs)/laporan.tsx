import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { TabHeader } from "@/src/components/TabHeader";
import { Card, Chip, EmptyState, ErrorBox, Spinner } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { fonts, makeStyles, spacing } from "@/src/theme";

// Conversion funnel from steps the agent recorded in the app. No estimates: a step
// only counts when it happened (a viewing whose time has passed, a saved
// negotiation, a deal, a contract extension).

type Step = { key: string; label: string; count: number; of: number; percent: number | null };
type Stats = {
  days: number;
  prospects: number;
  steps: Step[];
  totals: { viewing: number; negotiation: number; deal: number; tenants: number; extended: number; direct_deals: number };
};

const PERIODS = [
  { days: 0, label: "Semua" },
  { days: 90, label: "90 hari" },
  { days: 30, label: "30 hari" },
];

const BASE: Record<string, string> = {
  viewing: "prospek",
  negotiation: "yang sudah viewing",
  deal: "yang sudah negosiasi",
  extend: "tenant",
};

export default function LaporanScreen() {
  const s = useStyles();
  const [days, setDays] = useState(0);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stats", days],
    queryFn: () => api<Stats>(`/stats?days=${days}`),
  });

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false} testID="laporan-screen">
        <TabHeader title="Laporan" sub={data ? `${data.prospects} prospek tercatat${days ? ` dalam ${days} hari terakhir` : ""}` : null} />
        <View style={s.periods}>
          {PERIODS.map((p) => (
            <Chip key={p.days} label={p.label} active={days === p.days} onPress={() => setDays(p.days)} testID={`laporan-period-${p.days}`} />
          ))}
        </View>

        {isLoading ? (
          <Spinner label="Menghitung…" />
        ) : error || !data ? (
          <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message || "Gagal memuat."} onRetry={refetch} /></View>
        ) : data.prospects === 0 && data.totals.tenants === 0 ? (
          <EmptyState art="report" title="Belum ada yang bisa dihitung" subtitle="Laporan terisi dari prospek, viewing, negosiasi, deal, dan perpanjangan yang kamu catat." />
        ) : (
          <View style={s.content}>
            {data.steps.map((st, i) => (
              <Card key={st.key} testID={`funnel-${st.key}`} style={{ gap: 6 }}>
                <View style={s.stepHead}>
                  <View style={s.stepNo}>
                    <RNText style={s.stepNoText}>{i + 1}</RNText>
                  </View>
                  <RNText style={s.stepLabel}>{st.label}</RNText>
                </View>
                <RNText style={s.percent}>{st.percent != null ? `${st.percent}%` : "–"}</RNText>
                <RNText style={s.caption}>
                  {st.of ? `${st.count} dari ${st.of} ${BASE[st.key]}` : `Belum ada ${BASE[st.key]}`}
                </RNText>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${st.percent ?? 0}%` }]} />
                </View>
              </Card>
            ))}
            <RNText style={s.note}>
              Dihitung dari yang kamu catat di SewAIn: viewing yang jadwalnya sudah lewat (tidak dibatalkan), negosiasi yang disimpan, prospek yang ditandai deal, dan kontrak yang diperpanjang.
              {data.totals.direct_deals ? ` ${data.totals.direct_deals} deal langsung tanpa negosiasi tidak masuk langkah 3.` : ""}
            </RNText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  periods: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, maxWidth: 760, width: "100%", alignSelf: "center" },
  stepHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepNoText: { color: colors.onBrandTertiary, ...fonts.bold, fontSize: 14 },
  stepLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  percent: { color: colors.onSurface, ...fonts.bold, fontSize: 34, letterSpacing: -0.8, marginTop: 4 },
  caption: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginTop: 6 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  note: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 20, marginTop: spacing.sm },
}));
