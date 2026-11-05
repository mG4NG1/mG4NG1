import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Message, Person } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Avatar, Button } from "@/src/components/ui";
import { useSubscription } from "@/src/lib/revenuecat";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ChatScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const other = useQuery({ queryKey: ["person", id], queryFn: () => api<Person>(`/users/${id}`) });
  const msgs = useQuery({ queryKey: ["messages", id], queryFn: () => api<Message[]>(`/messages/${id}`), refetchInterval: 4000 });
  const data = msgs.data ?? [];
  const theyMessaged = data.some((m) => m.from_id === id);
  const canSend = isSubscribed || theyMessaged;

  useEffect(() => {
    if (data.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [data.length]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setError(null);
    try {
      await api("/messages", { method: "POST", body: { to_user_id: id, text: t } });
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.root} testID="chat-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable onPress={() => router.back()} style={s.back} testID="chat-back-button">
          <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
        </Pressable>
        <Pressable style={s.headInfo} onPress={() => router.push(`/person/${id}`)} testID="chat-open-profile">
          <Avatar name={other.data?.name} picture={other.data?.picture} kind={other.data?.picture_kind} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={s.headName} numberOfLines={1} testID="chat-other-name">{other.data?.name ?? ""}</Text>
            <Text style={s.headSub} numberOfLines={1}>{other.data?.trade ?? ""}</Text>
          </View>
        </Pressable>
      </View>

      {msgs.isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          ref={listRef}
          testID="message-list"
          data={data}
          keyExtractor={(m) => m.message_id}
          style={{ flex: 1 }}
          contentContainerStyle={s.list}
          keyboardDismissMode="interactive"
          ListEmptyComponent={<Text style={s.empty}>Say g'day to start the conversation.</Text>}
          renderItem={({ item }) => {
            const mine = item.from_id === user?.user_id;
            return (
              <View style={[s.bubble, mine ? s.mine : s.theirs]} testID={`message-${item.message_id}`}>
                <Text style={[s.bubbleText, mine && s.mineText]}>{item.text}</Text>
              </View>
            );
          }}
        />
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[s.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {error ? <Text style={s.error} testID="chat-error">{error}</Text> : null}
          {canSend ? (
            <View style={s.inputRow}>
              <TextInput
                testID="chat-input"
                style={s.input}
                value={text}
                onChangeText={setText}
                placeholder="Message"
                placeholderTextColor={colors.muted}
                multiline
              />
              <Pressable testID="chat-send-button" onPress={send} disabled={!text.trim() || sending} style={[s.send, (!text.trim() || sending) && { opacity: 0.4 }]}>
                {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="arrow-up" size={22} color={colors.onBrandPrimary} />}
              </Pressable>
            </View>
          ) : (
            <View style={s.locked} testID="chat-locked">
              <Text style={s.lockedText}>Free members can reply once someone messages them. Upgrade to start chats.</Text>
              <Button small label="Upgrade to Pro" icon="star" onPress={() => router.push("/paywall")} testID="chat-upgrade-button" />
            </View>
          )}
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headName: { fontSize: font.lg, fontWeight: "700", color: c.onSurface },
  headSub: { fontSize: font.sm, color: c.muted },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { textAlign: "center", color: c.muted, marginTop: spacing.xxl },
  bubble: { maxWidth: "80%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: 18 },
  mine: { alignSelf: "flex-end", backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: font.lg, color: c.onSurface, lineHeight: 21 },
  mineText: { color: c.onBrandPrimary },
  composer: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.divider, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    backgroundColor: c.surfaceTertiary,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: font.lg,
    color: c.onSurface,
  },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  locked: { gap: spacing.sm, alignItems: "center", paddingVertical: spacing.xs },
  lockedText: { color: c.muted, fontSize: font.base, textAlign: "center" },
  error: { color: c.error, fontSize: font.sm, marginBottom: spacing.xs },
}));
