import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { Button, Notice } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, spacing, useTheme } from "@/src/theme";

type CrewNotice = {
  notice_id: string; author_id: string; author_name: string; trade?: string | null;
  text: string; created_at: string; expires_at: string; mine: boolean;
};

export default function Noticeboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notices = useQuery({
    queryKey: ["crew-notices", user?.user_id],
    queryFn: () => api<CrewNotice[]>("/noticeboard"),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const publish = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    try {
      await api("/noticeboard", { method: "POST", body: { text } });
      setDraft("");
      await qc.invalidateQueries({ queryKey: ["crew-notices"] });
    } catch (e: any) { setError(e?.message ?? "Couldn't post notice"); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api(`/noticeboard/${id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["crew-notices"] });
    } catch (e: any) { setError(e?.message ?? "Couldn't delete notice"); }
  };

  const remaining = (date: string) => {
    const hours = Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 3600000));
    return hours > 0 ? `Expires in ${hours}h` : "Expiring";
  };

  return (
    <View style={s.root} testID="noticeboard-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={s.title}>Crew Noticeboard</Text>
        <Text style={s.subtitle}>See what other tradies are posting. Notices disappear after 48 hours.</Text>
      </View>
      {isSubscribed ? (
        <View style={s.editor}>
          <TextInput
            multiline
            maxLength={500}
            value={draft}
            onChangeText={setDraft}
            placeholder="What would you like other tradies to know?"
            placeholderTextColor={colors.muted}
            style={s.input}
            testID="notice-draft"
          />
          <View style={s.editorBottom}>
            <Text style={s.counter}>{draft.length}/500</Text>
            <Button small label="Post notice" onPress={publish} loading={busy} disabled={!draft.trim()} testID="notice-publish" />
          </View>
        </View>
      ) : (
        <View style={s.tip}><Ionicons name="lock-closed-outline" color={colors.brandPrimary} size={20} /><Text style={s.tipText}>Free members can read notices and reply to incoming chats. Upgrade to Pro to post notices or contact other tradies first.</Text></View>
      )}
      {error ? <View style={s.error}><Notice tone="error" text={error} /></View> : null}
      {notices.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
      <FlatList
        data={notices.data ?? []}
        keyExtractor={(n) => n.notice_id}
        refreshControl={<RefreshControl refreshing={notices.isRefetching} onRefresh={() => notices.refetch()} />}
        contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + spacing.xl }}
        ListEmptyComponent={!notices.isLoading ? <Text style={s.empty}>No notices yet. Pro members' updates will appear here.</Text> : null}
        renderItem={({ item }) => (
          <View style={s.card} testID={`notice-${item.notice_id}`}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}><Text style={s.name}>{item.author_name}</Text><Text style={s.meta}>{item.trade || "Tradie"} · {remaining(item.expires_at)}</Text></View>
              {item.mine ? <Pressable onPress={() => remove(item.notice_id)} accessibilityLabel="Delete notice"><Ionicons name="trash-outline" size={22} color={colors.muted} /></Pressable> : null}
            </View>
            <Text style={s.message}>{item.text}</Text>
            {!item.mine && isSubscribed ? (
              <Button
                small
                variant="outline"
                label="Message tradie"
                icon="chatbubble-ellipses-outline"
                onPress={() => router.push(`/chat/${item.author_id}`)}
                testID={`notice-message-${item.notice_id}`}
              />
            ) : null}
            {!item.mine && !isSubscribed ? (
              <Text style={s.restricted}>Read-only on Free. A Pro member can message you first, then you can reply freely.</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 5 },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface },
  subtitle: { color: c.muted, fontSize: font.base, lineHeight: 20 },
  editor: { marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: 16, gap: spacing.sm },
  input: { color: c.onSurface, minHeight: 70, fontSize: 16, textAlignVertical: "top" },
  editorBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { color: c.muted, fontSize: font.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { color: c.onSurface, fontSize: 17, fontWeight: "700" },
  meta: { color: c.muted, fontSize: font.sm },
  message: { color: c.onSurface, fontSize: 16, lineHeight: 24 },
  restricted: { color: c.muted, fontSize: 12, lineHeight: 18 },
  tip: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, padding: spacing.md, backgroundColor: c.surfaceSecondary, flexDirection: "row", gap: spacing.sm, borderRadius: 12 },
  tipText: { flex: 1, color: c.onSurface },
  empty: { paddingTop: spacing.xl, textAlign: "center", color: c.muted },
  error: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
}));
