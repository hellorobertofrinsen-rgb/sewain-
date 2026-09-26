import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Linking, Text as RNText, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Sheet } from "@/src/components/Sheet";
import { Button, StatusPill, PressableScale } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { api, onPlanError } from "./api";
import { useAuth } from "./auth";
import { rupiah } from "./format";
import { upgradeMessage } from "./messages";
import { STATE_TRANSITION } from "@/src/motion";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";

// Limits, prices and the upgrade WhatsApp number all come from the backend
// (backend/plans.py) so they are configured in exactly one place.
export type PlanInfo = {
  plan: "free" | "premium" | "demo";
  label: string;
  trial?: boolean;
  trial_days_left?: number;
  trial_ended?: boolean;
  premium_until: string | null;
  limits: { max_units: number | null; max_active_leads: number | null; bulk_import: boolean; export_data: boolean };
  usage: { units: number; active_leads: number };
  hidden_units: number;
  pricing: { id: string; label: string; price: number; months: number; best?: boolean }[];
  upgrade_whatsapp: string;
  demo_expires_at?: string;
};

export type UpgradeReason = "limit_units" | "limit_leads" | "feature_bulk_import" | "feature_export" | "hidden_units" | "general";

type Ctx = {
  plan: PlanInfo | undefined;
  showUpgrade: (reason?: UpgradeReason) => void;
  refreshPlan: () => void;
};

const PlanCtx = createContext<Ctx>({ plan: undefined, showUpgrade: () => {}, refreshPlan: () => {} });

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const { data: plan } = useQuery({
    queryKey: ["plan", user?.id],
    queryFn: () => api<PlanInfo>("/plan"),
    enabled: !!user,
    staleTime: 30_000,
  });
  const refreshPlan = useCallback(() => qc.invalidateQueries({ queryKey: ["plan"] }), [qc]);
  const showUpgrade = useCallback((r: UpgradeReason = "general") => setReason(r), []);

  useEffect(() => {
    onPlanError((code) => {
      refreshPlan();
      setReason((code as UpgradeReason) || "general");
    });
    return () => onPlanError(null);
  }, [refreshPlan]);

  return (
    <PlanCtx.Provider value={{ plan, showUpgrade, refreshPlan }}>
      {children}
      <UpgradeSheet reason={reason} plan={plan} email={user?.email} onClose={() => setReason(null)} />
    </PlanCtx.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanCtx);
  const p = ctx.plan;
  const lim = p?.limits;
  return {
    ...ctx,
    isFree: p?.plan === "free",
    atUnitLimit: !!p && lim?.max_units != null && p.usage.units >= lim.max_units,
    atLeadLimit: !!p && lim?.max_active_leads != null && p.usage.active_leads >= lim.max_active_leads,
  };
}

// ------------------------------ Upgrade sheet --------------------------------

const BENEFITS: { title: string; sub: string }[] = [
  { title: "Unit tanpa batas", sub: "Semua listing di satu tempat, berapa pun jumlahnya." },
  { title: "Prospek tanpa batas", sub: "Nggak ada lead yang kelewat karena kuota." },
  { title: "Impor unit dari Excel / CSV", sub: "Pindahan data sekali jalan, nggak perlu input satu-satu." },
  { title: "Export data kapan saja", sub: "Unit, prospek, tenant, dan tagihan dalam CSV." },
];

function headline(reason: UpgradeReason, plan?: PlanInfo): { title: string; sub: string } {
  const maxUnits = plan?.limits.max_units ?? 3;
  const maxLeads = plan?.limits.max_active_leads ?? 20;
  switch (reason) {
    case "limit_units":
      return { title: `Kamu sudah punya ${maxUnits} unit`, sub: `Itu batas paket Free. Upgrade ke Premium untuk kelola semua unitmu tanpa batas.` };
    case "limit_leads":
      return { title: `${maxLeads} prospek aktif sudah penuh`, sub: "Upgrade ke Premium supaya setiap prospek baru tetap tercatat." };
    case "feature_bulk_import":
      return { title: "Impor CSV ada di Premium", sub: "Pindahkan semua unit dari Excel sekaligus." };
    case "feature_export":
      return { title: "Export data ada di Premium", sub: "Unduh semua datamu kapan saja dalam format CSV." };
    case "hidden_units":
      return {
        title: `${plan?.hidden_units ?? 0} unit sedang disembunyikan`,
        sub: `Paket Free menampilkan ${maxUnits} unit pertama. Upgrade untuk menampilkan semua unitmu lagi — datanya tetap aman.`,
      };
    default:
      return { title: "SewAIn Premium", sub: "Buat agen yang portofolionya lagi tumbuh. Semua fitur Free, tanpa batas." };
  }
}

function UpgradeSheet({ reason, plan, email, onClose }: { reason: UpgradeReason | null; plan?: PlanInfo; email?: string; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const pricing = plan?.pricing ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = pricing.find((p) => p.id === picked) ?? pricing.find((p) => p.best) ?? pricing[0];
  const monthly = pricing.find((p) => p.months === 1)?.price;
  const h = headline(reason ?? "general", plan);

  const contact = () => {
    if (!plan || !chosen) return;
    const text = upgradeMessage(chosen.label.toLowerCase(), chosen.price, email);
    Linking.openURL(`https://wa.me/${plan.upgrade_whatsapp}?text=${encodeURIComponent(text)}`);
  };

  return (
    <Sheet visible={!!reason} onClose={onClose} testID="upgrade-sheet" scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: 6 }}>
          <StatusPill label="Premium" tone="brand" testID="upgrade-pill" />
          <RNText style={s.title}>{h.title}</RNText>
          <RNText style={s.sub}>{h.sub}</RNText>
        </View>

        <View style={{ gap: spacing.md }}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={s.benefit}>
              <View style={s.check}>
                <Icon name="check" size={13} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <RNText style={s.benefitTitle}>{b.title}</RNText>
                <RNText style={s.benefitSub}>{b.sub}</RNText>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {pricing.map((p) => {
            const active = chosen?.id === p.id;
            const perMonth = Math.round(p.price / p.months);
            const saving = monthly && p.months > 1 ? Math.round((1 - p.price / (monthly * p.months)) * 100) : 0;
            return (
              <PressableScale key={p.id} testID={`price-${p.id}`} onPress={() => setPicked(p.id)} style={[STATE_TRANSITION, s.price, active && s.priceActive]}>
                {p.best ? <RNText style={s.best}>PALING HEMAT</RNText> : null}
                <RNText style={s.priceLabel}>{p.label}</RNText>
                <RNText style={s.priceValue}>{rupiah(p.price)}</RNText>
                <RNText style={s.priceSub}>
                  {p.months > 1 ? `≈ ${rupiah(perMonth)}/bulan${saving > 0 ? ` · hemat ${saving}%` : ""}` : "per bulan"}
                </RNText>
              </PressableScale>
            );
          })}
        </View>

        <Button title="Upgrade lewat WhatsApp" icon="whatsapp" size="lg" onPress={contact} testID="upgrade-whatsapp-button" />
        <RNText style={s.note}>
          Bayar lewat transfer, lalu kirim buktinya di WhatsApp. Setelah dikonfirmasi, akunmu kami aktifkan manual — biasanya kurang dari 1×24 jam. Tanpa langganan otomatis.
        </RNText>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { color: colors.onSurface, ...fonts.bold, fontSize: 26, letterSpacing: -0.4, lineHeight: 32, marginTop: spacing.xs },
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15.5, lineHeight: 21 },
  benefit: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  check: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: withAlpha(colors.success, 0.14), marginTop: 1,
  },
  benefitTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 15.5 },
  benefitSub: { color: colors.muted, ...fonts.regular, fontSize: 14, lineHeight: 18 },
  price: {
    flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: 3,
  },
  priceActive: { borderColor: colors.brandPrimary, borderWidth: 2, backgroundColor: colors.brandTertiary },
  best: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 12, letterSpacing: 0.8, marginBottom: 2 },
  priceLabel: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14.5 },
  priceValue: { color: colors.onSurface, ...fonts.bold, fontSize: 21, letterSpacing: -0.3 },
  priceSub: { color: colors.muted, ...fonts.regular, fontSize: 13, lineHeight: 16 },
  note: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 18, textAlign: "center" },
}));
