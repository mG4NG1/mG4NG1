import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, payLabel } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { spacing, makeStyles, useTheme } from "@/src/theme";

type PublicListing = {
  post_id: string; type: "job" | "work"; trade: string; title: string;
  details?: string | null; suburb?: string | null;
  pay_min?: number | null; pay_max?: number | null;
  author_name: string; created_at: string; expires_at: string;
};
type Category = "all" | "job" | "work";

export default function NoticeboardHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const [category, setCategory] = useState<Category>("all");
  const listings = useQuery({
    queryKey: ["public-posts", category],
    queryFn: () => api<PublicListing[]>(`/posts/public${category === "all" ? "" : `?type=${category}`}`),
    refetchInterval: 60000,
  });

  const openListing = (post: PublicListing) => {
    if (!user) router.push("/login");
    else router.push(`/post/${post.post_id}`);
  };
  const newPost = () => router.push(!user ? "/login" : isSubscribed ? "/post/new" : "/paywall");
  const minutesLeft = (expiry: string) => Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / 3600000));
  const tabs: { id: Category; label: string }[] = [
    { id: "all", label: "All" },
    { id: "job", label: "Need a Tradie" },
    { id: "work", label: "Available for Work" },
  ];
  return (
    <View style={s.root} testID="noticeboard-home">
      <View style={[s.brand, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={s.logo}>Chop<Text style={s.logoOut}>Out!</Text></Text>
          <Text style={s.tagline}>FIND YOUR CREW. GET IT DONE.</Text>
        </View>
        <View style={s.right}>
          <Text style={s.date}>{new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</Text>
          <Pressable onPress={() => router.push(user ? "/(tabs)/profile" : "/login")} accessibilityLabel={user ? "Open profile" : "Sign in"}>
            <Ionicons name="person-circle-outline" size={27} color="#161616" />
          </Pressable>
        </View>
      </View>
      <View style={s.heading}>
        <Text style={s.headingTitle}>Community Noticeboard</Text>
        <Text style={s.headingSub}>Jobs • Help needed • Subcontractors</Text>
      </View>
      <View style={s.filterRow}>
        {tabs.map((tab) => (
          <Pressable key={tab.id} style={[s.filter, category === tab.id && s.filterActive]} onPress={() => setCategory(tab.id)}>
            <Text style={[s.filterText, category === tab.id && s.filterTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={listings.data ?? []}
        keyExtractor={(p) => p.post_id}
        refreshControl={<RefreshControl refreshing={listings.isRefetching} onRefresh={() => listings.refetch()} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 110, gap: 12 }}
        ListHeaderComponent={listings.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
          listings.isError ? <Text style={s.info}>Could not load listings. Pull down to retry.</Text> : null}
        ListEmptyComponent={!listings.isLoading && !listings.isError ?
          <Text style={s.info}>Nothing available right now. New job notices will appear here.</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => openListing(item)} testID={`public-post-${item.post_id}`}>
            <View style={s.cardTop}>
              <Text style={s.trade}>{item.trade}</Text>
              <Text style={s.badge}>{item.type === "job" ? "NEED A TRADIE" : "AVAILABLE FOR WORK"}</Text>
            </View>
            <Text style={s.title}>{item.title}</Text>
            {!!item.details && <Text style={s.desc} numberOfLines={2}>{item.details}</Text>}
            <Text style={s.meta}>{item.suburb || "Location on request"} · {item.author_name}</Text>
            <View style={s.cardBottom}>
              <Text style={s.expiry}>OPEN · Expires in {minutesLeft(item.expires_at)}h</Text>
              <Text style={s.view}>View job ›</Text>
            </View>
          </Pressable>
        )}
      />
      <Pressable style={s.postButton} onPress={newPost} testID="noticeboard-post-button">
        <Ionicons name="add-circle-outline" color="#171717" size={22} />
        <Text style={s.postLabel}>{isSubscribed ? "Post a notice" : "Post a notice · Pro"}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  brand: { backgroundColor: "#FFC400", paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { fontSize: 29, fontWeight: "900", fontStyle: "italic", color: "#101E35", letterSpacing: -1 },
  logoOut: { color: "#FFFFFF" },
  tagline: { fontSize: 9, fontWeight: "800", color: "#2C2C2C", letterSpacing: 1 },
  right: { alignItems: "flex-end", gap: 5 },
  date: { fontSize: 12, fontWeight: "700", color: "#232323" },
  heading: { marginHorizontal: 16, marginTop: 18, marginBottom: 12 },
  headingTitle: { fontSize: 24, fontWeight: "800", color: "#101820" },
  headingSub: { fontSize: 13, color: "#555" },
  filterRow: { flexDirection: "row", gap: 6, marginHorizontal: 16, marginBottom: 14 },
  filter: { flex: 1, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, backgroundColor: "#F2F2F2", alignItems: "center" },
  filterActive: { backgroundColor: "#FFC400" },
  filterText: { fontSize: 11, fontWeight: "700", color: "#454545", textAlign: "center" },
  filterTextActive: { color: "#131313" },
  card: { backgroundColor: "#FFF", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E3E3E3", gap: 7, elevation: 2 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" },
  trade: { fontSize: 12, fontWeight: "800", color: "#303030" },
  badge: { backgroundColor: "#FFF2B0", color: "#313131", paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, fontSize: 10, fontWeight: "800" },
  title: { fontSize: 17, fontWeight: "800", color: "#101820" },
  desc: { fontSize: 13, lineHeight: 19, color: "#454545" },
  meta: { fontSize: 12, color: "#6B6B6B" },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 },
  expiry: { color: "#397A38", fontSize: 11, fontWeight: "700" },
  view: { color: "#101820", fontSize: 12, fontWeight: "800" },
  info: { textAlign: "center", color: "#555", paddingTop: 35 },
  postButton: { position: "absolute", bottom: 12, right: 16, left: 16, backgroundColor: "#FFC400", borderRadius: 14, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, elevation: 4 },
  postLabel: { color: "#171717", fontWeight: "800", fontSize: 15 },
}));
