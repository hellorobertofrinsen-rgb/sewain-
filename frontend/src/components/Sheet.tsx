import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, Text as RNText, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll = false,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(1200)).current;

  useEffect(() => {
    if (visible) {
      y.setValue(1200);
      Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 24 }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <Animated.View
          testID={testID}
          style={[s.sheet, { transform: [{ translateY: y }], paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={s.handle} />
          {title ? <RNText style={s.title}>{title}</RNText> : null}
          {scroll ? (
            <KeyboardAwareScrollView bottomOffset={24} showsVerticalScrollIndicator={false}>
              {children}
            </KeyboardAwareScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "88%",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: 17,
    marginBottom: spacing.lg,
  },
}));
