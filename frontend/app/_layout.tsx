import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { initializeRevenueCat, SubscriptionProvider } from "@/src/lib/revenuecat";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    // Guest browsing remains public; only account-only screens require login.
    const guestAllowed =
      first === "(tabs)" && (!segments[1] || segments[1] === "index" || segments[1] === "work") ||
      first === "login";
    if (!user) {
      if (!guestAllowed) router.replace("/(tabs)");
    } else if (!user.profile_complete) {
      if (first !== "onboarding") router.replace("/onboarding");
    } else if (!first || first === "login") {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.surface }]} testID="app-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
      <Stack.Screen name="post/new" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SubscriptionProvider>
              <KeyboardProvider>
                <StatusBar style="dark" />
                <Gate />
              </KeyboardProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
});
