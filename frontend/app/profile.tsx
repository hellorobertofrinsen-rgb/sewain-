import React, { useState } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { MyAvatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button, Card, Chip, Field, Input, PressableScale } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, uploadFile } from "@/src/lib/api";
import { User, useAuth } from "@/src/lib/auth";
import { phoneOk } from "@/src/components/LeadForm";
import { t } from "@/src/lib/i18n";
import { cardShadow, fonts, makeStyles, spacing, useTheme } from "@/src/theme";

// Who the agent is: shown on invoices (bank accounts) and testimonials (name,
// agency, phone). Name and phone are required. Agency, domicile and photo are
// optional. A bank account is optional too, but once started it must be complete.

const BANKS = ["BCA", "Mandiri", "BRI", "BNI", "BSI", "CIMB Niaga", "Permata", "Jago", "SeaBank"];

type Form = {
  name: string; phone: string; agency: string; domicile: string;
  bank_name: string; bank_account: string; bank_holder: string;
  office_bank_name: string; office_bank_account: string; office_bank_holder: string;
};

const FIELDS: (keyof Form)[] = ["name", "phone", "agency", "domicile", "bank_name", "bank_account", "bank_holder",
  "office_bank_name", "office_bank_account", "office_bank_holder"];

function fromUser(u: User | null): Form {
  const f = {} as Form;
  for (const k of FIELDS) f[k] = ((u as any)?.[k] as string) || "";
  return f;
}

export default function ProfileScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const { user, setUserProfile } = useAuth();
  const [f, setF] = useState<Form>(() => fromUser(user));
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof Form) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const LABELS: Record<keyof Form, string> = {
    name: t("Nama lengkap"), phone: t("Nomor telepon"), agency: t("Nama agensi"), domicile: t("Domisili"),
    bank_name: t("Bank pribadi"), bank_account: t("Rekening pribadi"), bank_holder: t("Atas nama (pribadi)"),
    office_bank_name: t("Bank kantor"), office_bank_account: t("Rekening kantor"), office_bank_holder: t("Atas nama (kantor)"),
  };
  const PERSONAL: (keyof Form)[] = ["bank_name", "bank_account", "bank_holder"];
  const OFFICE: (keyof Form)[] = ["office_bank_name", "office_bank_account", "office_bank_holder"];
  const started = (keys: (keyof Form)[]) => keys.some((k) => f[k].trim());
  const required: (keyof Form)[] = ["name", "phone", ...(started(PERSONAL) ? PERSONAL : []), ...(started(OFFICE) ? OFFICE : [])];
  const missing = required.filter((k) => (k === "phone" ? !phoneOk(f.phone) : !f[k].trim())).map((k) => LABELS[k]);

  const save = useMutation({
    mutationFn: () => api<User>("/me", { method: "PATCH", body: f }),
    onSuccess: async (u) => {
      await setUserProfile({ ...user!, ...u });
      toast(t("Profil tersimpan"));
    },
    onError: (e: any) => toast(e?.message || t("Gagal menyimpan"), "error"),
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) Linking.openSettings();
      else toast(t("Izinkan akses galeri untuk memilih foto"), "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    setUploading(true);
    try {
      const u = await uploadFile("/me/photo", res.assets[0].uri, "profil.jpg");
      await setUserProfile({ ...user!, ...u });
      toast(t("Foto profil diganti"));
    } catch (e: any) {
      toast(e?.message || t("Gagal unggah foto"), "error");
    } finally {
      setUploading(false);
    }
  };
  const removePhoto = async () => {
    try {
      const u = await api<User>("/me/photo", { method: "DELETE" });
      await setUserProfile({ ...user!, ...u });
    } catch (e: any) {
      toast(e?.message || t("Gagal menghapus foto"), "error");
    }
  };

  const bankPicker = (key: "bank_name" | "office_bank_name", prefix: string) => (
    <View style={s.chips}>
      {BANKS.map((b) => (
        <Chip key={b} label={b} active={f[key] === b} onPress={() => set(key)(f[key] === b ? "" : b)} testID={`${prefix}-${b}`} />
      ))}
    </View>
  );

  return (
    <View style={s.root}>
      <ScreenHeader title={t("Profil")} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled" testID="profile-screen">
        <View style={s.photoBox}>
          <PressableScale onPress={pickPhoto} disabled={uploading} testID="profile-photo-button" accessibilityLabel={t("Ganti foto profil")} style={s.photoBtn}>
            <MyAvatar size={104} />
            <View style={s.camera}>
              <Icon name="camera" size={16} color={colors.onBrandPrimary} />
            </View>
          </PressableScale>
          {user?.photo ? (
            <PressableScale onPress={removePhoto} testID="profile-photo-remove">
              <RNText style={s.photoLink}>{t("Hapus foto")}</RNText>
            </PressableScale>
          ) : (
            <RNText style={s.photoHint}>{t("Foto opsional")}</RNText>
          )}
        </View>

        <Card style={s.card}>
          <RNText style={s.cardTitle}>{t("Data diri")}</RNText>
          <Field label={t("Nama lengkap")}>
            <Input testID="profile-name" value={f.name} onChangeText={set("name")} autoCapitalize="words" autoComplete="name" />
          </Field>
          <Field label={t("Nomor telepon")}>
            <Input testID="profile-phone" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="0812…" autoComplete="tel" />
          </Field>
          <Field label={t("Email")} hint={t("Email untuk masuk. Tidak bisa diubah di sini.")}>
            <Input testID="profile-email" value={user?.email || ""} editable={false} style={s.readonly} />
          </Field>
          <Field label={t("Nama agensi (opsional)")}>
            <Input testID="profile-agency" value={f.agency} onChangeText={set("agency")} placeholder={t("mis. Frinsen Realty")} />
          </Field>
          <Field label={t("Domisili (opsional)")}>
            <Input testID="profile-domicile" value={f.domicile} onChangeText={set("domicile")} placeholder={t("mis. Jakarta Utara")} />
          </Field>
        </Card>

        <Card style={s.card}>
          <RNText style={s.cardTitle}>{t("Rekening pribadi")}</RNText>
          <RNText style={s.cardSub}>{t("Opsional. Dipakai saat kirim invoice ke tenant.")}</RNText>
          <Field label={t("Bank")}>
            <Input testID="profile-bank" value={f.bank_name} onChangeText={set("bank_name")} placeholder={t("BCA")} />
            {bankPicker("bank_name", "profile-bank")}
          </Field>
          <Field label={t("Nomor rekening")}>
            <Input testID="profile-account" value={f.bank_account} onChangeText={set("bank_account")} keyboardType="numeric" />
          </Field>
          <Field label={t("Atas nama")}>
            <Input testID="profile-holder" value={f.bank_holder} onChangeText={set("bank_holder")} autoCapitalize="words" />
          </Field>
        </Card>

        <Card style={s.card}>
          <RNText style={s.cardTitle}>{t("Rekening kantor")}</RNText>
          <RNText style={s.cardSub}>{t("Opsional. Saat kirim invoice kamu bisa pilih rekening pribadi atau kantor.")}</RNText>
          <Field label={t("Bank")}>
            <Input testID="profile-office-bank" value={f.office_bank_name} onChangeText={set("office_bank_name")} placeholder={t("Mandiri")} />
            {bankPicker("office_bank_name", "profile-office-bank")}
          </Field>
          <Field label={t("Nomor rekening")}>
            <Input testID="profile-office-account" value={f.office_bank_account} onChangeText={set("office_bank_account")} keyboardType="numeric" />
          </Field>
          <Field label={t("Atas nama")}>
            <Input testID="profile-office-holder" value={f.office_bank_holder} onChangeText={set("office_bank_holder")} autoCapitalize="words" />
          </Field>
        </Card>

        {missing.length ? <RNText style={s.missing} testID="profile-missing">{t("Belum diisi: {fields}", { fields: missing.join(", ") })}</RNText> : null}
        <Button title={t("Simpan Profil")} size="lg" onPress={() => save.mutate()} loading={save.isPending} disabled={missing.length > 0} testID="profile-save" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: "100%", alignSelf: "center" },
  photoBox: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  photoBtn: { borderRadius: 60, borderWidth: 4, borderColor: colors.surfaceSecondary, ...cardShadow },
  camera: {
    position: "absolute", right: 0, bottom: 0, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: colors.surfaceSecondary,
  },
  photoLink: { color: colors.error, ...fonts.medium, fontSize: 14.5, paddingVertical: 4 },
  photoHint: { color: colors.muted, ...fonts.regular, fontSize: 14 },
  card: { gap: spacing.md },
  cardTitle: { color: colors.onSurface, ...fonts.bold, fontSize: 19 },
  cardSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, lineHeight: 20, marginTop: -8 },
  readonly: { color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  missing: { color: colors.muted, ...fonts.regular, fontSize: 14, lineHeight: 20, textAlign: "center" },
}));
