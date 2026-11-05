import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Post } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PostCard } from "@/src/components/post-card";
import { EmptyState, LockedCard, Notice, TradeChips } from "@/src/components/ui";
import { useTrades } from "@/src/hooks";
import { useSubscription } from "@/src/lib/revenuecat";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Seg = "all" | "job" | "work" | "mine";
const SEGMENTS: { key: Seg; label: string }[] = [
  { key: "all", label: "All" },
  { key: "job", label: "Jobs" },
  { key: "work", label: "Work wanted" },
  { key: "mine", label: "My board" },
];

// Work board: jobs needing a subbie + "looking for work" broadcasts from your crew and members within 25 km.
export default function WorkScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const trades = useTrades();
  const [seg, setSeg] = useState<Seg>("all");
  const [trade, setTrade] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (seg === "job" || seg === "work") params.set("type", seg);
  if (seg === "mine") params.set("mine", "true");
  if (trade) params.set("trade", trade);
  const qs = params.toString();
  const posts = useQuery({
    queryKey: ["posts", qs],
    queryFn: () => api<Post[]>(`/posts${qs ? `?${qs}` : ""}`),
    enabled: isSubscribed,
  });

  return (
    <View style={s.root} testID="work-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={s.titleRow}>
          <Text style={s.title}>Work</Text>
          {isSubscribed ? (
            <Pressable onPress={() => router.push("/post/new")} style={s.postBtn} testID="work-new-post-button">
              <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
              <Text style={s.postBtnText}>Post</Text>
            </Pressable>
          ) : null}
        </View>
        {isSubscribed ? (
          <>
            <View style={s.segment}>
              {SEGMENTS.map((x) => (
                <Pressable key={x.key} testID={`work-seg-${x.key}`} onPress={() => setSeg(x.key)} style={[s.segBtn, seg === x.key && s.segBtnOn]}>
                  <Text style={[s.segText, seg === x.key && s.segTextOn]}>{x.label}</Text>
                </Pressable>
              ))}
            </View>
            <TradeChips trades={trades.data ?? []} value={trade} onChange={setTrade} testIDPrefix="work-trade" />
          </>
        ) : null}
      </View>

      {!isSubscribed ? (
        <View style={{ padding: spacing.lg }}>
          <LockedCard
            testID="work-locked"
            title="The Work board is a Pro feature"
            body="Post jobs that need a subbie, broadcast that you're looking for work, and see what your crew and tradies within 25 km have on."
            onUpgrade={() => router.push("/paywall")}
          />
        </View>
      ) : (
        <FlatList
          data={posts.data ?? []}
          keyExtractor={(p) => p.post_id}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: bottomChrome + spacing.xl + 56, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={posts.isRefetching} onRefresh={() => posts.refetch()} tintColor={colors.brandPrimary} />}
          ListHeaderComponent={
            <>
              {user?.approx_lat == null ? (
                <View style={{ paddingHorizontal: spacing.lg }}>
                  <Notice text="Share your area on the Radar tab to see posts from tradies within 25 km. Right now you only see your crew's board." testID="work-no-area" />
                </View>
              ) : null}
              {posts.error ? (
                <View style={{ paddingHorizontal: spacing.lg }}>
                  <Notice text={(posts.error as Error).message} tone="error" testID="work-error" />
                </View>
              ) : null}
            </>
          }
          renderItem={({ item }) => <PostCard post={item} onPress={() => router.push(`/post/${item.post_id}`)} testID={`post-card-${item.post_id}`} />}
          ListEmptyComponent={
            posts.isLoading ? undefined : (
              <EmptyState
                testID="work-empty"
                icon={seg === "mine" ? "clipboard-outline" : "briefcase-outline"}
                title={seg === "mine" ? "Nothing on your board" : "Nothing posted yet"}
                body={
                  seg === "mine"
                    ? "Post a job that needs a subbie, or let your crew know you're looking for work."
                    : "When your crew or nearby tradies post jobs or broadcast that they're free, it shows up here."
                }
              />
            )
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingBottom: spacing.sm, gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  title: { fontSize: font.display, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  postBtn: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: c.brandPrimary, paddingLeft: spacing.sm, paddingRight: spacing.md, height: 40, borderRadius: radius.pill },
  postBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: font.base },
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 3 },
  segBtn: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm + 2 },
  segBtnOn: { backgroundColor: c.surfaceSecondary },
  segText: { fontSize: font.sm, fontWeight: "600", color: c.muted },
  segTextOn: { color: c.onSurface, fontWeight: "700" },
}));
