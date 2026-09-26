import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as Font from "expo-font";
import { useEffect } from "react";
import { LogBox, Platform, StatusBar, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/lib/auth";
import { PlanProvider } from "@/src/lib/plan";
import "@/src/lib/install";
import { ToastProvider } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [fontsLoaded] = Font.useFonts({
    "Rubik-Regular": require("../assets/fonts/rubik-400.ttf"),
    "Rubik-Medium": require("../assets/fonts/rubik-500.ttf"),
    "Rubik-Semibold": require("../assets/fonts/rubik-600.ttf"),
    "Rubik-Bold": require("../assets/fonts/rubik-700.ttf"),
  });
  const { colors } = useTheme();

  // Installable web app: register the service worker (production web build only).
  useEffect(() => {
    if (Platform.OS === "web" && !__DEV__ && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app.
  return (
    <ErrorBoundary>
      {!fontsLoaded ? (
        <View style={{ flex: 1, backgroundColor: "#121214" }} />
      ) : (
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
            <AuthProvider>
              <ToastProvider>
                <PlanProvider>
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                    <Stack.Screen name="lead/new" options={{ animation: "slide_from_bottom" }} />
                  </Stack>
                </PlanProvider>
              </ToastProvider>
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      )}
    </ErrorBoundary>
  );
}
