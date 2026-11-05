import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Post, PostOptions, PostType } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Notice } from "@/src/components/ui";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

function Chips<T extends string | number>({ items, value, onChange, label, testIDPrefix }: { items: { key: T; label: string }[]; value: T | null; onChange: (v: T | null) => void; label: (k: T) => string; testIDPrefix: string }) {
  const s = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
      {items.map((it) => {
        const sel = it.key === value;
        return (
          <Pressable key={String(it.key)} testID={`${testIDPrefix}-${label(it.key)}`} onPress={() => onChange(sel ? null : it.key)} style={[s.chip, sel && s.chipSel]}>
            <Text style={[s.chipText, sel && s.chipTextSel]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Compose a job ("need a subbie") or a "looking for work" broadcast. Pro only.
export default function NewPostScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const opts = useQuery({ queryKey: ["post-options"], queryFn: () => api<PostOptions>("/posts/options"), staleTime: Infinity });

  const [type, setType] = useState<PostType>("job");
  const [trade, setTrade] = useState<string | null>(user?.trade ?? null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState<string | null>(null);
  const [pay, setPay] = useState<number | null>(null);
  const [suburb, setSuburb] = useState(user?.suburb ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isJob = type === "job";
  const canPost = !!trade && title.trim().length >= 3;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const p = await api<Post>("/posts", {
        method: "POST",
        body: { type, trade, title: title.trim(), details: details.trim() || null, start: start.trim() || null, duration, pay_min: pay, suburb: suburb.trim() || null },
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      router.replace(`/post/${p.post_id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const tradeItems = (opts.data?.trades ?? []).map((t) => ({ key: t, label: t }));
  const payItems = (opts.data?.pay_bands ?? []).map((b) => ({ key: b.min, label: b.label }));
  const durItems = (opts.data?.durations ?? []).map((d) => ({ key: d, label: d }));

  return (
    <View style={s.root} testID="new-post-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/work"))} style={s.back} testID="new-post-back-button">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>New post</Text>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={s.typeRow}>
          {(["job", "work"] as PostType[]).map((t) => {
            const sel = t === type;
            return (
              <Pressable key={t} testID={`new-post-type-${t}`} onPress={() => setType(t)} style={[s.typeCard, sel && s.typeCardSel]}>
                <Ionicons name={t === "job" ? "hammer" : "hand-left"} size={22} color={sel ? colors.onBrandSecondary : colors.onSurfaceTertiary} />
                <Text style={[s.typeTitle, sel && s.typeTitleSel]}>{t === "job" ? "I need a subbie" : "I'm looking for work"}</Text>
                <Text style={[s.typeBody, sel && s.typeBodySel]}>{t === "job" ? `Live ${opts.data?.job_days ?? 14} days` : `Live ${opts.data?.work_days ?? 3} days`}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.hint}>Seen by your crew and Pro members within 25 km of your area.</Text>

        <Text style={s.label}>{isJob ? "Trade needed" : "Your trade"}</Text>
        <Chips items={tradeItems} value={trade} onChange={(v) => setTrade(v)} label={(k) => String(k).toLowerCase().replace(/\s/g, "-")} testIDPrefix="new-post-trade" />

        <Text style={s.label}>{isJob ? "What's the job?" : "Headline"}</Text>
        <TextInput
          testID="new-post-title-input"
          style={s.input}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder={isJob ? "e.g. Sparky for 2 days of fit-off" : "e.g. Plumber free next week, own ute & tools"}
          placeholderTextColor={colors.muted}
        />

        <Text style={s.label}>Details (optional)</Text>
        <TextInput
          testID="new-post-details-input"
          style={[s.input, s.multi]}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={600}
          placeholder={isJob ? "Scope, site conditions, tickets needed..." : "Experience, tickets, what you're after..."}
          placeholderTextColor={colors.muted}
        />

        <View style={s.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{isJob ? "Start" : "Available from"}</Text>
            <TextInput testID="new-post-start-input" style={s.input} value={start} onChangeText={setStart} maxLength={40} placeholder="e.g. Mon 10 Nov" placeholderTextColor={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Site suburb</Text>
            <TextInput testID="new-post-suburb-input" style={s.input} value={suburb} onChangeText={setSuburb} maxLength={60} placeholder="Approximate" placeholderTextColor={colors.muted} />
          </View>
        </View>

        <Text style={s.label}>Duration</Text>
        <Chips items={durItems} value={duration} onChange={setDuration} label={(k) => String(k).toLowerCase().replace(/[\s+]/g, "-")} testIDPrefix="new-post-duration" />

        <Text style={s.label}>{isJob ? "Pay rate" : "Rate you're after"}</Text>
        <Chips items={payItems} value={pay} onChange={setPay} label={(k) => String(k)} testIDPrefix="new-post-pay" />
        <Text style={s.hint}>Leave pay unselected to show &quot;Pay negotiable&quot;.</Text>

        {error ? <Notice text={error} tone="error" testID="new-post-error" /> : null}
        <Button label={isJob ? "Post job" : "Broadcast"} icon="paper-plane" onPress={submit} loading={saving} disabled={!canPost} testID="new-post-submit-button" style={{ marginTop: spacing.md }} />
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
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeCard: { flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: 4, minHeight: 92 },
  typeCardSel: { backgroundColor: c.brandSecondary, borderColor: c.brandSecondary },
  typeTitle: { fontSize: font.base, fontWeight: "700", color: c.onSurface },
  typeTitleSel: { color: c.onBrandSecondary },
  typeBody: { fontSize: font.sm, color: c.muted },
  typeBodySel: { color: c.onBrandSecondary, opacity: 0.8 },
  hint: { fontSize: font.sm, color: c.muted, lineHeight: 18 },
  label: { fontSize: font.base, fontWeight: "600", color: c.onSurfaceTertiary, marginTop: spacing.md },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.lg, minHeight: 50, fontSize: font.lg, color: c.onSurface },
  multi: { minHeight: 90, paddingTop: spacing.md, textAlignVertical: "top" },
  twoCol: { flexDirection: "row", gap: spacing.sm },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: { paddingHorizontal: spacing.md, height: 40, justifyContent: "center", borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  chipSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontSize: font.base, color: c.onSurface, fontWeight: "500" },
  chipTextSel: { color: c.onBrandPrimary, fontWeight: "700" },
}));
