import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { Avatar, Notice, TradeBadge, VerifiedBadge } from "@/src/components/ui";
import { useSubscription } from "@/src/lib/revenuecat";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ProfileScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const { user, signOut, purchaseIdentityError } = useAuth();
  const { isSubscribed, lifetimePro } = useSubscription();
  if (!user) return null;

  const rows: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; testID: string; danger?: boolean }[] = [
    { icon: "create-outline", label: "Edit profile, picture & business", onPress: () => router.push("/onboarding"), testID: "menu-edit-profile" },
    { icon: "person-add-outline", label: "Find people", onPress: () => router.push("/find"), testID: "menu-find-people" },
    { icon: "chatbox-ellipses-outline", label: "Invite mates", onPress: () => router.push("/invite"), testID: "menu-invite" },
    { icon: "star-outline", label: isSubscribed ? "Manage Pro subscription" : "Upgrade to Pro", onPress: () => router.push("/paywall"), testID: "menu-subscription" },
    { icon: "log-out-outline", label: "Sign out", onPress: signOut, testID: "menu-sign-out", danger: true },
  ];

  return (
    <View style={s.root} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}>
        {/* Facebook-style cover + display picture */}
        <LinearGradient colors={[colors.brandSecondary, colors.surfaceInverse]} style={[s.cover, { paddingTop: insets.top + spacing.sm }]}>
          <Text style={s.coverTitle}>Profile</Text>
        </LinearGradient>
        <View style={s.heroWrap}>
          <Pressable onPress={() => router.push("/onboarding")} style={[s.avatarRing, user.picture_kind === "logo" && { borderRadius: 28 }]} testID="profile-avatar">
            <Avatar name={user.name} picture={user.picture} kind={user.picture_kind} size={104} />
            <View style={s.editBadge}>
              <Ionicons name="camera" size={14} color={colors.onBrandPrimary} />
            </View>
          </Pressable>
          <View style={s.nameRow}>
            <Text style={s.name} testID="profile-name">{user.name}</Text>
            {user.phone_verified ? <VerifiedBadge /> : null}
          </View>
          <View style={s.badges}>
            <TradeBadge trade={user.trade} />
            {isSubscribed ? (
              <View style={s.proPill} testID="profile-pro-pill">
                <Ionicons name="star" size={12} color={colors.onBrandPrimary} />
                <Text style={s.proPillText}>PRO</Text>
              </View>
            ) : null}
          </View>
          {user.business_name ? <Text style={s.biz} testID="profile-business">{user.business_name}</Text> : null}
          <Text style={s.meta} testID="profile-phone">
            {user.phone}
            {user.suburb ? ` · ${user.suburb}` : ""}
          </Text>
          {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        </View>

        {purchaseIdentityError ? (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
            <Notice tone="error" text={`Subscription account not linked: ${purchaseIdentityError}`} testID="purchase-identity-error" />
          </View>
        ) : null}

        <Pressable onPress={() => router.push("/paywall")} testID="pro-card" style={s.proWrap}>
          <LinearGradient colors={[colors.brandPrimary, colors.onBrandTertiary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pro}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.proTitle}>{lifetimePro ? "Lifetime Pro · on the house" : isSubscribed ? "ChopOut Pro is active" : "Explore ChopOut Pro"}</Text>
              <Text style={s.proBody}>
                {isSubscribed
                  ? "Full crew access, chat, calls, nearby search and business profile."
                  : "See your crew, chat & call them, find subbies nearby and show your business."}
              </Text>
            </View>
            <Ionicons name={isSubscribed ? "checkmark-circle" : "chevron-forward"} size={28} color={colors.onBrandPrimary} />
          </LinearGradient>
        </Pressable>

        <View style={s.menu}>
          {rows.map((r, i) => (
            <Pressable key={r.label} testID={r.testID} onPress={r.onPress} style={({ pressed }) => [s.menuRow, i > 0 && s.menuBorder, pressed && { opacity: 0.6 }]}>
              <Ionicons name={r.icon} size={22} color={r.danger ? colors.error : colors.onSurfaceTertiary} />
              <Text style={[s.menuText, r.danger && { color: colors.error }]}>{r.label}</Text>
              {!r.danger ? <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} /> : null}
            </Pressable>
          ))}
        </View>

        <View style={s.privacy} testID="privacy-note">
          <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
          <Text style={s.privacyText}>Your crew list and phone contacts are private. Nobody else can see who you&apos;ve added.</Text>
        </View>
        <Text style={s.email}>Signed in as {user.email}</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  cover: { height: 150, paddingHorizontal: spacing.lg },
  coverTitle: { fontSize: font.lg, fontWeight: "700", color: c.onSurfaceInverse, opacity: 0.85 },
  heroWrap: { alignItems: "center", paddingHorizontal: spacing.lg, marginTop: -56, marginBottom: spacing.lg, gap: 6 },
  avatarRing: { padding: 4, borderRadius: 60, backgroundColor: c.surface },
  editBadge: { position: "absolute", right: 2, bottom: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  name: { fontSize: font.xxl, fontWeight: "800", color: c.onSurface, letterSpacing: -0.3 },
  badges: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  proPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  proPillText: { color: c.onBrandPrimary, fontSize: 10, fontWeight: "800" },
  biz: { fontSize: font.lg, fontWeight: "600", color: c.onSurfaceTertiary },
  meta: { fontSize: font.base, color: c.muted },
  bio: { fontSize: font.base, color: c.onSurfaceTertiary, textAlign: "center", lineHeight: 20, marginTop: spacing.xs },
  proWrap: { marginHorizontal: spacing.lg, borderRadius: radius.md, overflow: "hidden" },
  pro: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  proTitle: { color: c.onBrandPrimary, fontSize: font.lg, fontWeight: "800" },
  proBody: { color: c.onBrandPrimary, fontSize: font.base, opacity: 0.9, lineHeight: 19 },
  menu: { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 52 },
  menuBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  menuText: { flex: 1, fontSize: font.lg, color: c.onSurface },
  menuSub: { fontSize: font.sm, color: c.muted, marginTop: 2 },
  privacy: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  privacyText: { flex: 1, color: c.muted, fontSize: font.sm, lineHeight: 18 },
  email: { textAlign: "center", color: c.muted, fontSize: font.sm },
}));
