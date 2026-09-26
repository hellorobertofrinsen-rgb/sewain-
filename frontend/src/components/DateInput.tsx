import React from "react";
import { Platform } from "react-native";
import { Input } from "./ui";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

// Web (the installable PWA) gets the browser's native date/time picker — on iPhone and
// Android that is the familiar wheel/calendar. Native builds fall back to a text field.
export function DateInput({
  value,
  onChange,
  mode = "date",
  testID,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  mode?: "date" | "time";
  testID?: string;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: mode,
      value: value || "",
      "data-testid": testID,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        backgroundColor: colors.surfaceTertiary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: `0 ${spacing.md}px`,
        minHeight: 46,
        width: "100%",
        boxSizing: "border-box",
        color: colors.onSurface,
        ...fonts.regular,
        fontSize: 15.5,
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
      },
    });
  }
  return (
    <Input
      testID={testID}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder ?? (mode === "date" ? "YYYY-MM-DD" : "14:00")}
      keyboardType="numbers-and-punctuation"
    />
  );
}
