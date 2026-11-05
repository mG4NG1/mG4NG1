import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, User } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PhoneVerify } from "@/src/components/phone-verify";
import { PicturePicker } from "@/src/components/picture-picker";
import { Button, Notice } from "@/src/components/ui";
import { useTrades } from "@/src/hooks";
import { useSubscription } from "@/src/lib/revenuecat";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Onboarding() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { isSubscribed } = useSubscription();
  const trades = useTrades();
  const editing = !!user?.profile_complete;

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [trade, setTrade] = useState<string | null>(user?.trade ?? null);
  const [business, setBusiness] = useState(user?.business_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || phone.replace(/\D/g, "").length < 6 || !trade) {
      setError("Please add your name, mobile number and trade.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const u = await api<User>("/profile", {
        method: "PUT",
        body: { name, phone, trade, business_name: business || null, bio: bio || null },
      });
      setUser(u);
      if (editing) goBack();
      else router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"));

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        {editing ? (
          <Pressable onPress={goBack} style={s.back} testID="profile-edit-back-button">
            <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
          </Pressable>
        ) : null}
        <Text style={s.title}>{editing ? "Edit profile" : "Set up your profile"}</Text>
      </View>
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {!editing ? (
          <Text style={s.lead}>Contractors find you by your mobile number and trade. Your number is only shown to Pro members in your crew.</Text>
        ) : null}

        {user ? <PicturePicker user={user} onChange={setUser} /> : null}

        <Text style={s.label}>Full name</Text>
        <TextInput testID="profile-name-input" style={s.input} value={name} onChangeText={setName} placeholder="e.g. Jack Mason" placeholderTextColor={colors.muted} />

        <Text style={s.label}>Mobile number</Text>
        <TextInput
          testID="profile-phone-input"
          style={s.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="e.g. 0412 345 678"
          placeholderTextColor={colors.muted}
        />
        {user ? <PhoneVerify phone={phone} user={user} onVerified={setUser} /> : null}

        <Text style={s.label}>Your trade</Text>
        <View style={s.grid}>
          {(trades.data ?? []).map((t) => {
            const sel = t === trade;
            return (
              <Pressable
                key={t}
                testID={`profile-trade-${t.toLowerCase().replace(/\s/g, "-")}`}
                onPress={() => setTrade(t)}
                style={[s.tradeOpt, sel && s.tradeOptSel]}
              >
                <Text style={[s.tradeText, sel && s.tradeTextSel]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.bizHead}>
          <Text style={s.label}>Business name</Text>
          <View style={s.proTag}>
            <Text style={s.proTagText}>PRO</Text>
          </View>
        </View>
        <TextInput
          testID="profile-business-input"
          style={[s.input, !isSubscribed && s.inputDisabled]}
          value={business}
          onChangeText={setBusiness}
          editable={isSubscribed}
          placeholder={isSubscribed ? "e.g. Mason Electrical Pty Ltd" : "Upgrade to Pro to show your business"}
          placeholderTextColor={colors.muted}
        />

        <Text style={s.label}>About you (optional)</Text>
        <TextInput
          testID="profile-bio-input"
          style={[s.input, s.multi]}
          value={bio}
          onChangeText={setBio}
          multiline
          placeholder="Years of experience, tickets, availability..."
          placeholderTextColor={colors.muted}
        />

        {error ? <Notice text={error} tone="error" testID="profile-error" /> : null}
        <Button label={editing ? "Save changes" : "Continue"} onPress={save} loading={saving} testID="profile-save-button" style={{ marginTop: spacing.md }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -spacing.md },
  title: { fontSize: font.xxl + 4, fontWeight: "800", color: c.onSurface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  lead: { fontSize: font.base, color: c.muted, lineHeight: 20, marginBottom: spacing.sm },
  label: { fontSize: font.base, fontWeight: "600", color: c.onSurfaceTertiary, marginTop: spacing.md },
  input: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
    fontSize: font.lg,
    color: c.onSurface,
  },
  inputDisabled: { backgroundColor: c.surfaceTertiary },
  multi: { minHeight: 90, paddingTop: spacing.md, textAlignVertical: "top" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tradeOpt: {
    paddingHorizontal: spacing.md,
    height: 40,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  tradeOptSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  tradeText: { fontSize: font.base, color: c.onSurface, fontWeight: "500" },
  tradeTextSel: { color: c.onBrandPrimary },
  bizHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  proTag: { backgroundColor: c.brandPrimary, borderRadius: radius.sm, paddingHorizontal: 6, marginTop: spacing.md },
  proTagText: { color: c.onBrandPrimary, fontSize: 10, fontWeight: "800" },
}));
