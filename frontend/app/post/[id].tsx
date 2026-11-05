import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, payLabel, Post } from "@/src/api";
import { PostTypePill, timeAgo } from "@/src/components/post-card";
import { Button, EmptyState, Notice, PersonRow, SectionHeader } from "@/src/components/ui";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function PostDetailScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = useQuery({ queryKey: ["post", id], queryFn: () => api<Post>(`/posts/${id}`) });
  const p = post.data;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/work"));

  const keen = async () => {
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Post>(`/posts/${p.post_id}/keen`, { method: "POST" });
      qc.setQueryData(["post", id], updated);
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    const doClose = async () => {
      setBusy(true);
      try {
        await api(`/posts/${id}`, { method: "DELETE" });
        qc.invalidateQueries({ queryKey: ["posts"] });
        goBack();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") return void doClose();
    Alert.alert("Close this post?", "It will disappear from everyone's board.", [
      { text: "Keep it", style: "cancel" },
      { text: "Close post", style: "destructive", onPress: doClose },
    ]);
  };

  return (
    <View style={s.root} testID="post-detail-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={goBack} style={s.back} testID="post-back-button">
          <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{p?.type === "work" ? "Looking for work" : "Job"}</Text>
      </View>

      {post.isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xxl }} />
      ) : !p ? (
        <EmptyState testID="post-missing" icon="alert-circle-outline" title="Post not available" body={(post.error as Error)?.message ?? "It may have been closed or expired."} />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xxl + 60 }]}>
          <View style={s.topRow}>
            <PostTypePill type={p.type} />
            <Text style={s.when}>{timeAgo(p.created_at)} · live until {new Date(p.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text>
          </View>
          <Text style={s.title} testID="post-title">{p.title}</Text>

          <View style={s.facts}>
            <Fact icon="construct-outline" label="Trade" value={p.trade} />
            <Fact icon="cash-outline" label="Pay" value={payLabel(p)} />
            {p.start ? <Fact icon="calendar-outline" label={p.type === "job" ? "Start" : "From"} value={p.start} /> : null}
            {p.duration ? <Fact icon="time-outline" label="Duration" value={p.duration} /> : null}
            {p.suburb || p.distance_km != null ? (
              <Fact icon="location-outline" label="Where" value={[p.suburb, p.distance_km != null ? `${p.distance_km} km away` : null].filter(Boolean).join(" · ")} />
            ) : null}
          </View>

          {p.details ? <Text style={s.details}>{p.details}</Text> : null}

          <SectionHeader title="Posted by" />
          <PersonRow person={p.author} subtitle={p.is_crew ? "In your crew" : p.distance_km != null ? `${p.distance_km} km away` : null} onPress={() => router.push(`/person/${p.author.user_id}`)} testID="post-author-row" />

          {p.mine ? (
            <>
              <SectionHeader title={`Keen (${p.keen_count})`} />
              {p.responders.length ? (
                p.responders.map((r) => (
                  <PersonRow
                    key={r.user_id}
                    person={{ user_id: r.user_id, name: r.name, picture: r.picture, picture_kind: r.picture_kind, trade: r.trade }}
                    subtitle={timeAgo(r.at)}
                    onPress={() => router.push(`/chat/${r.user_id}`)}
                    right={<Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.brandPrimary} />}
                    testID={`post-responder-${r.user_id}`}
                  />
                ))
              ) : (
                <Text style={s.hint}>Nobody&apos;s put their hand up yet. They&apos;ll land in your Inbox when they do.</Text>
              )}
            </>
          ) : null}

          {error ? <Notice text={error} tone="error" testID="post-error" /> : null}
        </ScrollView>
      )}

      {p ? (
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {p.mine ? (
            <Button label="Close post" icon="close-circle-outline" variant="outline" onPress={close} loading={busy} testID="post-close-button" />
          ) : p.keen ? (
            <Button label="You're keen · Open chat" icon="chatbubble-ellipses" variant="dark" onPress={() => router.push(`/chat/${p.author.user_id}`)} testID="post-open-chat-button" />
          ) : (
            <Button label={p.type === "job" ? "I'm keen" : "I've got work for you"} icon="hand-right" onPress={keen} loading={busy} testID="post-keen-button" />
          )}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.fact}>
      <Ionicons name={icon} size={18} color={colors.onBrandTertiary} />
      <View style={{ flex: 1 }}>
        <Text style={s.factLabel}>{label}</Text>
        <Text style={s.factValue}>{value}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -spacing.md },
  headerTitle: { fontSize: font.lg, fontWeight: "700", color: c.onSurface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  when: { color: c.muted, fontSize: font.sm, flexShrink: 1, textAlign: "right" },
  title: { fontSize: font.xxl, fontWeight: "800", color: c.onSurface, lineHeight: 30, letterSpacing: -0.3 },
  facts: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.md, gap: spacing.md },
  fact: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  factLabel: { fontSize: font.sm, color: c.muted },
  factValue: { fontSize: font.lg, fontWeight: "600", color: c.onSurface },
  details: { fontSize: font.lg, color: c.onSurfaceTertiary, lineHeight: 24 },
  hint: { color: c.muted, fontSize: font.base, paddingHorizontal: spacing.lg },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface },
}));
