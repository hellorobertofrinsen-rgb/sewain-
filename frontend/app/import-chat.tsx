import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text as RNText, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { Linking, router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Button, Card, Chip, ErrorBox, Spinner, StatusPill, Textarea } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api, readPickedText } from "@/src/lib/api";
import { relTime, rupiah } from "@/src/lib/format";
import { fonts, makeStyles, radius, spacing, useTheme, withAlpha } from "@/src/theme";

const STAGES = [
  "Membaca percakapan…",
  "Memahami kebutuhan tiap calon penyewa…",
  "Mencocokkan dengan unit kosong…",
  "Menyusun rekomendasi follow-up…",
  "Hampir selesai…",
];

export default function ImportChat() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [stage, setStage] = useState(0);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});

  const { data: sample } = useQuery({
    queryKey: ["sample-chat"],
    queryFn: () => api<{ text: string }>("/ai/sample-chat"),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!text && !fileName) return;
    const t = setInterval(() => setStage((st) => (st + 1) % STAGES.length), 1600);
    return () => clearInterval(t);
  }, [text, fileName]);

  const analyze = useMutation({
    mutationFn: () => api<any>("/ai/analyze-chat", { method: "POST", body: { text, source_type: mode === "file" ? "txt" : "paste" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["impact"] });
    },
    onError: () => setStage(0),
  });

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/csv", "application/csv", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const content = await readPickedText(asset.uri);
      if (!content || content.trim().length < 20) {
        toast("Isi file terlalu pendek atau kosong.", "error");
        return;
      }
      setText(content);
      setFileName(asset.name || "chat.txt");
      setMode("file");
    } catch (e: any) {
      toast(e?.message || "Gagal membaca file", "error");
    }
  };

  const result = analyze.data;
  const busy = analyze.isPending;

  const markContacted = async (lead: any) => {
    try {
      await api(`/leads/${lead.id}/contacted`, { method: "POST", body: { message: edited[lead.id] ?? lead.suggested_followup ?? "" } });
      setDone((d) => ({ ...d, [lead.id]: true }));
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["impact"] });
      toast(`${lead.name} ditandai sudah dihubungi ✓`);
    } catch (e: any) {
      toast(e?.message || "Gagal menandai", "error");
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Analisis Chat" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false} testID="import-chat-screen">
        {busy ? (
          <View style={s.processing} testID="processing-state">
            <Spinner label={STAGES[stage]} />
            <RNText style={s.processingSub}>AI membaca seluruh percakapanmu — jangan tutup halaman ini.</RNText>
          </View>
        ) : result ? (
          <>
            <Animated.View entering={FadeIn.duration(350)}>
              <Card testID="analyze-result-header">
                <RNText style={s.resultHeadline}>
                  Sewain menemukan {result.leads.length} calon penyewa yang perlu perhatian.
                </RNText>
                <RNText style={s.resultMeta}>Dari {result.messages_read} pesan · {result.followup_found} perlu follow-up</RNText>
                {result.potential_value > 0 ? (
                  <RNText style={s.resultValue}>Potensi nilai sewa: {rupiah(result.potential_value)} / bulan</RNText>
                ) : null}
              </Card>
            </Animated.View>

            {result.leads.map((lead: any, i: number) => {
              const msg = edited[lead.id] ?? lead.suggested_followup ?? "";
              const isDone = done[lead.id];
              const isEditing = !!editing[lead.id];
              return (
                <Animated.View key={lead.id} entering={FadeIn.duration(300).delay(i * 90)}>
                  <Card testID={`analyze-lead-card-${lead.id}`} style={isDone ? { opacity: 0.6 } : undefined}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }}>
                      <RNText style={s.leadName}>{lead.name}</RNText>
                      <StatusPill
                        label={lead.interest === "high" ? "Minat tinggi" : lead.interest === "medium" ? "Minat sedang" : "Minat rendah"}
                        tone={lead.interest === "high" ? "success" : "neutral"}
                        testID={`analyze-interest-${lead.id}`}
                      />
                    </View>
                    <RNText style={s.leadMeta}>
                      Chat terakhir {relTime(lead.last_interaction_at)} · {[
                        lead.unit_type,
                        lead.budget_max ? `budget ${rupiah(lead.budget_max)}` : null,
                        lead.move_in_date ? `move-in ${lead.move_in_date}` : null,
                      ].filter(Boolean).join(" · ")}
                    </RNText>
                    {lead.quote ? <RNText style={s.quote}>“{lead.quote}”</RNText> : null}
                    {lead.summary || lead.followup_reason ? (
                      <RNText style={s.aiAnalysis}>
                        <RNText style={s.aiKicker}>Analisis AI: </RNText>
                        {lead.followup_reason || lead.summary}
                      </RNText>
                    ) : null}
                    {typeof lead.confidence === "number" && lead.confidence < 0.6 ? (
                      <View style={s.warnBox} testID={`analyze-uncertain-${lead.id}`}>
                        <RNText style={s.warnText}>Sewain kurang yakin dengan data ini — cek ulang manual.</RNText>
                      </View>
                    ) : null}

                    {lead.matched_unit ? (
                      <View style={s.matchBox} testID={`analyze-match-${lead.id}`}>
                        <RNText style={s.matchKicker}>Cocok dengan</RNText>
                        <RNText style={s.matchName}>{lead.matched_unit.name}</RNText>
                        <RNText style={s.matchSub}>{lead.matched_unit.unit_type} · {rupiah(lead.matched_unit.monthly_price)} / bulan</RNText>
                        {lead.match_reasons?.length ? (
                          <View style={{ marginTop: 8, gap: 3 }}>
                            {lead.match_reasons.map((r: string, ri: number) => (
                              <RNText key={ri} style={s.reasonLine}>✓ {r}</RNText>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <RNText style={s.noMatch}>Belum ada unit kosong yang cocok — Sewain tetap simpan datanya.</RNText>
                    )}

                    {!isDone ? (
                      <>
                        {lead.suggested_followup ? (
                          <View style={{ marginTop: spacing.md, gap: 6 }}>
                            <RNText style={s.matchKicker}>SARAN FOLLOW-UP</RNText>
                            {isEditing ? (
                              <Textarea value={msg} onChangeText={(v) => setEdited({ ...edited, [lead.id]: v })} testID={`analyze-edit-input-${lead.id}`} />
                            ) : (
                              <RNText style={s.draftText}>{msg}</RNText>
                            )}
                          </View>
                        ) : null}
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md }}>
                          {lead.suggested_followup ? (
                            <Button
                              title={isEditing ? "Selesai Edit" : "Edit"}
                              variant="ghost"
                              size="sm"
                              icon="pencil"
                              onPress={() => setEditing({ ...editing, [lead.id]: !isEditing })}
                              testID={`analyze-edit-${lead.id}`}
                            />
                          ) : null}
                          {msg ? (
                            <Button
                              title="Salin"
                              variant="ghost"
                              size="sm"
                              icon="copy"
                              onPress={async () => {
                                await Clipboard.setStringAsync(msg);
                                toast("Pesan disalin");
                              }}
                              testID={`analyze-copy-${lead.id}`}
                            />
                          ) : null}
                          {lead.phone ? (
                            <Button title="WhatsApp" variant="ghost" size="sm" icon="phone" onPress={() => {
                              let digits = lead.phone.replace(/\D/g, "");
                              if (digits.startsWith("0")) digits = "62" + digits.slice(1);
                              Linking.openURL(`https://wa.me/${digits}`);
                            }} testID={`analyze-wa-${lead.id}`} />
                          ) : null}
                          <Button title="Tandai Sudah Dihubungi" size="sm" onPress={() => markContacted(lead)} testID={`analyze-done-${lead.id}`} />
                        </View>
                      </>
                    ) : (
                      <RNText style={s.doneText}>Sudah dihubungi ✓</RNText>
                    )}
                  </Card>
                </Animated.View>
              );
            })}

            <View style={{ gap: 8 }}>
              <Button title="Lihat Semua Calon Penyewa" onPress={() => router.replace("/leads")} testID="analyze-go-leads-button" />
              <Button title="Analisis Chat Lain" variant="ghost" onPress={() => { analyze.reset(); setText(""); setFileName(""); setEdited({}); setDone({}); }} testID="analyze-reset-button" />
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="Tempel Teks" active={mode === "paste"} onPress={() => setMode("paste")} testID="mode-paste-chip" />
              <Chip label="Upload File" active={mode === "file"} onPress={() => setMode("file")} testID="mode-file-chip" />
            </View>

            {mode === "paste" ? (
              <Textarea
                testID="chat-text-input"
                value={text}
                onChangeText={setText}
                placeholder="Tempel percakapan WhatsApp di sini…  Format ekspor WhatsApp atau obrolan biasa sama-sama bisa dibaca."
                style={{ minHeight: 220 }}
              />
            ) : (
              <Card testID="file-picker-card">
                {fileName ? (
                  <>
                    <RNText style={s.fileName}>{fileName}</RNText>
                    <RNText style={s.fileMeta}>{text.length.toLocaleString("id-ID")} karakter terbaca</RNText>
                  </>
                ) : (
                  <RNText style={s.fileMeta}>Ekspor chat WhatsApp (.txt) atau CSV.</RNText>
                )}
                <Button title={fileName ? "Ganti File" : "Pilih File .txt / .csv"} variant="ghost" icon="file" onPress={pickFile} testID="pick-file-button" style={{ marginTop: spacing.md }} />
              </Card>
            )}

            <ErrorBox message={analyze.error ? (analyze.error as any).message : ""} />
            {analyze.error ? null : null}

            <View style={{ gap: 8 }}>
              <Button title="Analisis dengan AI" icon="sparkles" onPress={() => analyze.mutate()} disabled={text.trim().length < 20} testID="analyze-button" />
              <Button title="Pakai Contoh Chat" variant="ghost" onPress={() => { setText(sample?.text || ""); setFileName(""); setMode("paste"); }} testID="use-sample-button" />
              <RNText style={s.privacyNote}>
                AI membaca teks yang kamu kirim untuk menemukan calon penyewa dan mencocokkannya dengan unit. Hasilnya disimpan sebagai data calon penyewa di akunmu.
              </RNText>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  processing: { alignItems: "center", paddingVertical: spacing.xxxl },
  processingSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xl },
  resultHeadline: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.3, lineHeight: 27 },
  resultMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: 6 },
  resultValue: { color: colors.success, fontFamily: fonts.semibold, fontSize: 15, marginTop: spacing.sm },
  leadName: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 18 },
  leadMeta: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12.5, marginTop: 3 },
  quote: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontStyle: "italic", fontSize: 13.5, lineHeight: 20, marginTop: spacing.md },
  aiAnalysis: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  aiKicker: { fontFamily: fonts.semibold, color: colors.info },
  warnBox: { backgroundColor: withAlpha(colors.warning, 0.12), borderColor: withAlpha(colors.warning, 0.4), borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm },
  warnText: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12 },
  matchBox: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  matchKicker: { color: colors.muted, fontFamily: fonts.medium, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" },
  matchName: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17, marginTop: 2 },
  matchSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: 12.5 },
  reasonLine: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: 12.5 },
  noMatch: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: spacing.md, fontStyle: "italic" },
  draftText: { color: colors.onSurface, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: spacing.md },
  doneText: { color: colors.success, fontFamily: fonts.semibold, fontSize: 13, marginTop: spacing.md },
  fileName: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  fileMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  privacyNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, textAlign: "center", paddingHorizontal: spacing.md },
}));
