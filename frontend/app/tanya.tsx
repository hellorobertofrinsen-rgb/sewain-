import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, Text as RNText, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/Icon";
import { LogoMark } from "@/src/components/Logo";
import { Spinner } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const QUICK = [
  "Siapa yang belum bayar?",
  "Unit kosong gue apa aja?",
  "Siapa yang harus gue follow-up hari ini?",
  "Ada masalah urgent?",
  "Berapa viewing minggu ini?",
  "Unit mana yang paling lama kosong?",
];

export default function TanyaScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q || "");
  const [pending, setPending] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tanya"],
    queryFn: () => api<any[]>("/tanya/history"),
  });

  const ask = useMutation({
    mutationFn: (q: string) => api<{ answer: string; actions: any[] }>("/ai/ask", { method: "POST", body: { question: q } }),
    onMutate: (q) => setPending(q),
    onSuccess: () => {
      setPending(null);
      qc.invalidateQueries({ queryKey: ["tanya"] });
      qc.invalidateQueries({ queryKey: ["today"] });
    },
    onError: (e: any) => {
      setPending(null);
      toast(e?.message || "Sewain sedang sibuk. Coba lagi.", "error");
    },
  });

  const listRef = useRef<View>(null);
  useEffect(() => {
    setTimeout(() => listRef.current?.setNativeProps?.({}), 50);
  }, [data?.length, pending]);

  const send = () => {
    const q = text.trim();
    if (!q || ask.isPending) return;
    setText("");
    ask.mutate(q);
  };

  const messages = data || [];

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <Pressable testID="tanya-back-button" onPress={() => router.back()} style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]}>
          <Icon name="chevron-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <LogoMark size={22} bg={colors.surface} />
          <RNText style={s.title}>Tanya Sewain</RNText>
        </View>
        <RNText style={s.headerNote}>Tanya data bisnismu, jawabannya dari database asli.</RNText>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="translate-with-padding">
        <View style={{ flex: 1 }} ref={listRef}>
          {isLoading ? (
            <Spinner label="Membuka riwayat obrolan…" />
          ) : (
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              {messages.length === 0 && !pending ? (
                <View style={s.emptyWrap}>
                  <LogoMark size={40} bg={colors.surface} />
                  <RNText style={s.emptyTitle}>Ada yang bisa dibantu?</RNText>
                  <RNText style={s.emptySub}>Tanya apa saja soal unit, calon penyewa, tagihan, atau masalah propertimu.</RNText>
                </View>
              ) : null}
              <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                {messages.map((m) => (
                  <View key={m.id} style={{ flexDirection: "row", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <View style={[s.bubble, m.role === "user" ? s.bubbleUser : s.bubbleAI]} testID={`tanya-message-${m.id}`}>
                      <RNText style={m.role === "user" ? s.bubbleUserText : s.bubbleAIText}>{m.text}</RNText>
                      {m.actions?.length ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md }}>
                          {m.actions.map((a: any, i: number) => (
                            <Button2 key={i} label={a.label} testID={`tanya-action-${i}`} onPress={() => {
                              if (a.type === "open_leads" && a.ids?.[0]) router.push(`/lead/${a.ids[0]}` as any);
                              else if (a.type === "open_unit" && a.ids?.[0]) router.push(`/unit/${a.ids[0]}` as any);
                              else if (a.type === "remind_payments") toast("Buka tab Tenant lalu tekan Ingatkan — biar jelas masing-masing.", "info");
                            }} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
                {pending ? (
                  <View style={[s.bubble, s.bubbleAI]} testID="tanya-pending">
                    <RNText style={s.bubbleAIText}>“{pending}” — sebentar, Sewain cek datanya dulu…</RNText>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {messages.length === 0 && !pending ? (
            <View style={{ paddingHorizontal: spacing.lg, gap: 8, paddingBottom: 4 }}>
              {QUICK.map((q) => (
                <Pressable key={q} testID={`quick-question-${QUICK.indexOf(q)}`} onPress={() => { setText(""); ask.mutate(q); }} style={({ pressed }) => [s.quickChip, pressed && { opacity: 0.7 }]}>
                  <RNText style={s.quickText}>{q}</RNText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} testID="tanya-input-bar">
            <TextInput
              testID="tanya-input"
              value={text}
              onChangeText={setText}
              placeholder="Tanya apa saja…"
              placeholderTextColor="#71717A"
              style={s.input}
              multiline
              onSubmitEditing={send}
            />
            <Pressable testID="tanya-send-button" onPress={send} disabled={!text.trim() || ask.isPending} style={({ pressed }) => [s.sendBtn, (!text.trim() || ask.isPending) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
              <Icon name="send" size={17} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Button2({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.actionChip, pressed && { opacity: 0.7 }]}>
      <RNText style={s.actionText}>{label}</RNText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    flexWrap: "wrap",
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  title: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 17 },
  headerNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, width: "100%", paddingHorizontal: spacing.xl },
  bubble: { maxWidth: "86%", borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 2 },
  bubbleUser: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary, borderTopRightRadius: radius.sm },
  bubbleAI: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderTopLeftRadius: radius.sm },
  bubbleUserText: { color: colors.onBrandPrimary, fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 21 },
  bubbleAIText: { color: colors.onSurface, fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 21.5 },
  actionChip: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { color: colors.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 12.5 },
  quickChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, alignSelf: "flex-start" },
  quickText: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: 13 },
  emptyWrap: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 17 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", lineHeight: 19 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    maxHeight: 110,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    paddingTop: 11,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
}));
