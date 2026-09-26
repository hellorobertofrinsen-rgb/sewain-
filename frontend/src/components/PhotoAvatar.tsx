import React, { useState } from "react";
import { ActivityIndicator, Linking, Text as RNText, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { PressableScale } from "./ui";
import { useToast } from "./Toast";
import { api, uploadFile } from "@/src/lib/api";
import { t } from "@/src/lib/i18n";
import { cardShadow, fonts, makeStyles, spacing, useTheme } from "@/src/theme";

/**
 * A prospect's or tenant's photo on their detail page. Tap to add or change it
 * (square crop), "Hapus foto" to remove. `path` is "/leads/{id}" or "/tenants/{id}".
 */
export function PhotoAvatar({ name, photo, path, testID, refresh }: { name: string; photo?: string | null; path: string; testID: string; refresh: string[] }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const done = () => refresh.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) Linking.openSettings();
      else toast(t("Izinkan akses galeri untuk memilih foto"), "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      await uploadFile(`${path}/photo`, res.assets[0].uri, "foto.jpg");
      done();
    } catch (e: any) {
      toast(e?.message || t("Gagal unggah foto"), "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await api(`${path}/photo`, { method: "DELETE" });
      done();
    } catch (e: any) {
      toast(e?.message || t("Gagal menghapus foto"), "error");
    }
  };

  return (
    <View style={s.wrap}>
      <PressableScale onPress={pick} disabled={busy} testID={testID} accessibilityLabel={photo ? t("Ganti foto") : t("Tambah foto")} style={s.btn}>
        <Avatar name={name} photo={photo} size={72} />
        <View style={s.badge}>
          {busy ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Icon name="camera" size={13} color={colors.onBrandPrimary} />}
        </View>
      </PressableScale>
      {photo ? (
        <PressableScale onPress={remove} testID={`${testID}-remove`}>
          <RNText style={s.link}>{t("Hapus foto")}</RNText>
        </PressableScale>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { alignItems: "center", gap: spacing.xs },
  btn: { borderRadius: 40, borderWidth: 3, borderColor: colors.surfaceSecondary, ...cardShadow },
  badge: {
    position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: colors.surfaceSecondary,
  },
  link: { color: colors.error, ...fonts.medium, fontSize: 13.5, paddingVertical: 2 },
}));
