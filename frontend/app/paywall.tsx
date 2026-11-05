import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { PurchasesPackage } from "react-native-purchases";

import { useAuth } from "@/src/auth";
import { Button, Notice } from "@/src/components/ui";
import { isSimulatedStore, rcEnabled, useSubscription } from "@/src/lib/revenuecat";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";
const FEATURES = [
  "See who accepted your crew requests",
  "Chat and call your crew directly",
  "Find subbies within 25 km on the map",
  "Send “looking for work?” to tradies nearby",
  "Show your business on your profile",
];

export default function Paywall() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { purchaseIdentityError } = useAuth();
  const { offerings, isSubscribed, lifetimePro, identityReady, isLoading, purchase, restore, isPurchasing, isRestoring } = useSubscription();
  const [confirm, setConfirm] = useState<PurchasesPackage | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "success" | "info" } | null>(null);

  const packages = offerings?.current?.availablePackages ?? [];
  const pkg = packages.find((p) => p.packageType === "WEEKLY") ?? packages[0];
  const unavailable = !rcEnabled || (!isLoading && !pkg);

  const doPurchase = async (p: PurchasesPackage) => {
    setConfirm(null);
    setMsg(null);
    try {
      await purchase(p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg({ text: "Welcome to Pro! Everything is unlocked.", tone: "success" });
    } catch (e: any) {
      if (e?.userCancelled) return;
      setMsg({ text: e?.message === "identity_not_ready" ? "Your account isn't linked yet. Please try again in a moment." : e?.message ?? "Purchase failed", tone: "error" });
    }
  };

  const doRestore = async () => {
    setMsg(null);
    try {
      const info = await restore();
      const active = Object.keys(info.entitlements.active).length > 0;
      setMsg({ text: active ? "Purchases restored. Pro is active." : "No previous Pro subscription found.", tone: active ? "success" : "info" });
    } catch (e: any) {
      setMsg({ text: e?.message ?? "Restore failed", tone: "error" });
    }
  };

  return (
    <View style={s.root} testID="paywall-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={s.hero}>
          <Image source={{ uri: HERO }} style={s.heroImg} contentFit="cover" transition={300} />
          <LinearGradient colors={["transparent", colors.scrim]} style={s.heroImg} />
          <Pressable onPress={() => router.back()} style={[s.close, { top: insets.top + spacing.sm }]} testID="paywall-close-button">
            <Ionicons name="close" size={22} color={colors.onSurfaceInverse} />
          </Pressable>
          <View style={s.heroText}>
            <Text style={s.heroBadge}>SUBBIENET PRO</Text>
            <Text style={s.heroTitle}>Your whole crew, one tap away</Text>
          </View>
        </View>
        <View style={s.body}>
          {FEATURES.map((f) => (
            <View key={f} style={s.feature}>
              <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />
              <Text style={s.featureText}>{f}</Text>
            </View>
          ))}
          {isSimulatedStore && rcEnabled ? (
            <Notice text="Preview mode: purchases here are simulated test purchases, no money is charged." testID="paywall-simulated-note" />
          ) : null}
          {purchaseIdentityError ? <Notice text={purchaseIdentityError} tone="error" testID="paywall-identity-error" /> : null}
          {msg ? <Notice text={msg.text} tone={msg.tone} testID="paywall-message" /> : null}
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {lifetimePro ? (
          <Notice text="You have lifetime Pro access on this account. Nothing to pay." tone="success" testID="paywall-lifetime" />
        ) : isSubscribed ? (
          <Notice text="You're on Pro. Manage or cancel anytime in your App Store / Google Play subscriptions." tone="success" testID="paywall-active" />
        ) : unavailable ? (
          <Text style={s.unavailable} testID="paywall-unavailable">Subscription options are unavailable right now. Please try again later.</Text>
        ) : isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : (
          <>
            <Text style={s.price} testID="paywall-price">
              {pkg!.product.priceString} / {pkg!.packageType === "WEEKLY" ? "week" : pkg!.packageType === "MONTHLY" ? "month" : pkg!.packageType === "ANNUAL" ? "year" : "period"}
            </Text>
            <Button
              label="Subscribe to Pro"
              icon="star"
              testID="paywall-subscribe-button"
              disabled={!identityReady}
              loading={isPurchasing}
              onPress={() => (isSimulatedStore ? setConfirm(pkg!) : doPurchase(pkg!))}
            />
          </>
        )}
        <Pressable onPress={doRestore} disabled={!rcEnabled || isRestoring} testID="paywall-restore-button" style={s.restore}>
          <Text style={s.restoreText}>{isRestoring ? "Restoring…" : "Restore purchases"}</Text>
        </Pressable>
      </View>

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={s.modalBg}>
          <View style={s.modal} testID="paywall-confirm-modal">
            <Text style={s.modalTitle}>Confirm test purchase</Text>
            <Text style={s.modalBody}>This is a simulated purchase of {confirm?.product.priceString}. No money will be charged.</Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button style={{ flex: 1 }} variant="outline" label="Cancel" onPress={() => setConfirm(null)} testID="paywall-confirm-cancel" />
              <Button style={{ flex: 1 }} label="Buy" onPress={() => confirm && doPurchase(confirm)} testID="paywall-confirm-buy" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 300, justifyContent: "flex-end" },
  heroImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  close: { position: "absolute", right: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: c.scrim, alignItems: "center", justifyContent: "center" },
  heroText: { padding: spacing.xl, gap: spacing.xs },
  heroBadge: { color: c.brandPrimary, fontWeight: "800", fontSize: font.sm, letterSpacing: 1 },
  heroTitle: { color: c.onSurfaceInverse, fontSize: font.xxl + 4, fontWeight: "800", lineHeight: 34 },
  body: { padding: spacing.xl, gap: spacing.md },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureText: { flex: 1, fontSize: font.lg, color: c.onSurface },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.divider },
  price: { textAlign: "center", fontSize: font.xl, fontWeight: "800", color: c.onSurface },
  unavailable: { textAlign: "center", color: c.muted, fontSize: font.base, lineHeight: 20 },
  restore: { alignItems: "center", paddingVertical: spacing.sm, minHeight: 44, justifyContent: "center" },
  restoreText: { color: c.onBrandTertiary, fontWeight: "600" },
  modalBg: { flex: 1, backgroundColor: c.scrim, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modal: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, width: "100%", maxWidth: 400 },
  modalTitle: { fontSize: font.xl, fontWeight: "800", color: c.onSurface },
  modalBody: { fontSize: font.base, color: c.muted, lineHeight: 20 },
}));
