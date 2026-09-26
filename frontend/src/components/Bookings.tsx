import React, { useState } from "react";
import { Linking, Text as RNText, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet } from "./Sheet";
import { DateInput } from "./DateInput";
import { Button, Card, Field, IconCircle, Input, PressableScale, SectionTitle } from "./ui";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { api } from "@/src/lib/api";
import { t } from "@/src/lib/i18n";
import { dateLabel, moneyInput, parseMoney, rupiah, todayISO, typeMoney } from "@/src/lib/format";
import { waLink } from "@/src/lib/messages";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

// Nightly stays for units that are also rented daily (villa, kos harian).

function nightsBetween(a: string, b: string) {
  const d = (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000;
  return Math.max(0, Math.round(d));
}

export function Bookings({ unit }: { unit: any }) {
  const s = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["bookings", unit.id], queryFn: () => api<any[]>(`/units/${unit.id}/bookings`) });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/bookings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings", unit.id] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast(t("Booking dihapus"));
    },
  });
  const today = todayISO();
  const upcoming = (data || []).filter((b) => b.check_out >= today).sort((a, b) => a.check_in.localeCompare(b.check_in));
  const past = (data || []).filter((b) => b.check_out < today);
  const pastTotal = past.reduce((a, b) => a + (b.total || 0), 0);

  return (
    <View style={{ gap: spacing.md }} testID="bookings-section">
      <SectionTitle right={<Button title={t("Booking")} icon="plus" size="sm" variant="secondary" onPress={() => setOpen(true)} testID="booking-add" />}>
        {t("Sewa harian")}
      </SectionTitle>
      <RNText style={s.sub}>
        {unit.daily_price ? t("{price} per hari", { price: rupiah(unit.daily_price) }) : t("Harga per hari belum diisi (Edit unit).")}
        {past.length ? ` · ${t("{n} booking selesai, total {total}", { n: past.length, total: rupiah(pastTotal) })}` : ""}
      </RNText>
      {upcoming.length === 0 ? <RNText style={s.empty}>{t("Belum ada booking yang akan datang.")}</RNText> : null}
      {upcoming.map((b) => (
        <Card key={b.id} testID={`booking-${b.id}`} style={s.card}>
          <IconCircle icon="calendar-check" tone="info" size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={s.name}>{b.guest_name}</RNText>
            <RNText style={s.meta}>
              {dateLabel(b.check_in + "T00:00:00")} → {dateLabel(b.check_out + "T00:00:00")} · {t("{n} malam", { n: b.nights })}
            </RNText>
            <RNText style={s.total}>{rupiah(b.total)}</RNText>
          </View>
          {waLink(b.phone) ? (
            <PressableScale onPress={() => Linking.openURL(waLink(b.phone)!)} style={s.iconBtn} accessibilityLabel={t("WhatsApp")} testID={`booking-wa-${b.id}`}>
              <Icon name="whatsapp" size={19} color={colors.success} />
            </PressableScale>
          ) : null}
          <PressableScale onPress={() => remove.mutate(b.id)} style={s.iconBtn} accessibilityLabel={t("Hapus")} testID={`booking-delete-${b.id}`}>
            <Icon name="trash" size={18} color={colors.muted} />
          </PressableScale>
        </Card>
      ))}
      {open ? <BookingSheet unit={unit} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

function BookingSheet({ unit, onClose }: { unit: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const [f, setF] = useState({ guest_name: "", phone: "", check_in: todayISO(), check_out: todayISO(1), price: moneyInput(unit.daily_price) });
  const nights = nightsBetween(f.check_in, f.check_out);
  const total = nights * (parseMoney(f.price) || 0);
  const save = useMutation({
    mutationFn: () =>
      api(`/units/${unit.id}/bookings`, {
        method: "POST",
        body: { guest_name: f.guest_name.trim(), phone: f.phone.trim() || null, check_in: f.check_in, check_out: f.check_out, price_per_night: parseMoney(f.price) ?? 0 },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings", unit.id] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast(t("Booking tersimpan"));
      onClose();
    },
    onError: (e: any) => toast(e?.message || t("Gagal menyimpan"), "error"),
  });
  return (
    <Sheet visible onClose={onClose} title={t("Booking {unit}", { unit: unit.name })} testID="booking-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        <Field label={t("Nama tamu")}>
          <Input testID="booking-guest" value={f.guest_name} onChangeText={(v) => setF({ ...f, guest_name: v })} autoCapitalize="words" />
        </Field>
        <Field label={t("No. WhatsApp (opsional)")}>
          <Input testID="booking-phone" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" placeholder="0812…" />
        </Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("Check-in")}><DateInput testID="booking-in" value={f.check_in} onChange={(v) => setF({ ...f, check_in: v })} /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Check-out")}><DateInput testID="booking-out" value={f.check_out} onChange={(v) => setF({ ...f, check_out: v })} /></Field>
          </View>
        </View>
        <Field label={t("Harga per hari")}>
          <Input testID="booking-price" value={f.price} onChangeText={(v) => setF({ ...f, price: typeMoney(v) })} keyboardType="numeric" placeholder="750.000" />
        </Field>
        <View style={s.summary}>
          <RNText style={s.meta}>{t("{n} malam", { n: nights })}</RNText>
          <RNText style={s.total}>{rupiah(total)}</RNText>
        </View>
        <Button title={t("Simpan Booking")} onPress={() => save.mutate()} loading={save.isPending} disabled={!f.guest_name.trim() || !parseMoney(f.price) || nights < 1} testID="booking-save" />
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5, lineHeight: 20, marginTop: -6 },
  empty: { color: colors.muted, ...fonts.regular, fontSize: 14.5 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { color: colors.onSurface, ...fonts.semibold, fontSize: 16.5 },
  meta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14 },
  total: { color: colors.onSurface, ...fonts.bold, fontSize: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  summary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md },
}));
