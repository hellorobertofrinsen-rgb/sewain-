import React from "react";
import { Text as RNText, View } from "react-native";
import { Illustration, IllustrationName } from "./Illustration";
import { useIsWide } from "@/src/lib/layout";
import { fonts, makeStyles, spacing } from "@/src/theme";

/**
 * Desktop: the list on the left and the selected item's detail on the right, like
 * Mail. Phone: just the list (tapping an item pushes the detail screen instead).
 */
export function SplitView({
  list,
  detail,
  emptyArt,
  emptyText,
  listWidth = 440,
}: {
  list: React.ReactNode;
  detail: React.ReactNode | null;
  emptyArt: IllustrationName;
  emptyText: string;
  listWidth?: number;
}) {
  const wide = useIsWide();
  const s = useStyles();
  if (!wide) return <>{list}</>;
  return (
    <View style={s.row}>
      <View style={[s.list, { width: listWidth }]}>{list}</View>
      <View style={s.detail} testID="split-detail">
        {detail ?? (
          <View style={s.empty}>
            <Illustration name={emptyArt} width={180} />
            <RNText style={s.emptyText}>{emptyText}</RNText>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flex: 1, flexDirection: "row" },
  list: { borderRightWidth: 1, borderRightColor: colors.border },
  detail: { flex: 1, backgroundColor: colors.surface },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyText: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 16, textAlign: "center" },
}));
