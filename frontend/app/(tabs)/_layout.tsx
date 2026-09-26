import React, { useState } from "react";
import { Tabs, router, usePathname } from "expo-router";
import { Platform, Text as RNText, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconName } from "@/src/components/Icon";
import { LogoFull } from "@/src/components/Logo";
import { Sheet } from "@/src/components/Sheet";
import { IconCircle, PressableScale, StatusPill, Tone } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { usePlan } from "@/src/lib/plan";
import { cardShadow, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { STATE_TRANSITION } from "@/src/motion";

// Phone: four tabs around a central "+" (adding a prospect is the most frequent
// action and speed of reply is what wins tenants). Masalah and Laporan are one tap
// away from Hari Ini; on desktop everything sits in the sidebar.
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "today", label: "Hari Ini", icon: "home" },
  { name: "leads", label: "Prospek", icon: "users" },
  { name: "units", label: "Unit", icon: "building" },
  { name: "tenants", label: "Tenant", icon: "key" },
];

const SIDEBAR: { path: string; label: string; icon: IconName }[] = [
  { path: "/today", label: "Hari Ini", icon: "home" },
  { path: "/leads", label: "Prospek", icon: "users" },
  { path: "/units", label: "Unit", icon: "building" },
  { path: "/tenants", label: "Tenant", icon: "key" },
  { path: "/maintenance", label: "Masalah", icon: "wrench" },
  { path: "/laporan", label: "Laporan", icon: "chart" },
];

// ------------------------------ Quick add ---------------------------------------

const QUICK: { key: string; label: string; sub: string; icon: IconName; tone: Tone; go: string }[] = [
  { key: "lead", label: "Prospek baru", sub: "Orang yang tanya unit", icon: "users", tone: "brand", go: "/lead/new" },
  { key: "unit", label: "Unit baru", sub: "Listing yang kamu pasarkan", icon: "building", tone: "info", go: "/units?add=1" },
  { key: "tenant", label: "Tenant baru", sub: "Penyewa yang sudah tanda tangan", icon: "key", tone: "success", go: "/tenants?add=1" },
  { key: "issue", label: "Lapor masalah", sub: "Komplain atau kerusakan unit", icon: "wrench", tone: "warning", go: "/maintenance?report=1" },
];

function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStyles();
  const { atLeadLimit, atUnitLimit, showUpgrade } = usePlan();
  const pick = (q: (typeof QUICK)[number]) => {
    onClose();
    if (q.key === "lead" && atLeadLimit) return showUpgrade("limit_leads");
    if (q.key === "unit" && atUnitLimit) return showUpgrade("limit_units");
    router.push(q.go as any);
  };
  return (
    <Sheet visible={open} onClose={onClose} title="Tambah cepat" testID="quick-add-sheet">
      <View style={{ gap: spacing.sm }}>
        {QUICK.map((q) => (
          <PressableScale soft key={q.key} testID={`quick-add-${q.key}`} onPress={() => pick(q)} style={s.quickRow}>
            <IconCircle icon={q.icon} tone={q.tone} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <RNText style={s.quickLabel}>{q.label}</RNText>
              <RNText style={s.quickSub}>{q.sub}</RNText>
            </View>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

// ------------------------------ Phone tab bar ----------------------------------

type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

function TabBar({ state, navigation, onAdd }: BottomTabBarProps & { onAdd: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const tab = (t: (typeof TABS)[number]) => {
    const active = current === t.name;
    return (
      <PressableScale
        key={t.name}
        role="tab"
        testID={`tab-${t.name}`}
        accessibilityState={{ selected: active }}
        accessibilityLabel={t.label}
        onPress={() => navigation.navigate(t.name as never)}
        style={s.tab}
      >
        <Icon name={t.icon} size={24} color={active ? colors.brandPrimary : colors.muted} strokeWidth={active ? 2.2 : 1.9} />
        <RNText style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</RNText>
      </PressableScale>
    );
  };
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} testID="tab-bar">
      {TABS.slice(0, 2).map(tab)}
      <View style={s.tab}>
        <PressableScale testID="tab-add" accessibilityLabel="Tambah cepat" onPress={onAdd} style={s.addBtn}>
          <Icon name="plus" size={26} color={colors.onBrandPrimary} strokeWidth={2.4} />
        </PressableScale>
      </View>
      {TABS.slice(2).map(tab)}
    </View>
  );
}

// ------------------------------ Desktop sidebar --------------------------------

function Sidebar({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { plan, showUpgrade } = usePlan();
  const { colors } = useTheme();
  const s = useStyles();
  const initial = (user?.name || "S").charAt(0).toUpperCase();
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <View style={s.sidebar} testID="web-sidebar">
      <View style={s.logoBox}>
        <LogoFull size={26} />
      </View>
      <PressableScale testID="sidebar-add" onPress={onAdd} style={s.sidebarAdd}>
        <Icon name="plus" size={18} color={colors.onBrandPrimary} strokeWidth={2.4} />
        <RNText style={s.sidebarAddText}>Tambah</RNText>
      </PressableScale>
      <View style={{ gap: 4, paddingHorizontal: spacing.md }}>
        {SIDEBAR.map((t) => (
          <NavItem key={t.path} path={t.path} label={t.label} icon={t.icon} testID={`nav-${t.path.slice(1)}`} active={isActive(t.path)} />
        ))}
        <View style={s.divider} />
        <NavItem path="/settings" label="Pengaturan" icon="sliders" testID="nav-settings" active={isActive("/settings")} />
      </View>
      <View style={{ flex: 1 }} />
      {plan && (plan.plan === "free" || plan.trial) ? (
        <PressableScale soft testID="sidebar-upgrade" onPress={() => showUpgrade("general")} style={s.upgrade}>
          <RNText style={s.upgradeTitle}>{plan.trial ? `Trial Premium · ${plan.trial_days_left} hari lagi` : "Paket Free"}</RNText>
          <RNText style={s.upgradeSub}>
            {plan.trial
              ? "Setelah trial: 3 unit & 20 prospek aktif."
              : `${plan.usage.units}/${plan.limits.max_units} unit · ${plan.usage.active_leads}/${plan.limits.max_active_leads} prospek aktif`}
          </RNText>
          <RNText style={s.upgradeCta}>Lihat Premium →</RNText>
        </PressableScale>
      ) : null}
      <View style={s.userBox}>
        <View style={s.avatar}>
          <RNText style={s.avatarText}>{initial}</RNText>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <RNText numberOfLines={1} style={s.userName}>{user?.name || "-"}</RNText>
          <RNText numberOfLines={1} style={s.userEmail}>{user?.email || ""}</RNText>
        </View>
        {user?.is_demo ? (
          <StatusPill label="Demo" tone="warning" testID="demo-badge-sidebar" />
        ) : plan?.plan === "premium" && !plan.trial ? (
          <StatusPill label="Premium" tone="brand" testID="premium-badge-sidebar" />
        ) : null}
      </View>
    </View>
  );
}

// Hover only exists for a mouse (RN Web fires onHoverIn for mouse pointers only),
// so touch devices never get a stuck hover state.
function NavItem({ path, label, icon, active, testID }: { path: string; label: string; icon: IconName; active: boolean; testID: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  const [hovered, setHovered] = React.useState(false);
  return (
    <PressableScale
      testID={testID}
      role="link"
      onPress={() => router.push(path as any)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[STATE_TRANSITION, s.navItem, hovered && !active && s.navItemHover, active && s.navItemActive]}
    >
      <Icon name={icon} size={20} color={active ? colors.brandPrimary : colors.onSurfaceSecondary} />
      <RNText style={[s.navLabel, active && s.navLabelActive]}>{label}</RNText>
    </PressableScale>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const wideWeb = Platform.OS === "web" && width >= 1024;
  const [quickOpen, setQuickOpen] = useState(false);
  const { colors } = useTheme();
  const tabs = (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surface } } as any}
      tabBar={(props) => (wideWeb ? null : <TabBar {...props} onAdd={() => setQuickOpen(true)} />)}
    >
      <Tabs.Screen name="today" options={{ title: "Hari Ini" }} />
      <Tabs.Screen name="leads" options={{ title: "Prospek" }} />
      <Tabs.Screen name="units" options={{ title: "Unit" }} />
      <Tabs.Screen name="tenants" options={{ title: "Tenant" }} />
      <Tabs.Screen name="maintenance" options={{ title: "Masalah" }} />
      <Tabs.Screen name="laporan" options={{ title: "Laporan" }} />
    </Tabs>
  );
  return (
    <>
      {wideWeb ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Sidebar onAdd={() => setQuickOpen(true)} />
          <View style={{ flex: 1 }}>{tabs}</View>
        </View>
      ) : (
        tabs
      )}
      <QuickAddSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 50 },
  tabLabel: { color: colors.muted, ...fonts.medium, fontSize: 11.5 },
  tabLabelActive: { color: colors.brandPrimary, ...fonts.semibold },
  addBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    borderWidth: 4,
    borderColor: colors.surfaceSecondary,
    ...cardShadow,
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  quickLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  quickSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14 },
  sidebar: {
    width: 264,
    backgroundColor: colors.surfaceSecondary,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  logoBox: { paddingHorizontal: spacing.lg + 4, marginBottom: spacing.lg },
  sidebarAdd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  sidebarAddText: { color: colors.onBrandPrimary, ...fonts.semibold, fontSize: 15 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: 14,
    minHeight: 46,
  },
  navItemActive: { backgroundColor: colors.brandTertiary },
  navItemHover: { backgroundColor: colors.surface },
  navLabel: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 15 },
  navLabelActive: { color: colors.onBrandTertiary, ...fonts.semibold },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md, marginHorizontal: spacing.sm },
  upgrade: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.brandTertiary,
    gap: 3,
  },
  upgradeTitle: { color: colors.onBrandTertiary, ...fonts.semibold, fontSize: 14 },
  upgradeSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 13, lineHeight: 18 },
  upgradeCta: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 13, marginTop: 4 },
  userBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    borderRadius: 16,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandPrimary, ...fonts.semibold, fontSize: 16 },
  userName: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  userEmail: { color: colors.muted, ...fonts.regular, fontSize: 12 },
}));
