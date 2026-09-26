import React from "react";
import { Image, Linking, Text as RNText, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Chip, Field, Input, PressableScale, Textarea } from "./ui";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { phoneOk } from "./LeadForm";
import { t } from "@/src/lib/i18n";
import { moneyInput, parseMoney, typeMoney } from "@/src/lib/format";
import { FACILITIES, FURNISHING, SIZES } from "@/src/lib/unitKinds";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// A unit: photos, code, residence, type and size, prices, deposit, furnishing,
// facilities, owner. Optional: the three prices (none = "Renovating…"), view, notes.

export const MAX_PHOTOS = 10;

export type UnitFormValue = {
  photos: string[]; // local picks (add form only; the detail page manages uploaded photos)
  name: string;
  residence: string;
  unit_type: string;
  size_m2: string;
  daily_price: string;
  monthly_price: string;
  yearly_price: string;
  deposit: string;
  furnishing: string;
  facilities: string[];
  view: string;
  notes: string;
  owner_name: string;
  owner_phone: string;
};

export const emptyUnitForm: UnitFormValue = {
  photos: [], name: "", residence: "", unit_type: "", size_m2: "", daily_price: "", monthly_price: "", yearly_price: "",
  deposit: "", furnishing: "", facilities: [], view: "", notes: "", owner_name: "", owner_phone: "",
};

export function unitToForm(u: any): UnitFormValue {
  return {
    photos: [],
    name: u.name || "",
    residence: u.residence || u.address || "",
    unit_type: SIZES.some((x) => x.key === u.unit_type) ? u.unit_type : "",
    size_m2: u.size_m2 ? String(u.size_m2) : "",
    daily_price: moneyInput(u.daily_price),
    monthly_price: moneyInput(u.monthly_price),
    yearly_price: moneyInput(u.yearly_price),
    deposit: u.deposit != null ? typeMoney(String(u.deposit)) : "",
    furnishing: u.furnishing || "",
    facilities: (u.facilities || []).filter((f: string) => FACILITIES.includes(f)),
    view: u.view || "",
    notes: u.notes || "",
    owner_name: u.owner_name || "",
    owner_phone: u.owner_phone || "",
  };
}

/** What is still missing; empty when the form can be saved. */
export function unitFormMissing(f: UnitFormValue, withPhotos: boolean): string[] {
  const miss: string[] = [];
  if (withPhotos && f.photos.length < 1) miss.push(t("Foto"));
  if (!f.name.trim()) miss.push(t("Kode unit"));
  if (!f.residence.trim()) miss.push(t("Nama hunian"));
  if (!f.unit_type) miss.push(t("Tipe"));
  if (!parseInt(f.size_m2, 10)) miss.push(t("Luas"));
  if (f.deposit === "") miss.push(t("Deposit"));
  if (!f.furnishing) miss.push(t("Furnishing"));
  if (!f.owner_name.trim()) miss.push(t("Owner"));
  if (!phoneOk(f.owner_phone)) miss.push(t("No. HP Owner"));
  return miss;
}

export function unitFormBody(f: UnitFormValue) {
  return {
    name: f.name.trim(),
    residence: f.residence.trim(),
    unit_type: f.unit_type,
    size_m2: parseInt(f.size_m2, 10) || null,
    bedrooms: f.unit_type === "Studio" ? 1 : parseInt(f.unit_type, 10) || 1,
    daily_price: parseMoney(f.daily_price) || null,
    monthly_price: parseMoney(f.monthly_price) || 0,
    yearly_price: parseMoney(f.yearly_price) || null,
    deposit: parseMoney(f.deposit) ?? 0,
    furnishing: f.furnishing,
    furnished: f.furnishing !== "unfurnished",
    facilities: f.facilities,
    view: f.view.trim() || null,
    notes: f.notes.trim() || null,
    owner_name: f.owner_name.trim(),
    owner_phone: f.owner_phone.trim(),
  };
}

export function UnitForm({ value, onChange, prefix = "unit", withPhotos = false }: { value: UnitFormValue; onChange: (v: UnitFormValue) => void; prefix?: string; withPhotos?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { toast } = useToast();
  const set = (patch: Partial<UnitFormValue>) => onChange({ ...value, ...patch });
  const money = (k: "monthly_price" | "daily_price" | "yearly_price" | "deposit") => (v: string) => set({ [k]: typeMoney(v) });
  const toggle = (f: string) => set({ facilities: value.facilities.includes(f) ? value.facilities.filter((x) => x !== f) : [...value.facilities, f] });

  const addPhotos = async () => {
    const room = MAX_PHOTOS - value.photos.length;
    if (room <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) Linking.openSettings();
      else toast(t("Izinkan akses galeri untuk memilih foto"), "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsMultipleSelection: true, selectionLimit: room });
    if (res.canceled) return;
    set({ photos: [...value.photos, ...(res.assets || []).map((a) => a.uri)].slice(0, MAX_PHOTOS) });
  };

  return (
    <View style={{ gap: spacing.md }}>
      {withPhotos ? (
        <Field label={t("Foto ({n}/{max})", { n: value.photos.length, max: MAX_PHOTOS })} hint={t("Minimal 1 foto. Foto pertama jadi sampul.")}>
          <View style={s.photos}>
            {value.photos.map((uri, i) => (
              <View key={uri + i} style={s.thumb}>
                <Image source={{ uri }} style={s.thumbImg} />
                <PressableScale onPress={() => set({ photos: value.photos.filter((_, k) => k !== i) })} style={s.thumbX} accessibilityLabel={t("Hapus foto")} testID={`${prefix}-photo-remove-${i}`}>
                  <Icon name="x" size={12} color="#FFFFFF" strokeWidth={2.6} />
                </PressableScale>
                {i === 0 ? <View style={s.cover}><RNText style={s.coverText}>{t("Sampul")}</RNText></View> : null}
              </View>
            ))}
            {value.photos.length < MAX_PHOTOS ? (
              <PressableScale onPress={addPhotos} style={s.addTile} testID={`${prefix}-photo-add`} accessibilityLabel={t("Tambah foto")}>
                <Icon name="camera" size={22} color={colors.brandPrimary} />
                <RNText style={s.addText}>{t("Tambah")}</RNText>
              </PressableScale>
            ) : null}
          </View>
        </Field>
      ) : null}

      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Field label={t("Kode unit")}>
            <Input testID={`${prefix}-name-input`} value={value.name} onChangeText={(v) => set({ name: v })} placeholder={t("mis. A12")} autoCapitalize="characters" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t("Luas (m²)")}>
            <Input testID={`${prefix}-size-input`} value={value.size_m2} onChangeText={(v) => set({ size_m2: v.replace(/\D/g, "").slice(0, 5) })} placeholder="24" keyboardType="numeric" />
          </Field>
        </View>
      </View>
      <Field label={t("Nama hunian")} hint={t("Nama apartemen atau cluster. Dipakai sebagai lokasi di undangan viewing.")}>
        <Input testID={`${prefix}-residence-input`} value={value.residence} onChangeText={(v) => set({ residence: v })} placeholder={t("mis. Tokyo Riverside PIK 2")} />
      </Field>
      <Field label={t("Tipe")}>
        <View style={s.wrap}>
          {SIZES.map((x) => (
            <Chip key={x.key} label={t(x.short)} active={value.unit_type === x.key} onPress={() => set({ unit_type: x.key })} testID={`${prefix}-type-${x.short}`} />
          ))}
        </View>
      </Field>

      <View style={s.group}>
        <RNText style={s.groupTitle}>
          {t("Harga")} <RNText style={s.optional}>{t("(opsional)")}</RNText>
        </RNText>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label={t("Per hari")}>
              <Input testID={`${prefix}-daily-price-input`} value={value.daily_price} onChangeText={money("daily_price")} placeholder="750.000" keyboardType="numeric" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Per bulan")}>
              <Input testID={`${prefix}-price-input`} value={value.monthly_price} onChangeText={money("monthly_price")} placeholder="3.200.000" keyboardType="numeric" />
            </Field>
          </View>
        </View>
        <Field label={t("Per tahun")}>
          <Input testID={`${prefix}-yearly-price-input`} value={value.yearly_price} onChangeText={money("yearly_price")} placeholder="36.000.000" keyboardType="numeric" />
        </Field>
        <RNText style={s.hint}>{t("Tanpa harga sama sekali, unit tampil sebagai Renovating…")}</RNText>
      </View>

      <Field label={t("Deposit")} hint={t("Isi 0 kalau tanpa deposit.")}>
        <Input testID={`${prefix}-deposit-input`} value={value.deposit} onChangeText={money("deposit")} placeholder="1.500.000" keyboardType="numeric" />
      </Field>
      <Field label={t("Furnishing")}>
        <View style={s.wrap}>
          {FURNISHING.map((x) => (
            <Chip key={x.key} label={t(x.label)} active={value.furnishing === x.key} onPress={() => set({ furnishing: x.key })} testID={`${prefix}-furnish-${x.key}`} />
          ))}
        </View>
      </Field>
      <Field label={t("Fasilitas")} hint={t("Yang tidak dicentang tidak ditampilkan.")}>
        <View style={s.wrap}>
          {FACILITIES.map((f) => (
            <Chip key={f} check label={f} active={value.facilities.includes(f)} onPress={() => toggle(f)} testID={`${prefix}-facility-${f.replace(/\W/g, "")}`} />
          ))}
        </View>
      </Field>
      <Field label={t("View (opsional)")}>
        <Input testID={`${prefix}-view-input`} value={value.view} onChangeText={(v) => set({ view: v })} placeholder={t("mis. City view, kolam renang")} />
      </Field>
      <Field label={t("Catatan (opsional)")}>
        <Textarea testID={`${prefix}-notes-input`} value={value.notes} onChangeText={(v) => set({ notes: v })} placeholder={t("mis. Lantai 12, dekat lift")} style={{ minHeight: 80 }} />
      </Field>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Field label={t("Owner")}>
            <Input testID={`${prefix}-owner-name-input`} value={value.owner_name} onChangeText={(v) => set({ owner_name: v })} placeholder={t("mis. Pak Hendra")} autoCapitalize="words" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t("No. HP Owner")}>
            <Input testID={`${prefix}-owner-phone-input`} value={value.owner_phone} onChangeText={(v) => set({ owner_phone: v })} placeholder="0812…" keyboardType="phone-pad" />
          </Field>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  group: { gap: spacing.sm },
  groupTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 15 },
  optional: { color: colors.muted, ...fonts.regular, fontSize: 14 },
  hint: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 19 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumb: { width: 84, height: 84, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  thumbImg: { width: "100%", height: "100%" },
  thumbX: {
    position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(10,12,16,0.6)", alignItems: "center", justifyContent: "center",
  },
  cover: { position: "absolute", left: 4, bottom: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "rgba(10,12,16,0.6)" },
  coverText: { color: "#FFFFFF", ...fonts.semibold, fontSize: 11 },
  addTile: {
    width: 84, height: 84, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.brandPrimary,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", gap: 2,
  },
  addText: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 13 },
}));
