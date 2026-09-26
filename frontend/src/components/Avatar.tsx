import React from "react";
import { Text as RNText, View } from "react-native";
import { Image } from "expo-image";
import { useAuth } from "@/src/lib/auth";
import { photoUrl } from "@/src/lib/api";
import { fonts, useTheme } from "@/src/theme";

/** Round photo, or the first letter of the name on a soft blue circle. */
export function Avatar({ name, photo, size = 40, testID }: { name?: string | null; photo?: string | null; size?: number; testID?: string }) {
  const { colors } = useTheme();
  const { token } = useAuth();
  const src = photo ? { uri: photoUrl(photo, token) } : null;
  return (
    <View
      testID={testID}
      style={{
        width: size, height: size, borderRadius: size / 2, overflow: "hidden",
        backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
      }}
    >
      {src ? (
        <Image source={src} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : (
        <RNText style={{ color: colors.onBrandTertiary, ...fonts.bold, fontSize: Math.round(size * 0.42) }}>
          {(name || "?").trim().charAt(0).toUpperCase()}
        </RNText>
      )}
    </View>
  );
}

/** The signed-in agent's avatar. */
export function MyAvatar({ size = 40, testID }: { size?: number; testID?: string }) {
  const { user } = useAuth();
  return <Avatar name={user?.name} photo={user?.photo} size={size} testID={testID} />;
}
