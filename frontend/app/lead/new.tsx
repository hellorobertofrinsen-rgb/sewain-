import React, { useState } from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { LeadForm, emptyLeadForm, formToBody } from "@/src/components/LeadForm";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { usePlan } from "@/src/lib/plan";
import { fonts, makeStyles, spacing } from "@/src/theme";

export default function NewLead() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { plan, isFree } = usePlan();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState(emptyLeadForm);

  const save = useMutation({
    mutationFn: () => api<any>("/leads", { method: "POST", body: formToBody(f) }),
    onSuccess: (lead) => {
      for (const key of ["leads", "today", "plan"]) qc.invalidateQueries({ queryKey: [key] });
      toast(lead.matched_unit ? `Tersimpan — cocok dengan unit ${lead.matched_unit.name}` : "Calon penyewa tersimpan ✓");
      router.replace(`/lead/${lead.id}` as any);
    },
    onError: (e: any) => {
      if (!e?.code) toast(e?.message || "Gagal menyimpan", "error");
    },
  });

  return (
    <View style={s.root}>
      <ScreenHeader title="Calon Penyewa Baru" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} keyboardShouldPersistTaps="handled" testID="new-lead-screen">
        <RNText style={s.intro}>Catat dari chat WhatsApp. Sewain langsung cari unit yang cocok dan ingatkan kapan harus follow-up.</RNText>
        <LeadForm value={f} onChange={setF} />
        <Button title="Simpan Calon Penyewa" size="lg" onPress={() => save.mutate()} loading={save.isPending} disabled={!f.name.trim()} testID="lead-save-button" />
        {isFree && plan ? (
          <RNText style={s.usage}>
            {plan.usage.active_leads}/{plan.limits.max_active_leads} calon penyewa aktif di paket Free
          </RNText>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: "100%", alignSelf: "center" },
  intro: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  usage: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: "center" },
}));
