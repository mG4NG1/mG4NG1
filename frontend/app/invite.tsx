import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Button, Notice } from "@/src/components/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

// The system share sheet uses apps installed on the user's own device.
// ChopOut does not send SMS messages or upload contacts to an SMS service.
export default function InviteScreen() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);

  const shareInvite = async () => {
    setError(null);
    const url = process.env.EXPO_PUBLIC_APP_INVITE_URL?.trim();
    const message = `Join me on ChopOut — the private networking app for tradies.${url ? ` Get the app: ${url}` : ""}`;
    try {
      await Share.share({ message });
    } catch {
      setError("Couldn't open the share menu. Please try again.");
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable onPress={() => router.back()} style={s.back} accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
      </Pressable>
      <Ionicons name="people-circle-outline" size={68} color={colors.brandPrimary} />
      <Text style={s.title}>Invite a tradie</Text>
      <Text style={s.body}>Share ChopOut with other tradies using any app on your phone. We don't send text messages, charge for SMS, or upload your contacts.</Text>
      <Button label="Share ChopOut" icon="share-social-outline" onPress={shareInvite} testID="invite-share-button" />
      {error ? <Notice text={error} tone="error" /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, paddingHorizontal: spacing.lg, gap: spacing.lg },
  back: { width: 44, height: 44, justifyContent: "center" },
  title: { color: c.onSurface, fontSize: 26, fontWeight: "800" },
  body: { color: c.onSurfaceSecondary, fontSize: 16, lineHeight: 25 },
}));
