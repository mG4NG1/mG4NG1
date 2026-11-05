import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Conversation, Person } from "@/src/api";
import { Avatar, Button, EmptyState, PersonRow } from "@/src/components/ui";
import { useIncomingRequests } from "@/src/hooks";
import { useSubscription } from "@/src/lib/revenuecat";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function InboxScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const qc = useQueryClient();
  const { isSubscribed } = useSubscription();
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const convs = useQuery({ queryKey: ["conversations"], queryFn: () => api<Conversation[]>("/conversations"), refetchInterval: 10000 });
  const requests = useIncomingRequests();

  const respond = useMutation({
    mutationFn: ({ p, accept }: { p: Person; accept: boolean }) =>
      api(`/connections/${p.connection_id}/respond`, { method: "POST", body: { accept } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["crew"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const pending = requests.data?.length ?? 0;

  return (
    <View style={s.root} testID="inbox-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={s.title}>Inbox</Text>
        <View style={s.segment}>
          {(["chats", "requests"] as const).map((t) => (
            <Pressable
              key={t}
              testID={`inbox-segment-${t}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab(t);
              }}
              style={[s.segBtn, tab === t && s.segBtnOn]}
            >
              <Text style={[s.segText, tab === t && s.segTextOn]}>
                {t === "chats" ? "Chats" : `Requests${pending ? ` (${pending})` : ""}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === "chats" ? (
        <FlatList
          testID="conversation-list"
          data={convs.data ?? []}
          keyExtractor={(c) => c.other.user_id}
          contentContainerStyle={{ paddingBottom: bottomChrome + spacing.lg, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={convs.isRefetching} onRefresh={() => convs.refetch()} tintColor={colors.brandPrimary} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => (
            <Pressable testID={`conversation-${item.other.user_id}`} onPress={() => router.push(`/chat/${item.other.user_id}`)} style={({ pressed }) => [s.conv, pressed && { opacity: 0.7 }]}>
              <Avatar name={item.other.name} picture={item.other.picture} kind={item.other.picture_kind} size={48} />
              <View style={{ flex: 1 }}>
                <View style={s.convTop}>
                  <Text style={s.convName} numberOfLines={1}>{item.other.name}</Text>
                  <Text style={s.convTime}>{timeAgo(item.last_at)}</Text>
                </View>
                <Text style={s.convText} numberOfLines={2}>
                  {item.last_from_me ? "You: " : ""}
                  {item.last_text}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            convs.isLoading ? (
              <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brandPrimary} />
            ) : (
              <EmptyState
                testID="chats-empty"
                icon="chatbubbles-outline"
                title="No messages yet"
                body={isSubscribed ? "Start a chat from someone in your crew or on the Radar." : "When a contractor messages you about work, it shows up here and you can reply."}
              />
            )
          }
        />
      ) : (
        <FlatList
          testID="request-list"
          data={requests.data ?? []}
          keyExtractor={(p) => p.user_id}
          contentContainerStyle={{ paddingBottom: bottomChrome + spacing.lg, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={requests.isRefetching} onRefresh={() => requests.refetch()} tintColor={colors.brandPrimary} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => (
            <View style={s.reqCard} testID={`request-${item.user_id}`}>
              <PersonRow person={item} onPress={() => router.push(`/person/${item.user_id}`)} />
              <View style={s.reqActions}>
                <Button
                  style={{ flex: 1 }}
                  small
                  variant="outline"
                  label="Decline"
                  testID={`decline-request-${item.user_id}`}
                  onPress={() => respond.mutate({ p: item, accept: false })}
                />
                <Button
                  style={{ flex: 1 }}
                  small
                  label="Accept"
                  icon="checkmark"
                  testID={`accept-request-${item.user_id}`}
                  loading={respond.isPending && respond.variables?.p.user_id === item.user_id && respond.variables.accept}
                  onPress={() => respond.mutate({ p: item, accept: true })}
                />
              </View>
            </View>
          )}
          ListEmptyComponent={
            requests.isLoading ? (
              <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brandPrimary} />
            ) : (
              <EmptyState testID="requests-empty" icon="person-add-outline" title="No crew requests" body="When a contractor adds you to their crew, you can accept it here." />
            )
          }
        />
      )}
      {!isSubscribed && tab === "chats" ? (
        <Pressable testID="inbox-reply-only-note" onPress={() => router.push("/paywall")} style={[s.note, { marginBottom: bottomChrome + spacing.lg }]}>
          <Ionicons name="lock-closed" size={14} color={colors.onBrandTertiary} />
          <Text style={s.noteText}>Free plan: you can reply. Upgrade to start new chats.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 32, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  segment: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 3 },
  segBtn: { flex: 1, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segBtnOn: { backgroundColor: c.surfaceSecondary },
  segText: { fontSize: font.base, fontWeight: "600", color: c.muted },
  segTextOn: { color: c.onSurface },
  sep: { height: 1, backgroundColor: c.divider, marginLeft: 76 },
  conv: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, backgroundColor: c.surfaceSecondary, alignItems: "center" },
  convTop: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  convName: { flex: 1, fontSize: font.lg, fontWeight: "600", color: c.onSurface },
  convTime: { fontSize: font.sm, color: c.muted },
  convText: { fontSize: font.base, color: c.muted, marginTop: 2 },
  reqCard: { backgroundColor: c.surfaceSecondary, paddingBottom: spacing.md },
  reqActions: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md, backgroundColor: c.brandTertiary, borderRadius: radius.md },
  noteText: { flex: 1, color: c.onBrandTertiary, fontSize: font.sm, fontWeight: "600" },
}));
