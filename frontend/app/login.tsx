import { Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { Button, Notice } from "@/src/components/ui";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const BG =
  "https://images.unsplash.com/photo-1579847188804-ecba0e2ea330?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signingIn, error } = useAuth();

  return (
    <View style={s.root} testID="login-screen">
      <Image source={{ uri: BG }} style={s.bg} contentFit="cover" transition={300} />
      <LinearGradient colors={["transparent", colors.scrim, colors.surfaceInverse]} locations={[0, 0.55, 1]} style={s.bg} />
      <View style={[s.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={s.logo}>
          <Ionicons name="construct" size={28} color={colors.onBrandPrimary} />
        </View>
        <Text style={s.title}>SubbieNet</Text>
        <Text style={s.tagline}>Your crew of trusted subbies, at your fingertips.</Text>
        <View style={s.points}>
          {[
            "Find and add tradies from your contacts",
            "Get called in when a job needs extra hands",
            "Pro: chat, call and find subbies nearby",
          ].map((p) => (
            <View key={p} style={s.point}>
              <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
              <Text style={s.pointText}>{p}</Text>
            </View>
          ))}
        </View>
        {error ? <Notice text={error} tone="error" testID="login-error" /> : null}
        <Button
          label="Continue with Google"
          icon="logo-google"
          onPress={signIn}
          loading={signingIn}
          testID="google-signin-button"
        />
        <Text style={s.fine}>Free to join. Pro is $2.99/week, cancel anytime.</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  bg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl, gap: spacing.md },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 36, fontWeight: "800", color: c.onSurfaceInverse, letterSpacing: -0.5 },
  tagline: { fontSize: font.lg, color: c.onSurfaceInverse, opacity: 0.85, lineHeight: 22 },
  points: { gap: spacing.sm, marginVertical: spacing.md },
  point: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  pointText: { color: c.onSurfaceInverse, fontSize: font.base, flex: 1 },
  fine: { color: c.onSurfaceInverse, opacity: 0.6, fontSize: font.sm, textAlign: "center" },
}));
