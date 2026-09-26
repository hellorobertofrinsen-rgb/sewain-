import React, { useEffect, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Linking, Text as RNText, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Sheet } from "./Sheet";
import { Button, ErrorBox, Textarea } from "./ui";
import { useToast } from "./Toast";
import { api } from "@/src/lib/api";
import { dayLabel, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

function waLink(phone?: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (!digits.startsWith("62") && digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

// ---------------------------- Follow-up sheet --------------------------------

export function FollowupSheet({
  lead,
  onClose,
}: {
  lead: { id: string; name: string; suggested_followup?: string | null; phone?: string | null } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const [draft, setDraft] = useState("");
  const [fetching, setFetching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (lead) {
      setDraft(lead.suggested_followup || "");
      setError("");
      if (!lead.suggested_followup) {
        setFetching(true);
        api<{ draft: string }>(`/leads/${lead.id}/draft-followup`, { method: "POST" })
          .then((r) => setDraft(r.draft || ""))
          .catch(() => {})
          .finally(() => setFetching(false));
      }
    }
  }, [lead?.id, lead?.suggested_followup]);

  const wa = waLink(lead?.phone);

  const mark = async () => {
    setSending(true);
    try {
      await api(`/leads/${lead!.id}/contacted`, { method: "POST", body: { message: draft } });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead"] });
      toast(`Follow-up ${lead!.name} ditandai selesai`);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Gagal. Coba lagi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={!!lead} onClose={onClose} title={`Follow-up ${lead?.name || ""}`} testID="followup-sheet">
      {fetching ? (
        <RNText style={s.loadingText}>Sewain sedang menyusun pesan…</RNText>
      ) : (
        <Textarea
          testID="followup-message-input"
          value={draft}
          onChangeText={setDraft}
          placeholder="Tulis pesan follow-up…"
          style={{ minHeight: 130 }}
        />
      )}
      {error ? <ErrorBox message={error} /> : null}
      <View style={s.row}>
        <Button
          title="Salin"
          variant="ghost"
          icon="copy"
          onPress={async () => {
            await Clipboard.setStringAsync(draft);
            toast("Pesan disalin. Tempel di WhatsApp ya.");
          }}
          testID="followup-copy-button"
        />
        {wa ? (
          <Button
            title="WhatsApp"
            variant="ghost"
            icon="phone"
            onPress={() => Linking.openURL(wa)}
            testID="followup-whatsapp-button"
          />
        ) : null}
      </View>
      <Button
        title="Tandai Sudah Dihubungi"
        onPress={mark}
        loading={sending}
        testID="followup-mark-done-button"
        style={{ marginTop: spacing.sm }}
      />
      <RNText style={s.note}>
        Pesan tidak terkirim otomatis — salin dan kirim lewat WhatsApp kamu. Setelah itu tandai di sini.
      </RNText>
    </Sheet>
  );
}

// ---------------------------- Payment reminder -------------------------------

export function ReminderSheet({
  payment,
  onClose,
}: {
  payment: { id: string; name: string; unit_name: string; amount: number; due_date: string; phone?: string | null } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const [draft, setDraft] = useState("");
  const [fetching, setFetching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (payment) {
      setFetching(true);
      setError("");
      api<{ draft: string }>(`/payments/${payment.id}/remind-draft`, { method: "POST" })
        .then((r) => setDraft(r.draft || ""))
        .catch((e) => setError(e?.message || "Gagal membuat pesan."))
        .finally(() => setFetching(false));
    }
  }, [payment?.id]);

  const wa = waLink(payment?.phone);

  const mark = async () => {
    setSending(true);
    try {
      await api(`/payments/${payment!.id}/reminded`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["impact"] });
      toast(`Pengingat untuk ${payment!.name} ditandai terkirim`);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Gagal. Coba lagi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={!!payment} onClose={onClose} title={`Ingatkan ${payment?.name || ""}`} testID="reminder-sheet">
      <RNText style={s.meta}>
        Sewa {payment?.unit_name} · {rupiah(payment?.amount)} · jatuh tempo {dayLabel(payment?.due_date)}
      </RNText>
      {fetching ? (
        <RNText style={s.loadingText}>Sewain sedang menyusun pesan…</RNText>
      ) : (
        <Textarea
          testID="reminder-message-input"
          value={draft}
          onChangeText={setDraft}
          placeholder="Membuat pesan…"
          style={{ minHeight: 120 }}
        />
      )}
      {error ? <ErrorBox message={error} /> : null}
      <View style={s.row}>
        <Button
          title="Salin"
          variant="ghost"
          icon="copy"
          onPress={async () => {
            await Clipboard.setStringAsync(draft);
            toast("Pesan disalin. Tempel di WhatsApp ya.");
          }}
          testID="reminder-copy-button"
        />
        {wa ? (
          <Button title="WhatsApp" variant="ghost" icon="phone" onPress={() => Linking.openURL(wa)} testID="reminder-whatsapp-button" />
        ) : null}
      </View>
      <Button title="Tandai Sudah Dikirim" onPress={mark} loading={sending} testID="reminder-mark-sent-button" style={{ marginTop: spacing.sm }} />
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: spacing.md },
  meta: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13, marginBottom: spacing.md },
  loadingText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, paddingVertical: spacing.lg },
}));
