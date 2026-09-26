import { Platform, useWindowDimensions } from "react-native";

/** Desktop browser width: sidebar navigation and list + detail side by side. */
export const WIDE_MIN = 1024;

export function useIsWide() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= WIDE_MIN;
}
