import React, { useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { TabHeader } from "@/src/components/TabHeader";
import { Icon, IconName } from "@/src/components/Icon";
import { Card, Chip, EmptyState, ErrorBox, IconCircle, ListGroup, ListRow, PressableScale, Spinner, Tone } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { ownerReportMessage, waLink } from "@/src/lib/messages";
import { rupiah, rupiahShort } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

// The three numbers Sewain is judged by — how fast prospects get a reply, how many
// are lost, and how many tenants renew — plus money and a per-owner breakdown.

type Stats = {
  days: number;
  speed: { median_minutes: number | null; within_hour: number; responded: number; waiting: number; oldest_wait_hours: number | null };
  leads: {
    new: number; deals: number; lost: number; conversion: number | null; cold_count: number;
    cold: { id: string; name: string; days: number; status: string }[];
    lost_reasons: { reason: string; count: number }[];
  };
  retention: { extended: number; moved_out: number; rate: number | null; active_tenants: number; ending_soon: number };
  money: { collected: number; overdue: number; commission: number };
  occupancy: number | null;
  owners: { name: string; phone?: string | null; units: number; terisi: number; kosong: number; paid: number; overdue: number }[];
};

const PERIODS = [7, 30, 90];

function duration(m: number | null) {
  if (m == null) return "–";
  if (m < 60) return `${m} mnt`;
  if (m < 60 * 24) return `${Math.round(m / 60)} jam`;
  return `${Math.round(m / 60 / 24)} hari`;
}

export default function LaporanScreen() {
  const s = useStyles();
  const [days, setDays] = useState(30);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stats", days],
    queryFn: () => api<Stats>(`/stats?days=${days}`),
  });

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false} testID="laporan-screen">
        <TabHeader title="Laporan" sub={`${days} hari terakhir`} />
        <View style={s.periods}>
          {PERIODS.map((d) => (
            <Chip key={d} label={`${d} hari`} active={days === d} onPress={() => setDays(d)} testID={`laporan-period-${d}`} />
          ))}
        </View>

        {isLoading ? (
          <Spinner label="Menghitung…" />
        ) : error || !data ? (
          <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message || "Gagal memuat."} onRetry={refetch} /></View>
        ) : data.leads.new === 0 && data.retention.active_tenants === 0 && data.owners.length === 0 ? (
          <EmptyState art="report" title="Belum ada yang bisa dihitung" subtitle="Laporan terisi sendiri begitu kamu mencatat prospek, unit, dan tenant." />
        ) : (
          <View style={s.content}>
            {/* 1. Speed */}
            <Metric
              testID="metric-speed"
              icon="zap"
              tone="brand"
              label="Kecepatan balas"
              value={duration(data.speed.median_minutes)}
              caption={
                data.speed.responded
                  ? `Waktu tengah dari prospek masuk sampai kamu balas. ${data.speed.within_hour} dari ${data.speed.responded} dibalas < 1 jam.`
                  : "Belum ada prospek baru yang dibalas di periode ini."
              }
            >
              {data.speed.waiting > 0 ? (
                <Alert
                  testID="speed-waiting"
                  text={`${data.speed.waiting} prospek belum dibalas${data.speed.oldest_wait_hours != null ? ` · terlama ${duration(Math.round(data.speed.oldest_wait_hours * 60))}` : ""}`}
                  onPress={() => router.push("/leads" as any)}
                />
              ) : null}
            </Metric>

            {/* 2. Lost leads */}
            <Metric
              testID="metric-lost"
              icon="users"
              tone="warning"
              label="Prospek hilang"
              value={`${data.leads.lost}`}
              caption={`${data.leads.deals} deal, ${data.leads.lost} tidak jadi${data.leads.conversion != null ? ` · ${data.leads.conversion}% jadi deal` : ""}. ${data.leads.cold_count} prospek aktif sudah > 7 hari tanpa kabar.`}
            >
              {data.leads.cold.slice(0, 5).map((c) => (
                <Alert key={c.id} testID={`cold-${c.id}`} text={`${c.name} · ${c.days} hari tanpa kabar`} cta="Hubungi" onPress={() => router.push(`/lead/${c.id}` as any)} />
              ))}
              {data.leads.lost_reasons.length ? (
                <View style={{ gap: 8, marginTop: spacing.sm }}>
                  <RNText style={s.subhead}>Alasan tidak jadi</RNText>
                  {data.leads.lost_reasons.map((r) => (
                    <Bar key={r.reason} label={r.reason} value={r.count} max={data.leads.lost_reasons[0].count} />
                  ))}
                </View>
              ) : null}
            </Metric>

            {/* 3. Retention */}
            <Metric
              testID="metric-retention"
              icon="refresh"
              tone="success"
              label="Retensi tenant"
              value={data.retention.rate != null ? `${data.retention.rate}%` : "–"}
              caption={`${data.retention.extended} kontrak diperpanjang, ${data.retention.moved_out} pindah keluar. ${data.retention.ending_soon} kontrak habis dalam 60 hari.`}
            >
              {data.retention.ending_soon > 0 ? (
                <Alert testID="retention-ending" text={`Kabari ${data.retention.ending_soon} tenant soal perpanjangan`} onPress={() => router.push("/tenants" as any)} />
              ) : null}
            </Metric>

            <ListGroup title="Uang" testID="laporan-money">
              <ListRow label="Sewa masuk" value={rupiah(data.money.collected)} icon="wallet" tone="success" />
              <ListRow label="Belum masuk (lewat tempo)" value={rupiah(data.money.overdue)} icon="alert" tone="error" />
              <ListRow label="Komisi kamu" value={rupiah(data.money.commission)} icon="trending-up" tone="brand" />
              <ListRow label="Unit terisi" value={data.occupancy != null ? `${data.occupancy}%` : "–"} icon="building" tone="info" />
            </ListGroup>

            {data.owners.length ? (
              <ListGroup title="Per pemilik" footer="Ketuk untuk kirim ringkasan ke pemilik lewat WhatsApp." testID="laporan-owners">
                {data.owners.map((o) => {
                  const wa = waLink(o.phone, ownerReportMessage(o, data.days));
                  return (
                    <ListRow
                      key={o.name}
                      testID={`owner-${o.name}`}
                      label={o.name}
                      sub={`${o.units} unit · ${o.terisi} terisi · ${o.kosong} kosong${o.overdue ? ` · nunggak ${rupiahShort(o.overdue)}` : ""}`}
                      value={rupiahShort(o.paid)}
                      icon="user"
                      tone="neutral"
                      onPress={wa ? () => Linking.openURL(wa) : undefined}
                    />
                  );
                })}
              </ListGroup>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ icon, tone, label, value, caption, children, testID }: { icon: IconName; tone: Tone; label: string; value: string; caption: string; children?: React.ReactNode; testID?: string }) {
  const s = useStyles();
  return (
    <Card testID={testID} style={{ gap: spacing.sm }}>
      <View style={s.metricHead}>
        <IconCircle icon={icon} tone={tone} size={40} />
        <RNText style={s.metricLabel}>{label}</RNText>
      </View>
      <RNText style={s.metricValue}>{value}</RNText>
      <RNText style={s.caption}>{caption}</RNText>
      {children}
    </Card>
  );
}

function Alert({ text, cta = "Lihat", onPress, testID }: { text: string; cta?: string; onPress: () => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale soft testID={testID} onPress={onPress} style={s.alert}>
      <RNText style={s.alertText} numberOfLines={2}>{text}</RNText>
      <RNText style={s.alertCta}>{cta}</RNText>
      <Icon name="chevron-right" size={16} color={colors.brandPrimary} />
    </PressableScale>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const s = useStyles();
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <RNText style={s.barLabel}>{label}</RNText>
        <RNText style={s.barValue}>{value}</RNText>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.max(8, (value / Math.max(max, 1)) * 100)}%` }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  periods: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg, maxWidth: 760, width: "100%", alignSelf: "center" },
  metricHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  metricLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  metricValue: { color: colors.onSurface, ...fonts.bold, fontSize: 34, letterSpacing: -0.8, marginTop: 4 },
  caption: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22 },
  subhead: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandTertiary,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: 4,
  },
  alertText: { color: colors.onSurface, ...fonts.medium, fontSize: 15, flex: 1 },
  alertCta: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 14 },
  barLabel: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14 },
  barValue: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.brandSecondary },
}));
