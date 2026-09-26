import React, { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Linking, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogoMark } from "@/src/components/Logo";
import { Button, ErrorBox, Field, Input, PressableScale } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { cardShadow, fonts, largeTitle, makeStyles, radius, spacing } from "@/src/theme";
import { Lang, t, useLang } from "@/src/lib/i18n";

const SUPPORT_WA = "6282122232421";

export default function Login() {
  const { login, register, demo } = useAuth();
  const s = useStyles();
  const { lang, setLang } = useLang();
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
      setError(t("Isi email dan password dulu ya."));
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError(t("Isi namamu dulu ya."));
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError(t("Password minimal 8 karakter."));
      return;
    }
    setBusy("form");
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(e?.message || t("Gagal masuk. Coba lagi."));
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
      setError(e?.message || t("Gagal membuka demo. Coba lagi."));
      setBusy(null);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xxl, paddingHorizontal: spacing.lg }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.langRow} testID="login-language">
          {(["id", "en"] as Lang[]).map((l) => (
            <PressableScale key={l} onPress={() => setLang(l)} style={[s.langBtn, lang === l && s.langBtnOn]} testID={`login-lang-${l}`} accessibilityLabel={l === "en" ? "English" : "Bahasa Indonesia"}>
              <RNText style={[s.langText, lang === l && s.langTextOn]}>{l.toUpperCase()}</RNText>
            </PressableScale>
          ))}
        </View>
        <View style={s.logoWrap}>
          <LogoMark size={56} />
          <RNText style={s.wordmark}>{t("SewAIn")}</RNText>
          <RNText style={s.tagline}>{t("Prospek, unit, dan tenant di satu tempat.")}</RNText>
          <RNText style={s.sub}>{t("Balas lebih cepat, prospek nggak ada yang hilang, tenant betah perpanjang.")}</RNText>
        </View>

        <View style={s.formCard}>
          {mode === "register" ? (
            <Field label={t("Nama")}>
              <Input
                testID="register-name-input"
                value={name}
                onChangeText={setName}
                placeholder={t("Nama kamu")}
                autoCapitalize="words"
                autoComplete="name"
                enterKeyHint="next"
              />
            </Field>
          ) : null}
          <Field label={t("Email")}>
            <Input
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder={t("nama@email.com")}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              enterKeyHint="next"
            />
          </Field>
          <Field label={t("Password")} hint={mode === "register" ? t("Minimal 8 karakter.") : undefined}>
            <Input
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              enterKeyHint="go"
              onSubmitEditing={submit}
            />
          </Field>
          {error ? <ErrorBox message={error} /> : null}
          {mode === "register" ? <RNText style={s.trial}>{t("Gratis Premium 14 hari. Tanpa kartu kredit.")}</RNText> : null}
          <Button
            testID="login-submit-button"
            title={mode === "login" ? t("Masuk") : t("Daftar")}
            onPress={submit}
            loading={busy === "form"}
            size="lg"
          />
          <PressableScale
            testID="login-mode-toggle"
            onPress={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            style={{ paddingVertical: spacing.sm }}
          >
            <RNText style={s.toggleText}>
              {mode === "login" ? t("Belum punya akun? Daftar gratis") : t("Sudah punya akun? Masuk")}
            </RNText>
          </PressableScale>
          {mode === "login" ? (
            <PressableScale
              testID="forgot-password"
              role="link"
              onPress={() =>
                Linking.openURL(
                  `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(`Halo SewAIn, saya lupa password. Email akun saya: ${email.trim() || "..."}`)}`,
                )
              }
              style={{ paddingVertical: 4 }}
            >
              <RNText style={s.forgot}>{t("Lupa password?")}</RNText>
            </PressableScale>
          ) : null}
        </View>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <RNText style={s.dividerText}>{t("atau")}</RNText>
          <View style={s.dividerLine} />
        </View>

        <Button
          testID="demo-button"
          title={t("Coba Demo")}
          variant="ghost"
          size="lg"
          icon="arrow-right"
          onPress={startDemo}
          loading={busy === "demo"}
          style={{ maxWidth: 440, alignSelf: "center", width: "100%" }}
        />
        <RNText style={s.demoNote}>
          Masuk tanpa daftar, lengkap dengan data contoh 12 unit. Akun demo dihapus otomatis setelah 7 hari.
        </RNText>
        <View style={s.legal}>
          <PressableScale role="link" onPress={() => router.push("/privasi" as any)} testID="link-privacy">
            <RNText style={s.legalLink}>{t("Kebijakan Privasi")}</RNText>
          </PressableScale>
          <RNText style={s.legalDot}>·</RNText>
          <PressableScale role="link" onPress={() => router.push("/ketentuan" as any)} testID="link-terms">
            <RNText style={s.legalLink}>{t("Ketentuan Layanan")}</RNText>
          </PressableScale>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  langRow: { flexDirection: "row", alignSelf: "flex-end", gap: 2, padding: 3, borderRadius: 999, backgroundColor: colors.surfaceTertiary, marginTop: -spacing.xl, marginBottom: spacing.md },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  langBtnOn: { backgroundColor: colors.surfaceSecondary, ...cardShadow },
  langText: { color: colors.muted, ...fonts.semibold, fontSize: 13 },
  langTextOn: { color: colors.onSurface },
  root: { flex: 1, backgroundColor: colors.surface },
  logoWrap: { alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  wordmark: { ...largeTitle, color: colors.onSurface, marginTop: spacing.sm },
  tagline: { color: colors.onSurface, ...fonts.semibold, fontSize: 17, textAlign: "center" },
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 360 },
  formCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    ...cardShadow,
  },
  trial: { color: colors.success, ...fonts.semibold, fontSize: 14.5, textAlign: "center" },
  toggleText: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 15, textAlign: "center" },
  forgot: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14.5, textAlign: "center" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg, maxWidth: 440, alignSelf: "center", width: "100%" },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, ...fonts.regular, fontSize: 14 },
  demoNote: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.md, maxWidth: 440, alignSelf: "center" },
  legal: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: spacing.xl },
  legalLink: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14, textDecorationLine: "underline" },
  legalDot: { color: colors.muted, fontSize: 14 },
}));
