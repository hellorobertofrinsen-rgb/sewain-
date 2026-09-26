import React from "react";
import { ScrollView, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "./ScreenHeader";
import { fonts, makeStyles, spacing } from "@/src/theme";

export type DocSection = { h: string; p: (string | string[])[] };

/** Plain reading page (privacy policy, terms): comfortable line length and size. */
export function DocPage({ title, updated, intro, sections, testID }: { title: string; updated: string; intro: string; sections: DocSection[]; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={s.root}>
      <ScreenHeader title={title} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxxl }]} testID={testID}>
        <RNText style={s.updated}>Terakhir diperbarui {updated}</RNText>
        <RNText style={s.p}>{intro}</RNText>
        {sections.map((sec) => (
          <View key={sec.h} style={{ gap: spacing.sm }}>
            <RNText style={s.h} accessibilityRole="header">{sec.h}</RNText>
            {sec.p.map((para, i) =>
              Array.isArray(para) ? (
                <View key={i} style={{ gap: 6 }}>
                  {para.map((li) => (
                    <View key={li} style={{ flexDirection: "row", gap: 8 }}>
                      <RNText style={s.p}>•</RNText>
                      <RNText style={[s.p, { flex: 1 }]}>{li}</RNText>
                    </View>
                  ))}
                </View>
              ) : (
                <RNText key={i} style={s.p}>{para}</RNText>
              ),
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 680, width: "100%", alignSelf: "center" },
  updated: { color: colors.muted, ...fonts.medium, fontSize: 14 },
  h: { color: colors.onSurface, ...fonts.bold, fontSize: 19, letterSpacing: -0.2, marginTop: spacing.sm },
  p: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 16, lineHeight: 25 },
}));
