import { Linking, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { Button } from "@/src/components/ui";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type PermState = { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean } | null;

// Pre-permission explanation with the native prompt behind a clear tap,
// and an Open Settings button once the OS will no longer ask.
export function PermissionPrompt({
  icon,
  title,
  body,
  perm,
  onAllow,
  loading,
  testID,
  allowLabel = "Allow access",
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
  perm: PermState;
  onAllow: () => void;
  loading?: boolean;
  testID: string;
  allowLabel?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const blocked = perm?.status === "denied" && !perm.canAskAgain;
  return (
    <View style={s.card} testID={testID}>
      <View style={s.icon}>
        <Ionicons name={icon} size={24} color={colors.brandPrimary} />
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>
        {blocked ? "Access is turned off. Open Settings and allow access to use this feature." : body}
      </Text>
      {blocked ? (
        <Button label="Open Settings" icon="settings-outline" variant="dark" onPress={() => Linking.openSettings()} testID={`${testID}-open-settings`} />
      ) : (
        <Button
          label={perm?.status === "denied" ? "Try again" : allowLabel}
          onPress={onAllow}
          loading={loading}
          testID={`${testID}-allow`}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary,
    gap: spacing.md,
    alignItems: "center",
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: font.xl, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  body: { fontSize: font.base, color: c.muted, textAlign: "center", lineHeight: 20 },
}));
