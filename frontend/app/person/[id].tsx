import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, CrewMember, Person, Post } from "@/src/api";
import { PostCard } from "@/src/components/post-card";
import { Avatar, Button, Notice, SectionHeader, TradeBadge, VerifiedBadge } from "@/src/components/ui";
import { useAddPerson } from "@/src/hooks";
import { useSubscription } from "@/src/lib/revenuecat";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function PersonScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSubscribed } = useSubscription();
  const add = useAddPerson();
  const [notice, setNotice] = useState<string | null>(null);

  const person = useQuery({ queryKey: ["person", id], queryFn: () => api<Person>(`/users/${id}`) });
  const crew = useQuery({ queryKey: ["crew"], queryFn: () => api<CrewMember[]>("/connections"), enabled: isSubscribed });
  const board = useQuery({ queryKey: ["posts", "by-user", id], queryFn: () => api<Post[]>(`/posts/by-user/${id}`), enabled: isSubscribed });
  const member = crew.data?.find((m) => m.user_id === id);
  const p = person.data;

  return (
    <View style={s.root} testID="person-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={s.back} testID="person-back-button">
          <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
        </Pressable>
      </View>
      {!p ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brandPrimary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
          <View style={s.hero}>
            <Avatar name={p.name} picture={p.picture} kind={p.picture_kind} size={96} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={s.name} testID="person-name">{p.name}</Text>
              {p.phone_verified ? <VerifiedBadge /> : null}
            </View>
            <View style={{ alignItems: "center" }}>
              <TradeBadge trade={p.trade} />
            </View>
            {p.business_name ? <Text style={s.biz} testID="person-business">{p.business_name}</Text> : null}
            {p.suburb ? (
              <View style={s.loc}>
                <Ionicons name="location-outline" size={14} color={colors.muted} />
                <Text style={s.locText}>{p.suburb}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.actions}>
            {notice ? <Notice text={notice} tone="success" testID="person-notice" /> : null}
            {p.connection !== "connected" ? (
              p.connection === "sent" ? (
                <Notice text="Crew request sent. You'll see when they accept with Pro." testID="person-request-sent" />
              ) : (
                <Button
                  testID="person-add-button"
                  label={p.connection === "received" ? "Accept crew request" : "Add to my crew"}
                  icon="person-add"
                  loading={add.isPending}
                  onPress={() => add.mutate(p, { onSuccess: () => setNotice(p.connection === "received" ? "Added to your crew" : "Request sent") })}
                />
              )
            ) : null}

            {isSubscribed ? (
              <View style={s.row2}>
                <Button
                  style={{ flex: 1 }}
                  variant="dark"
                  icon="chatbubble-ellipses"
                  label="Message"
                  testID="person-message-button"
                  onPress={() => router.push(`/chat/${p.user_id}`)}
                />
                {member?.phone ? (
                  <Button
                    style={{ flex: 1 }}
                    icon="call"
                    label="Call"
                    testID="person-call-button"
                    onPress={() => Linking.openURL(`tel:${member.phone}`)}
                  />
                ) : null}
              </View>
            ) : (
              <Pressable style={s.lockRow} onPress={() => router.push("/paywall")} testID="person-locked-contact">
                <Ionicons name="lock-closed" size={18} color={colors.onBrandTertiary} />
                <Text style={s.lockText}>Upgrade to Pro to message or call {p.name.split(" ")[0]}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.onBrandTertiary} />
              </Pressable>
            )}
            {isSubscribed && member?.phone ? (
              <Text style={s.phone} testID="person-phone">{member.phone}</Text>
            ) : null}
          </View>

          {p.bio ? (
            <View style={s.card}>
              <Text style={s.cardLabel}>ABOUT</Text>
              <Text style={s.bio}>{p.bio}</Text>
            </View>
          ) : null}

          {isSubscribed && board.data?.length ? (
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <SectionHeader title={`${p.name.split(" ")[0]}'s board`} />
              {board.data.map((post) => (
                <PostCard key={post.post_id} post={post} onPress={() => router.push(`/post/${post.post_id}`)} testID={`person-post-${post.post_id}`} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -spacing.md },
  hero: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  name: { fontSize: font.xxl, fontWeight: "800", color: c.onSurface },
  biz: { fontSize: font.lg, color: c.onSurfaceTertiary, fontWeight: "600" },
  loc: { flexDirection: "row", alignItems: "center", gap: 4 },
  locText: { color: c.muted, fontSize: font.base },
  actions: { paddingHorizontal: spacing.lg, gap: spacing.md },
  row2: { flexDirection: "row", gap: spacing.md },
  lockRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.brandTertiary, padding: spacing.lg, borderRadius: radius.md },
  lockText: { flex: 1, color: c.onBrandTertiary, fontWeight: "600" },
  phone: { textAlign: "center", color: c.muted, fontSize: font.base },
  card: { margin: spacing.lg, padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, gap: spacing.sm },
  cardLabel: { fontSize: font.sm, fontWeight: "600", color: c.muted },
  bio: { fontSize: font.lg, color: c.onSurface, lineHeight: 22 },
}));
