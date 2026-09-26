import React from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Tabs, router, usePathname } from "expo-router";
import { Platform, Pressable, Text as RNText, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usesNativeTabs } from "@/src/navigation";
import { Icon, IconName } from "@/src/components/Icon";
import { LogoFull } from "@/src/components/Logo";
import { StatusPill } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { usePlan } from "@/src/lib/plan";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TABS: { name: string; label: string; icon: IconName; sf: string }[] = [
  { name: "today", label: "Hari Ini", icon: "home", sf: "house.fill" },
  { name: "units", label: "Unit", icon: "grid", sf: "square.grid.2x2.fill" },
  { name: "leads", label: "Calon", icon: "users", sf: "person.2.fill" },
  { name: "tenants", label: "Tenant", icon: "user-check", sf: "person.crop.circle.fill" },
  { name: "maintenance", label: "Masalah", icon: "wrench", sf: "wrench.and.screwdriver.fill" },
];

const SECONDARY: { path: string; label: string; icon: IconName }[] = [
  { path: "/settings", label: "Pengaturan", icon: "sliders" },
];

function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { plan, showUpgrade } = usePlan();
  const { colors } = useTheme();
  const s = useStyles();

  const item = (path: string, label: string, icon: IconName, key: string) => {
    const active = pathname === path || pathname.startsWith(path + "/");
    return (
      <Pressable
        key={key}
        testID={`nav-${key}`}
        onPress={() => router.push(path as any)}
        style={({ pressed }) => [s.navItem, active && s.navItemActive, pressed && { opacity: 0.7 }]}
      >
        <Icon name={icon} size={18} color={active ? colors.onSurface : colors.muted} />
        <RNText style={[s.navLabel, active && s.navLabelActive]}>{label}</RNText>
      </Pressable>
    );
  };

  const initial = (user?.name || "S").charAt(0).toUpperCase();

  return (
    <View style={s.sidebar} testID="web-sidebar">
      <View style={s.logoBox}>
        <LogoFull size={24} bg={colors.surfaceSecondary} />
      </View>
      <View style={{ gap: 2, paddingHorizontal: spacing.sm }}>
        {TABS.map((t) => item("/" + t.name, t.label, t.icon, t.name))}
        <View style={s.divider} />
        {SECONDARY.map((t) => item(t.path, t.label, t.icon, t.path.slice(1)))}
      </View>
      <View style={{ flex: 1 }} />
      {plan?.plan === "free" ? (
        <Pressable testID="sidebar-upgrade" onPress={() => showUpgrade("general")} style={({ pressed }) => [s.upgrade, pressed && { opacity: 0.8 }]}>
          <RNText style={s.upgradeTitle}>Paket Free</RNText>
          <RNText style={s.upgradeSub}>
            {plan.usage.units}/{plan.limits.max_units} unit · {plan.usage.active_leads}/{plan.limits.max_active_leads} calon aktif
          </RNText>
          <RNText style={s.upgradeCta}>Upgrade ke Premium →</RNText>
        </Pressable>
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
        ) : plan?.plan === "premium" ? (
          <StatusPill label="Premium" tone="brand" testID="premium-badge-sidebar" />
        ) : null}
      </View>
    </View>
  );
}

function TabsNav({ hideBar }: { hideBar: boolean }) {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs
        backgroundColor={undefined}
        tintColor={colors.onSurface}
        badgeBackgroundColor={colors.brandPrimary}
      >
        {TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name as any}>
            <NativeTabs.Trigger.Icon sf={t.sf as any} />
            <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.muted,
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          ...(Platform.OS === "web" ? { height: 64, display: hideBar ? "none" as any : "flex" as any } : {}),
        },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name as any}
          options={{
            title: t.label,
            tabBarIcon: ({ color, size }) => <Icon name={t.icon} size={size ?? 22} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const wideWeb = Platform.OS === "web" && width >= 1024;
  if (wideWeb) {
    return (
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <TabsNav hideBar />
        </View>
      </View>
    );
  }
  return <TabsNav hideBar={false} />;
}

const useStyles = makeStyles((colors) => ({
  sidebar: {
    width: 250,
    backgroundColor: colors.surfaceSecondary,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  logoBox: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.sm,
    minHeight: 44,
  },
  navItemActive: { backgroundColor: colors.surfaceTertiary },
  navLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14 },
  navLabelActive: { color: colors.onSurface, fontFamily: fonts.semibold },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md, marginHorizontal: spacing.sm },
  upgrade: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  upgradeTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 13 },
  upgradeSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5 },
  upgradeCta: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 12, marginTop: 4 },
  userBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 15 },
  userName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 13 },
  userEmail: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
}));
