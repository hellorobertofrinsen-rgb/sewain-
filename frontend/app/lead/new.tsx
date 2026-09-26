import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { LeadForm, LeadFormValue, emptyLeadForm, formToBody } from "@/src/components/LeadForm";
import { Button, Card, IconCircle, Textarea } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { moneyInput } from "@/src/lib/format";
import { parseChat } from "@/src/lib/parseChat";
import { fonts, makeStyles, spacing } from "@/src/theme";

/** Fill only the fields that are still empty, so nothing the agent typed is overwritten. */
function fillFrom(form: LeadFormValue, raw: string): { form: LeadFormValue; found: number } {
  const p = parseChat(raw);
  const next = { ...form };
  let found = 0;
  const put = (k: keyof LeadFormValue, v?: string) => {
    if (v && !next[k]) {
      next[k] = v;
      found++;
    }
  };
  put("name", p.name);
  put("phone", p.phone);
  put("budget", p.budget ? moneyInput(p.budget) : undefined);
  put("unit_type", p.unit_type);
  put("preferred_location", p.preferred_location);
  put("move_in_date", p.move_in_date);
  put("notes", p.notes);
  return { form: next, found };
}

export default function NewLead() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { plan, isFree } = usePlan();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // "Bagikan ke Sewain" from WhatsApp opens /lead/new?text=… (Web Share Target).
  const params = useLocalSearchParams<{ text?: string; title?: string; url?: string }>();
  const shared = [params.title, params.text].filter(Boolean).join("\n").trim();
  const [f, setF] = useState<LeadFormValue>(() => (shared ? fillFrom(emptyLeadForm, shared).form : emptyLeadForm));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");

  const save = useMutation({
    mutationFn: () => api<any>("/leads", { method: "POST", body: formToBody(f) }),
    onSuccess: (lead) => {
      for (const key of ["leads", "today", "plan", "stats"]) qc.invalidateQueries({ queryKey: [key] });
      toast(lead.matched_unit ? `Tersimpan — cocok dengan unit ${lead.matched_unit.name}` : "Prospek tersimpan ✓");
      router.replace(`/lead/${lead.id}` as any);
    },
    onError: (e: any) => {
      if (!e?.code) toast(e?.message || "Gagal menyimpan", "error");
    },
  });

  const applyPaste = () => {
    const { form, found } = fillFrom(f, paste);
    setF(form);
    toast(found ? `${found} isian terisi dari chat — cek lagi ya` : "Tidak ada data yang dikenali. Isi manual saja.", found ? "ok" : "info");
    if (found) setPasteOpen(false);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Prospek Baru" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled" testID="new-lead-screen">
        {shared ? (
          <Card style={s.sharedCard} testID="shared-banner">
            <IconCircle icon="message" tone="success" size={40} />
            <RNText style={s.sharedText}>Diisi dari chat yang kamu bagikan. Cek lagi sebelum simpan.</RNText>
          </Card>
        ) : pasteOpen ? (
          <Card style={{ gap: spacing.md }} testID="paste-card">
            <RNText style={s.pasteTitle}>Tempel chat WhatsApp</RNText>
            <RNText style={s.intro}>Salin beberapa pesan dari chat prospek, tempel di sini. Sewain ambil nama, nomor, budget, dan tipe unit.</RNText>
            <Textarea testID="paste-chat-input" value={paste} onChangeText={setPaste} placeholder="[26/09 10.21] Jessica: Halo kak, ada studio di PIK 2? Budget 3,5 jt…" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button title="Isi otomatis" icon="zap" onPress={applyPaste} disabled={!paste.trim()} testID="paste-apply-button" style={{ flex: 1 }} />
              <Button title="Batal" variant="ghost" onPress={() => setPasteOpen(false)} testID="paste-cancel-button" />
            </View>
          </Card>
        ) : (
          <Button title="Tempel chat WhatsApp" icon="clipboard" variant="secondary" onPress={() => setPasteOpen(true)} testID="paste-open-button" />
        )}
        <LeadForm value={f} onChange={setF} startExpanded={!!shared} />
        <Button title="Simpan Prospek" size="lg" onPress={() => save.mutate()} loading={save.isPending} disabled={!f.name.trim()} testID="lead-save-button" />
        {isFree && plan ? (
          <RNText style={s.usage}>
            {plan.usage.active_leads}/{plan.limits.max_active_leads} prospek aktif di paket Free
          </RNText>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: "100%", alignSelf: "center" },
  intro: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 15, lineHeight: 21 },
  pasteTitle: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  sharedCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sharedText: { color: colors.onSurface, ...fonts.medium, fontSize: 15, lineHeight: 21, flex: 1 },
  usage: { color: colors.muted, ...fonts.regular, fontSize: 13.5, textAlign: "center" },
}));
