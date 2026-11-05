import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, User } from "@/src/api";
import { Button, Notice, VerifiedBadge } from "@/src/components/ui";
import { useSmsStatus } from "@/src/hooks";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Verify the entered mobile with a Twilio SMS code. Hidden entirely when SMS isn't configured.
export function PhoneVerify({ phone, user, onVerified }: { phone: string; user: User; onVerified: (u: User) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const sms = useSmsStatus();
  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!sms.data?.verify) return null;

  const digits = phone.replace(/\D/g, "");
  const sameAsSaved = (user.phone ?? "").replace(/\D/g, "") === digits;
  if (user.phone_verified && sameAsSaved) {
    return (
      <View style={s.row} testID="phone-verified">
        <VerifiedBadge />
        <Text style={s.hint}>Your mobile number is verified.</Text>
      </View>
    );
  }

  const sendCode = async () => {
    if (digits.length < 6) {
      setError("Enter your mobile number first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ to: string }>("/phone/send-code", { method: "POST", body: { phone } });
      setSentTo(r.to);
      setStep("sent");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      onVerified(await api<User>("/phone/verify", { method: "POST", body: { phone, code } }));
      setStep("idle");
      setCode("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card} testID="phone-verify">
      {step === "idle" ? (
        <View style={s.row}>
          <Ionicons name="shield-outline" size={18} color={colors.onBrandTertiary} />
          <Text style={[s.hint, { flex: 1 }]}>Verify your number so crew know it&apos;s really you.</Text>
          <Button small variant="dark" label="Text me a code" onPress={sendCode} loading={busy} testID="phone-send-code-button" />
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.hint}>We texted a code to {sentTo}. Enter it below.</Text>
          <View style={s.row}>
            <TextInput
              testID="phone-code-input"
              style={s.codeInput}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={colors.muted}
              maxLength={8}
              autoFocus
            />
            <Button small label="Confirm" icon="checkmark" onPress={confirm} loading={busy} disabled={code.trim().length < 4} testID="phone-confirm-code-button" />
          </View>
          <Pressable onPress={sendCode} disabled={busy} testID="phone-resend-button" hitSlop={8}>
            <Text style={s.link}>Didn&apos;t get it? Send again</Text>
          </Pressable>
        </View>
      )}
      {error ? <Notice text={error} tone="error" testID="phone-verify-error" /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { gap: spacing.sm, marginTop: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hint: { fontSize: font.sm, color: c.muted, lineHeight: 18 },
  link: { fontSize: font.sm, color: c.onBrandTertiary, fontWeight: "600" },
  codeInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: font.xl,
    letterSpacing: 4,
    color: c.onSurface,
  },
}));
