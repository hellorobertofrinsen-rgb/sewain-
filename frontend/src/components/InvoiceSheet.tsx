import React, { useState } from "react";
import { Linking, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { Sheet } from "./Sheet";
import { Button, PressableScale } from "./ui";
import { Icon } from "./Icon";
import { useAuth } from "@/src/lib/auth";
import { t } from "@/src/lib/i18n";
import { dateLabel, periodLabel, rupiah } from "@/src/lib/format";
import { BankAccount, invoiceMessage, waLink } from "@/src/lib/messages";
import { STATE_TRANSITION } from "@/src/motion";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

export type InvoiceTarget = {
  name: string; phone?: string | null; unit_name: string; amount: number; due_date: string; period?: string; months?: number;
};

/** Pick personal or office account, then send the bill as a WhatsApp message. */
export function InvoiceSheet({ bill, onClose }: { bill: InvoiceTarget | null; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const personal: BankAccount | null = user?.bank_name && user?.bank_account ? { bank: user.bank_name, account: user.bank_account, holder: user.bank_holder } : null;
  const office: BankAccount | null = user?.office_bank_name && user?.office_bank_account
    ? { bank: user.office_bank_name, account: user.office_bank_account, holder: user.office_bank_holder } : null;
  const [choice, setChoice] = useState<"pribadi" | "kantor">(personal || !office ? "pribadi" : "kantor");
  const bank = choice === "pribadi" ? personal : office;
  const wa = bill && bank ? waLink(bill.phone, invoiceMessage(bill, bank, { name: user?.name, agency: user?.agency })) : null;

  const option = (key: "pribadi" | "kantor", label: string, acc: BankAccount | null) => {
    const active = choice === key;
    return (
      <PressableScale
        soft
        key={key}
        testID={`invoice-account-${key}`}
        accessibilityState={{ selected: active }}
        onPress={() => setChoice(key)}
        style={[STATE_TRANSITION, s.option, active && s.optionActive]}
      >
        <View style={[s.radio, active && s.radioActive]}>{active ? <View style={s.radioDot} /> : null}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <RNText style={s.optionLabel}>{label}</RNText>
          {acc ? (
            <RNText style={s.optionSub}>{acc.bank} {acc.account}{acc.holder ? ` · a.n. ${acc.holder}` : ""}</RNText>
          ) : (
            <RNText style={[s.optionSub, { color: colors.warning }]}>{t("Belum diisi")}</RNText>
          )}
        </View>
      </PressableScale>
    );
  };

  return (
    <Sheet visible={!!bill} onClose={onClose} title={t("Kirim Invoice")} testID="invoice-sheet">
      {bill ? (
        <View style={{ gap: spacing.md }}>
          <View style={s.summary}>
            <RNText style={s.amount}>{rupiah(bill.amount)}</RNText>
            <RNText style={s.meta}>
              {bill.name} · {t("Unit {name}", { name: bill.unit_name })}
              {bill.period ? ` · ${periodLabel(bill.period, bill.months)}` : ""}
            </RNText>
            <RNText style={s.meta}>{t("Jatuh tempo {date}", { date: dateLabel(bill.due_date + "T00:00:00") })}</RNText>
          </View>
          <RNText style={s.label}>{t("Transfer ke rekening")}</RNText>
          {option("pribadi", t("Rekening Pribadi"), personal)}
          {option("kantor", t("Rekening Kantor"), office)}
          {!bank ? (
            <Button
              title={t("Isi rekening di Profil")}
              variant="ghost"
              onPress={() => {
                onClose();
                router.push("/profile" as any);
              }}
              testID="invoice-go-profile"
            />
          ) : (
            <Button title={t("Kirim lewat WhatsApp")} icon="whatsapp" onPress={() => wa && Linking.openURL(wa)} disabled={!wa} testID="invoice-send" />
          )}
          {!bill.phone ? (
            <View style={s.note}>
              <Icon name="alert" size={16} color={colors.warning} />
              <RNText style={s.noteText}>{t("Nomor WhatsApp tenant belum diisi.")}</RNText>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  summary: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: 4 },
  amount: { color: colors.onSurface, ...fonts.bold, fontSize: 26, letterSpacing: -0.5 },
  meta: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5 },
  label: { color: colors.onSurface, ...fonts.semibold, fontSize: 14 },
  option: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  optionActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.brandPrimary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
  optionLabel: { color: colors.onSurface, ...fonts.semibold, fontSize: 16 },
  optionSub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14 },
  note: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteText: { color: colors.warning, ...fonts.medium, fontSize: 14 },
}));
