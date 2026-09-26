import React, { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Linking, Text as RNText, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Sheet } from "./Sheet";
import { Button, Chip, ErrorBox, Textarea } from "./ui";
import { useToast } from "./Toast";
import { api } from "@/src/lib/api";
import { dateLabel, leaseLeftLabel, rupiah, todayISO } from "@/src/lib/format";
import { FollowupLead, followupMessage, leaseRenewalMessage, paymentReminderMessage, waLink } from "@/src/lib/messages";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { t } from "@/src/lib/i18n";

function invalidateWork(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["today", "leads", "lead", "tenants", "tenant", "plan"]) qc.invalidateQueries({ queryKey: [key] });
}

// Message box + copy / open-in-WhatsApp. Shared by every "send a message" flow.
function MessageBox({ text, setText, phone, testID }: { text: string; setText: (v: string) => void; phone?: string | null; testID: string }) {
  const { toast } = useToast();
  const s = useStyles();
  const wa = waLink(phone, text);
  return (
    <View style={{ gap: spacing.sm }}>
      <Textarea testID={`${testID}-input`} value={text} onChangeText={setText} style={{ minHeight: 130 }} />
      <View style={s.row}>
        {wa ? (
          <Button title={t("Kirim via WhatsApp")} icon="whatsapp" onPress={() => Linking.openURL(wa)} testID={`${testID}-whatsapp`} style={{ flex: 1 }} />
        ) : null}
        <Button
          title={t("Salin")}
          variant="ghost"
          icon="copy"
          onPress={async () => {
            await Clipboard.setStringAsync(text);
            toast(t("Pesan disalin. Tempel di WhatsApp ya."));
          }}
          testID={`${testID}-copy`}
          style={wa ? undefined : { flex: 1 }}
        />
      </View>
      {!phone ? <RNText style={s.note}>{t("Belum ada nomor WhatsApp — salin pesannya, atau tambahkan nomor di detail.")}</RNText> : null}
    </View>
  );
}

// ---------------------------- Follow-up sheet --------------------------------

const NEXT_OPTIONS = [
  { label: "Besok", days: 1 },
  { label: "3 hari lagi", days: 3 },
  { label: "1 minggu lagi", days: 7 },
  { label: "Nanti saja", days: 0 },
];

export type FollowupTarget = FollowupLead & { id: string; phone?: string | null; suggested_followup?: string | null };

export function FollowupSheet({ lead, onClose }: { lead: FollowupTarget | null; onClose: () => void }) {
  return (
    <Sheet visible={!!lead} onClose={onClose} title={t("Follow-up {name}", { name: lead?.name || "" })} testID="followup-sheet" scroll>
      {lead ? <FollowupBody key={lead.id} lead={lead} onClose={onClose} /> : null}
    </Sheet>
  );
}

// Keyed by lead id, so the message is rebuilt from scratch for each lead.
function FollowupBody({ lead, onClose }: { lead: FollowupTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const [text, setText] = useState(() => lead.suggested_followup || followupMessage(lead));
  const [nextDays, setNextDays] = useState(3);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const mark = async () => {
    setSending(true);
    try {
      await api(`/leads/${lead.id}/contacted`, {
        method: "POST",
        body: { message: text, next_followup_date: nextDays ? todayISO(nextDays) : null },
      });
      invalidateWork(qc);
      toast(t("Follow-up {name} tercatat ✓", { name: lead.name }));
      onClose();
    } catch (e: any) {
      setError(e?.message || t("Gagal. Coba lagi."));
    } finally {
      setSending(false);
    }
  };

  return (
      <View style={{ gap: spacing.lg }}>
        <MessageBox text={text} setText={setText} phone={lead.phone} testID="followup" />
        <View style={{ gap: spacing.sm }}>
          <RNText style={s.label}>{t("Ingatkan follow-up lagi")}</RNText>
          <View style={s.wrap}>
            {NEXT_OPTIONS.map((o) => (
              <Chip key={o.days} label={o.label} active={nextDays === o.days} onPress={() => setNextDays(o.days)} testID={`followup-next-${o.days}`} />
            ))}
          </View>
        </View>
        {error ? <ErrorBox message={error} /> : null}
        <Button title={t("Tandai Sudah Dihubungi")} onPress={mark} loading={sending} testID="followup-mark-done-button" />
      </View>
  );
}

// ---------------------------- Payment reminder -------------------------------

export type ReminderTarget = {
  id: string;
  name: string;
  unit_name: string;
  amount: number;
  due_date: string;
  period?: string;
  months?: number;
  days_late?: number;
  phone?: string | null;
};

export function ReminderSheet({ payment, onClose }: { payment: ReminderTarget | null; onClose: () => void }) {
  return (
    <Sheet visible={!!payment} onClose={onClose} title={t("Ingatkan {name}", { name: payment?.name || "" })} testID="reminder-sheet" scroll>
      {payment ? <ReminderBody key={payment.id} payment={payment} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ReminderBody({ payment, onClose }: { payment: ReminderTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const [text, setText] = useState(() => paymentReminderMessage(payment));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const mark = async () => {
    setSending(true);
    try {
      await api(`/payments/${payment.id}/reminded`, { method: "POST" });
      invalidateWork(qc);
      toast(t("Pengingat untuk {name} tercatat", { name: payment.name }));
      onClose();
    } catch (e: any) {
      setError(e?.message || t("Gagal. Coba lagi."));
    } finally {
      setSending(false);
    }
  };

  return (
      <View style={{ gap: spacing.lg }}>
        <RNText style={s.meta}>
          {payment.unit_name} · {rupiah(payment.amount)} · jatuh tempo {dateLabel(payment.due_date + "T00:00:00")}
        </RNText>
        <MessageBox text={text} setText={setText} phone={payment.phone} testID="reminder" />
        {error ? <ErrorBox message={error} /> : null}
        <Button title={t("Tandai Sudah Diingatkan")} onPress={mark} loading={sending} testID="reminder-mark-sent-button" />
      </View>
  );
}

// ---------------------------- Lease ending ----------------------------------

export type LeaseTarget = { id: string; name: string; unit_name: string; end_date: string; days_left?: number | null; phone?: string | null };

const EXTEND_OPTIONS = [1, 3, 6, 12];

export function LeaseSheet({ tenant, onClose }: { tenant: LeaseTarget | null; onClose: () => void }) {
  return (
    <Sheet visible={!!tenant} onClose={onClose} title={t("Kontrak {name}", { name: tenant?.name || "" })} testID="lease-sheet" scroll>
      {tenant ? <LeaseBody key={tenant.id} tenant={tenant} onClose={onClose} /> : null}
    </Sheet>
  );
}

function LeaseBody({ tenant, onClose }: { tenant: LeaseTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const [text, setText] = useState(() => leaseRenewalMessage(tenant));
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const extend = async () => {
    setBusy(true);
    try {
      const r = await api<{ end_date: string; payments_created: number }>(`/tenants/${tenant.id}/extend`, { method: "POST", body: { months } });
      invalidateWork(qc);
      toast(t("Kontrak diperpanjang sampai {date} ✓", { date: dateLabel(r.end_date + "T00:00:00") }));
      onClose();
    } catch (e: any) {
      setError(e?.message || t("Gagal memperpanjang."));
    } finally {
      setBusy(false);
    }
  };

  return (
      <View style={{ gap: spacing.lg }}>
        <RNText style={s.meta}>
          Unit {tenant.unit_name} · berakhir {dateLabel(tenant.end_date + "T00:00:00")}
          {tenant.days_left != null ? ` (${leaseLeftLabel(tenant.days_left)})` : ""}
        </RNText>
        <MessageBox text={text} setText={setText} phone={tenant.phone} testID="lease" />
        <View style={{ gap: spacing.sm }}>
          <RNText style={s.label}>{t("Sudah setuju perpanjang?")}</RNText>
          <View style={s.wrap}>
            {EXTEND_OPTIONS.map((m) => (
              <Chip key={m} label={t("{n} bulan", { n: m })} active={months === m} onPress={() => setMonths(m)} testID={`extend-${m}`} />
            ))}
          </View>
        </View>
        {error ? <ErrorBox message={error} /> : null}
        <Button title={t("Perpanjang {n} Bulan", { n: months })} onPress={extend} loading={busy} testID="lease-extend-button" />
        <RNText style={s.note}>{t("Tagihan bulanan untuk periode baru dibuat otomatis.")}</RNText>
      </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  label: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14.5 },
  note: { color: colors.muted, ...fonts.regular, fontSize: 13.5, lineHeight: 17 },
  meta: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14.5 },
}));
