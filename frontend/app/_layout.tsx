import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox, Platform, StatusBar } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/lib/auth";
import { PlanProvider } from "@/src/lib/plan";
import "@/src/lib/install";
import { ToastProvider } from "@/src/components/Toast";
import { CelebrateProvider } from "@/src/components/Celebrate";
import { useTheme } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
            <AuthProvider>
              <ToastProvider>
                <CelebrateProvider>
                <PlanProvider>
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                    <Stack.Screen name="lead/new" options={{ animation: "slide_from_bottom" }} />
                  </Stack>
                </PlanProvider>
                </CelebrateProvider>
              </ToastProvider>
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
