import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Icon } from "./Icon";
import { useAuth } from "@/src/lib/auth";
import { photoUrl } from "@/src/lib/api";
import { radius, useTheme } from "@/src/theme";

export function UnitThumb({
  photo,
  width = "100%",
  height = 150,
  radiusSize = radius.md,
  testID,
}: {
  photo?: string | null;
  width?: number | string;
  height?: number;
  radiusSize?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { token } = useAuth();
  const src = photo ? { uri: photoUrl(photo, token) } : null;
  return (
    <View
      testID={testID}
      style={{ width: width as any, height, borderRadius: radiusSize, overflow: "hidden", backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}
    >
      {src ? (
        <Image source={src} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
      ) : (
        <Icon name="grid" size={22} color={colors.muted} />
      )}
    </View>
  );
}
