import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LogoMark } from "@/src/components/Logo";
import { Button, Card, ErrorBox, Field, Input } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { Session, useAuth } from "@/src/lib/auth";
import { fonts, largeTitle, makeStyles, spacing } from "@/src/theme";

/** Opened from the one-time link the owner sends over WhatsApp (/reset?token=…). */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { applySession } = useAuth();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (pw.length < 8) return setError("Password minimal 8 karakter.");
    if (pw !== pw2) return setError("Kedua password belum sama.");
    setBusy(true);
    try {
      const res = await api<Session>("/auth/reset-password", { method: "POST", body: { token, new_password: pw } });
      await applySession(res);
    } catch (e: any) {
      setError(e?.message || "Gagal. Coba lagi.");
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + spacing.xxxl }]} keyboardShouldPersistTaps="handled" testID="reset-screen">
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <LogoMark size={52} />
          <RNText style={s.title}>Buat password baru</RNText>
          <RNText style={s.sub}>Link ini hanya bisa dipakai sekali dan berlaku 24 jam.</RNText>
        </View>
        <Card style={{ gap: spacing.md }}>
          {!token ? (
            <ErrorBox message="Link tidak lengkap. Minta link baru lewat WhatsApp." />
          ) : (
            <>
              <Field label="Password baru" hint="Minimal 8 karakter.">
                <Input testID="reset-password-input" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
              </Field>
              <Field label="Ulangi password">
                <Input testID="reset-password2-input" value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
              </Field>
              {error ? <ErrorBox message={error} /> : null}
              <Button title="Simpan & Masuk" size="lg" onPress={submit} loading={busy} testID="reset-submit" />
            </>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.xl, maxWidth: 480, width: "100%", alignSelf: "center" },
  title: { ...largeTitle, fontSize: 28, lineHeight: 34, color: colors.onSurface, textAlign: "center", marginTop: spacing.sm },
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, textAlign: "center" },
}));
