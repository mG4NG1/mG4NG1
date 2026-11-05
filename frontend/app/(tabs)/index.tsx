import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, CrewMember } from "@/src/api";
import { Button, EmptyState, LockedCard, PersonRow, TradeChips } from "@/src/components/ui";
import { useIncomingRequests, useTrades } from "@/src/hooks";
import { useSubscription } from "@/src/lib/revenuecat";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function CrewScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const { isSubscribed } = useSubscription();
  const trades = useTrades();
  const [trade, setTrade] = useState<string | null>(null);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<{ crew: number; sent_pending: number; incoming: number }>("/connections/stats") });
  const crew = useQuery({ queryKey: ["crew"], queryFn: () => api<CrewMember[]>("/connections"), enabled: isSubscribed });
  const requests = useIncomingRequests();

  const sections = useMemo(() => {
    const list = (crew.data ?? []).filter((m) => !trade || m.trade === trade);
    const map = new Map<string, CrewMember[]>();
    list.forEach((m) => {
      const k = m.trade || "Other";
      map.set(k, [...(map.get(k) ?? []), m]);
    });
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [crew.data, trade]);

  const pending = requests.data?.length ?? 0;

  const header = (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={s.titleRow}>
        <Text style={s.title}>My Crew</Text>
        <Pressable testID="open-find-people-button" onPress={() => router.push("/find")} style={s.iconBtn}>
          <Ionicons name="person-add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <Pressable testID="find-people-search-bar" onPress={() => router.push("/find")} style={s.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <Text style={s.searchText}>Search name or mobile number</Text>
      </Pressable>
      {pending > 0 ? (
        <Pressable testID="pending-requests-banner" onPress={() => router.push("/(tabs)/inbox")} style={s.banner}>
          <Ionicons name="notifications" size={18} color={colors.onBrandTertiary} />
          <Text style={s.bannerText}>
            {pending} new crew request{pending > 1 ? "s" : ""}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onBrandTertiary} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={s.root} testID="crew-screen">
      {header}
      <TradeChips trades={trades.data ?? []} value={trade} onChange={setTrade} />
      {!isSubscribed ? (
        <View style={{ flex: 1, paddingBottom: bottomChrome }}>
          <View style={s.statsRow}>
            <Stat label="In your crew" value={stats.data?.crew} testID="stat-crew-count" />
            <Stat label="Requests sent" value={stats.data?.sent_pending} testID="stat-sent-count" />
            <Stat label="Waiting on you" value={stats.data?.incoming} testID="stat-incoming-count" />
          </View>
          <LockedCard
            testID="crew-locked"
            title="See who's in your crew"
            body="Pro shows who accepted your requests, their mobile numbers, chat and the crew map."
            onUpgrade={() => router.push("/paywall")}
          />
        </View>
      ) : crew.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brandPrimary} />
      ) : (
        <SectionList
          testID="crew-list"
          sections={sections}
          keyExtractor={(m) => m.user_id}
          contentContainerStyle={{ paddingBottom: bottomChrome + spacing.lg }}
          refreshControl={<RefreshControl refreshing={crew.isRefetching} onRefresh={() => crew.refetch()} tintColor={colors.brandPrimary} />}
          renderSectionHeader={({ section }) => (
            <Text style={s.section}>
              {section.title.toUpperCase()} · {section.data.length}
            </Text>
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => (
            <PersonRow
              testID={`crew-member-${item.user_id}`}
              person={item}
              subtitle={item.business_name || item.suburb}
              onPress={() => router.push(`/person/${item.user_id}`)}
              right={<Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              testID="crew-empty"
              icon="people-outline"
              title={trade ? `No ${trade.toLowerCase()}s yet` : "Build your crew"}
              body="Sync your contacts or search by mobile number to add subbies you trust."
              action={<Button label="Find people" icon="person-add" onPress={() => router.push("/find")} testID="crew-empty-find-button" />}
            />
          }
        />
      )}
    </View>
  );
}

function Stat({ label, value, testID }: { label: string; value?: number; testID: string }) {
  const s = useStyles();
  return (
    <View style={s.stat}>
      <Text style={s.statValue} testID={testID}>
        {value ?? "–"}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 32, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  search: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.surfaceTertiary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchText: { color: c.muted, fontSize: font.lg },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bannerText: { flex: 1, color: c.onBrandTertiary, fontWeight: "600", fontSize: font.base },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  stat: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  statValue: { fontSize: font.xxl, fontWeight: "800", color: c.onSurface },
  statLabel: { fontSize: font.sm, color: c.muted, marginTop: 2 },
  section: { fontSize: font.sm, fontWeight: "600", color: c.muted, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, backgroundColor: c.surface },
  sep: { height: 1, backgroundColor: c.divider, marginLeft: 72 },
}));
