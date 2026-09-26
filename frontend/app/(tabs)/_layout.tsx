import React, { useState } from "react";
import { Tabs, router, usePathname } from "expo-router";
import { Linking, Platform, ScrollView, Text as RNText, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconName } from "@/src/components/Icon";
import { LogoFull } from "@/src/components/Logo";
import { Sheet } from "@/src/components/Sheet";
import { Drawer } from "@/src/components/Drawer";
import { MyAvatar } from "@/src/components/Avatar";
import { IconCircle, PressableScale, StatusPill, Tone } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { usePlan } from "@/src/lib/plan";
import { MenuCtx } from "@/src/lib/menu";
import { t } from "@/src/lib/i18n";
import { cardShadow, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { STATE_TRANSITION } from "@/src/motion";

const SUPPORT_WA = "6282122232421";

// Phone: four tabs around a central "+" (quick add); everything else (Laporan,
// To-do, Cetak Testimoni, Pengaturan) is in the ☰ menu on Home. Desktop: all of it
// sits in the sidebar.
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "today", label: "Home", icon: "home" },
  { name: "units", label: "Unit||tab", icon: "building" },
  { name: "leads", label: "Prospek||tab", icon: "person" },
  { name: "tenants", label: "Tenant||tab", icon: "key" },
];

// Items in the ☰ menu (and the lower part of the desktop sidebar).
const MORE: { path: string; label: string; icon: IconName; testID: string }[] = [
  { path: "/laporan", label: "Laporan", icon: "chart", testID: "laporan" },
  { path: "/todo", label: "To-do list", icon: "list-check", testID: "todo" },
  { path: "/testimoni", label: "Cetak Testimoni", icon: "image", testID: "testimoni" },
  { path: "/settings", label: "Pengaturan", icon: "sliders", testID: "settings" },
];

// ------------------------------ Quick add ---------------------------------------

const QUICK: { key: string; label: string; sub: string; icon: IconName; tone: Tone; go: string }[] = [
  { key: "lead", label: "Prospek baru", sub: "Orang yang tanya unit", icon: "person", tone: "brand", go: "/lead/new" },
  { key: "unit", label: "Unit baru", sub: "Listing yang kamu pasarkan", icon: "building", tone: "info", go: "/units?add=1" },
  { key: "tenant", label: "Tenant baru", sub: "Penyewa yang sudah tanda tangan", icon: "key", tone: "success", go: "/tenants?add=1" },
  { key: "todo", label: "To-do baru", sub: "Kendala unit atau permintaan tenant", icon: "list-check", tone: "warning", go: "/todo?add=1" },
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
    <Sheet visible={open} onClose={onClose} title={t("Tambah cepat")} testID="quick-add-sheet">
      <View style={{ gap: spacing.sm }}>
        {QUICK.map((q) => (
          <PressableScale soft key={q.key} testID={`quick-add-${q.key}`} onPress={() => pick(q)} style={s.quickRow}>
            <IconCircle icon={q.icon} tone={q.tone} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <RNText style={s.quickLabel}>{t(q.label)}</RNText>
              <RNText style={s.quickSub}>{t(q.sub)}</RNText>
            </View>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

// ------------------------------ ☰ menu (phone) -----------------------------------

function MainMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const go = (path: string) => {
    onClose();
    router.push(path as any);
  };
  return (
    <Drawer open={open} onClose={onClose} testID="main-menu">
      <ScrollView contentContainerStyle={s.menuBody} showsVerticalScrollIndicator={false}>
        <PressableScale soft testID="menu-profile" onPress={() => go("/profile")} style={s.menuProfile}>
          <MyAvatar size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={s.menuName} numberOfLines={1}>{user?.name || "-"}</RNText>
            <RNText style={s.menuSub} numberOfLines={1}>{user?.agency || t("Lihat & isi profil")}</RNText>
          </View>
          <Icon name="chevron-right" size={18} color={colors.borderStrong} />
        </PressableScale>

        <View style={s.menuList}>
          {MORE.map((m) => (
            <PressableScale soft key={m.path} testID={`menu-${m.testID}`} onPress={() => go(m.path)} style={s.menuItem}>
              <Icon name={m.icon} size={22} color={colors.onSurface} strokeWidth={1.7} />
              <RNText style={s.menuLabel}>{t(m.label)}</RNText>
            </PressableScale>
          ))}
          <PressableScale
            soft
            testID="menu-help"
            onPress={() => {
              onClose();
              Linking.openURL(`https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(t("Halo SewAIn, saya butuh bantuan. Email akun: {email}", { email: user?.email }))}`);
            }}
            style={s.menuItem}
          >
            <Icon name="whatsapp" size={22} color={colors.onSurface} strokeWidth={1.7} />
            <RNText style={s.menuLabel}>{t("Bantuan WhatsApp")}</RNText>
          </PressableScale>
        </View>

        <View style={{ flex: 1, minHeight: spacing.xl }} />
        <PressableScale
          soft
          testID="menu-logout"
          onPress={() => {
            onClose();
            logout();
          }}
          style={[s.menuItem, s.menuLogout]}
        >
          <Icon name="logout" size={22} color={colors.error} strokeWidth={1.7} />
          <RNText style={[s.menuLabel, { color: colors.error }]}>{t("Keluar")}</RNText>
        </PressableScale>
      </ScrollView>
    </Drawer>
  );
}

// ------------------------------ Phone tab bar ----------------------------------

type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

function TabBar({ state, navigation, onAdd }: BottomTabBarProps & { onAdd: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const tab = (tb: (typeof TABS)[number]) => {
    const active = current === tb.name;
    return (
      <PressableScale
        key={tb.name}
        role="tab"
        testID={`tab-${tb.name}`}
        accessibilityState={{ selected: active }}
        accessibilityLabel={t(tb.label)}
        onPress={() => navigation.navigate(tb.name as never)}
        style={s.tab}
      >
        <Icon name={tb.icon} size={25} color={active ? colors.brandPrimary : colors.muted} strokeWidth={active ? 1.9 : 1.6} />
        <RNText style={[s.tabLabel, active && s.tabLabelActive]}>{t(tb.label)}</RNText>
      </PressableScale>
    );
  };
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} testID="tab-bar">
      {TABS.slice(0, 2).map(tab)}
      <View style={s.tab}>
        <PressableScale testID="tab-add" accessibilityLabel={t("Tambah cepat")} onPress={onAdd} style={s.addBtn}>
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
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <View style={s.sidebar} testID="web-sidebar">
      <View style={s.logoBox}>
        <LogoFull size={28} />
      </View>
      <PressableScale testID="sidebar-add" onPress={onAdd} style={s.sidebarAdd}>
        <Icon name="plus" size={18} color={colors.onBrandPrimary} strokeWidth={2.4} />
        <RNText style={s.sidebarAddText}>{t("Tambah")}</RNText>
      </PressableScale>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4, paddingHorizontal: spacing.md }}>
        {TABS.map((tb) => (
          <NavItem key={tb.name} path={`/${tb.name}`} label={t(tb.label)} icon={tb.icon} testID={`nav-${tb.name}`} active={isActive(`/${tb.name}`)} />
        ))}
        <View style={s.divider} />
        {MORE.map((m) => (
          <NavItem key={m.path} path={m.path} label={t(m.label)} icon={m.icon} testID={`nav-${m.testID}`} active={isActive(m.path)} />
        ))}
      </ScrollView>
      {plan && (plan.plan === "free" || plan.trial) ? (
        <PressableScale soft testID="sidebar-upgrade" onPress={() => showUpgrade("general")} style={s.upgrade}>
          <RNText style={s.upgradeTitle}>{plan.trial ? t("Trial Premium · {n} hari lagi", { n: plan.trial_days_left }) : t("Paket Free")}</RNText>
          <RNText style={s.upgradeSub}>
            {plan.trial
              ? t("Setelah trial: 3 unit & 20 prospek aktif.")
              : t("{u}/{mu} unit · {l}/{ml} prospek aktif", { u: plan.usage.units, mu: plan.limits.max_units, l: plan.usage.active_leads, ml: plan.limits.max_active_leads })}
          </RNText>
          <RNText style={s.upgradeCta}>{t("Lihat Premium →")}</RNText>
        </PressableScale>
      ) : null}
      <PressableScale soft testID="sidebar-profile" onPress={() => router.push("/profile" as any)} style={s.userBox}>
        <MyAvatar size={40} />
        <View style={{ flex: 1, gap: 1 }}>
          <RNText numberOfLines={1} style={s.userName}>{user?.name || "-"}</RNText>
          <RNText numberOfLines={1} style={s.userEmail}>{user?.agency || user?.email || ""}</RNText>
        </View>
        {user?.is_demo ? (
          <StatusPill label={t("Demo")} tone="warning" testID="demo-badge-sidebar" />
        ) : plan?.plan === "premium" && !plan.trial ? (
          <StatusPill label={t("Premium")} tone="brand" testID="premium-badge-sidebar" />
        ) : null}
      </PressableScale>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const { colors } = useTheme();
  const tabs = (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surface } } as any}
      tabBar={(props) => (wideWeb ? null : <TabBar {...props} onAdd={() => setQuickOpen(true)} />)}
    >
      <Tabs.Screen name="today" options={{ title: t("Home") }} />
      <Tabs.Screen name="units" options={{ title: t("Unit||tab") }} />
      <Tabs.Screen name="leads" options={{ title: t("Prospek||tab") }} />
      <Tabs.Screen name="tenants" options={{ title: t("Tenant||tab") }} />
      <Tabs.Screen name="todo" options={{ title: t("To-do list") }} />
      <Tabs.Screen name="laporan" options={{ title: t("Laporan") }} />
      <Tabs.Screen name="testimoni" options={{ title: t("Cetak Testimoni") }} />
    </Tabs>
  );
  return (
    <MenuCtx.Provider value={{ openMenu: () => setMenuOpen(true) }}>
      {wideWeb ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Sidebar onAdd={() => setQuickOpen(true)} />
          <View style={{ flex: 1 }}>{tabs}</View>
        </View>
      ) : (
        tabs
      )}
      <QuickAddSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
      <MainMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </MenuCtx.Provider>
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
  menuBody: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
  menuProfile: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: colors.surface },
  menuName: { color: colors.onSurface, ...fonts.bold, fontSize: 18 },
  menuSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14 },
  menuList: { gap: 4 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, minHeight: 54, borderRadius: 16 },
  menuLabel: { color: colors.onSurface, ...fonts.medium, fontSize: 17 },
  menuLogout: { borderTopWidth: 1, borderTopColor: colors.divider, borderRadius: 0, marginTop: spacing.sm },
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
  userName: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  userEmail: { color: colors.muted, ...fonts.regular, fontSize: 12 },
}));
