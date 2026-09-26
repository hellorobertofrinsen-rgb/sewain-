import React from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "./Icon";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

export function ScreenHeader({
  title,
  right,
  backTestID,
}: {
  title: string;
  right?: React.ReactNode;
  backTestID?: string;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 4 }]}>
      <Pressable testID={backTestID || "back-button"} onPress={() => router.back()} style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]} accessibilityLabel="Kembali">
        <Icon name="chevron-left" size={22} color={colors.onSurface} />
      </Pressable>
      <RNText style={s.title} numberOfLines={1}>{title}</RNText>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: colors.surface,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  title: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 17, flex: 1 },
}));
