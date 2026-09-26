import React, { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Pressable, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogoMark } from "@/src/components/Logo";
import { Button, ErrorBox, Field, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";

export default function Login() {
  const { login, register, demo } = useAuth();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "form" | "demo">(null);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Isi email dan password dulu ya.");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError("Isi namamu dulu ya.");
      return;
    }
    setBusy("form");
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(e?.message || "Gagal masuk. Coba lagi.");
    } finally {
      setBusy(null);
    }
  };

  const startDemo = async () => {
    setError("");
    setBusy("demo");
    try {
      await demo();
    } catch (e: any) {
      setError(e?.message || "Gagal membuka demo. Coba lagi.");
      setBusy(null);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.logoWrap}>
          <View style={s.logoTile}>
            <LogoMark size={44} bg={s.logoTile.backgroundColor} />
          </View>
          <RNText style={s.wordmark}>Sewain</RNText>
          <RNText style={s.tagline}>AI admin buat bisnis sewa properti.</RNText>
          <RNText style={s.sub}>Unit banyak. Admin nggak harus ikut banyak.</RNText>
        </View>

        <View style={s.formCard}>
          {mode === "register" ? (
            <Field label="Nama">
              <Input
                testID="register-name-input"
                value={name}
                onChangeText={setName}
                placeholder="Nama kamu"
                autoCapitalize="words"
              />
            </Field>
          ) : null}
          <Field label="Email">
            <Input
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder="nama@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Field>
          <Field label="Password">
            <Input
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />
          </Field>
          {error ? <ErrorBox message={error} /> : null}
          <Button
            testID="login-submit-button"
            title={mode === "login" ? "Masuk" : "Daftar"}
            onPress={submit}
            loading={busy === "form"}
            size="lg"
          />
          <Pressable
            testID="login-mode-toggle"
            onPress={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            style={{ paddingVertical: spacing.sm }}
          >
            <RNText style={s.toggleText}>
              {mode === "login" ? "Belum punya akun? Daftar dulu" : "Sudah punya akun? Masuk"}
            </RNText>
          </Pressable>
        </View>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <RNText style={s.dividerText}>atau</RNText>
          <View style={s.dividerLine} />
        </View>

        <Button
          testID="demo-button"
          title="Coba Demo"
          variant="ghost"
          size="lg"
          icon="arrow-right"
          onPress={startDemo}
          loading={busy === "demo"}
          style={{ marginHorizontal: spacing.xl }}
        />
        <RNText style={s.demoNote}>
          Masuk tanpa daftar, lengkap dengan data contoh 12 unit properti.
        </RNText>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  logoWrap: { alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl, paddingHorizontal: spacing.xl },
  logoTile: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  wordmark: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 30, letterSpacing: -0.5 },
  tagline: { color: colors.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 15, textAlign: "center" },
  sub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center" },
  formCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  toggleText: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13, textAlign: "center" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg, marginHorizontal: spacing.xl },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  demoNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xxl },
}));
