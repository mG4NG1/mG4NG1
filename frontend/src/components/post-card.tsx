import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { payLabel, Post } from "@/src/api";
import { Avatar } from "@/src/components/ui";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function PostTypePill({ type }: { type: Post["type"] }) {
  const s = useStyles();
  const { colors } = useTheme();
  const job = type === "job";
  return (
    <View style={[s.typePill, { backgroundColor: job ? colors.brandPrimary : colors.brandTertiary }]}>
      <Ionicons name={job ? "hammer" : "hand-left"} size={12} color={job ? colors.onBrandPrimary : colors.onBrandTertiary} />
      <Text style={[s.typeText, { color: job ? colors.onBrandPrimary : colors.onBrandTertiary }]}>{job ? "NEEDS A SUBBIE" : "LOOKING FOR WORK"}</Text>
    </View>
  );
}

// Compact job / broadcast card for the Work board.
export function PostCard({ post, onPress, testID }: { post: Post; onPress: () => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const where = post.suburb || (post.distance_km != null ? `${post.distance_km} km away` : null);
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
      <View style={s.cardTop}>
        <PostTypePill type={post.type} />
        <Text style={s.when}>{timeAgo(post.created_at)}</Text>
      </View>
      <Text style={s.title} numberOfLines={2}>{post.title}</Text>
      <View style={s.metaRow}>
        <View style={s.meta}><Ionicons name="construct-outline" size={14} color={colors.muted} /><Text style={s.metaText}>{post.trade}</Text></View>
        <View style={s.meta}><Ionicons name="cash-outline" size={14} color={colors.muted} /><Text style={s.metaText}>{payLabel(post)}</Text></View>
        {post.duration ? <View style={s.meta}><Ionicons name="time-outline" size={14} color={colors.muted} /><Text style={s.metaText}>{post.duration}</Text></View> : null}
        {where ? <View style={s.meta}><Ionicons name="location-outline" size={14} color={colors.muted} /><Text style={s.metaText}>{where}</Text></View> : null}
      </View>
      <View style={s.author}>
        <Avatar name={post.author.name} picture={post.author.picture} kind={post.author.picture_kind} size={28} />
        <Text style={s.authorName} numberOfLines={1}>
          {post.mine ? "You" : post.author.name}
          {post.author.business_name ? ` · ${post.author.business_name}` : ""}
        </Text>
        {post.is_crew ? <View style={s.crewPill}><Text style={s.crewPillText}>CREW</Text></View> : null}
        {post.mine && post.keen_count ? (
          <Text style={s.keenCount}>{post.keen_count} keen</Text>
        ) : post.keen ? (
          <View style={s.keenPill}><Ionicons name="checkmark" size={12} color={colors.success} /><Text style={s.keenText}>Keen</Text></View>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.sm, marginHorizontal: spacing.lg },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  typeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  when: { color: c.muted, fontSize: font.sm },
  title: { fontSize: font.xl, fontWeight: "700", color: c.onSurface, lineHeight: 24 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: c.onSurfaceTertiary, fontSize: font.sm, fontWeight: "600" },
  author: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  authorName: { flex: 1, color: c.muted, fontSize: font.sm },
  crewPill: { backgroundColor: c.brandTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  crewPillText: { color: c.onBrandTertiary, fontSize: 9, fontWeight: "800" },
  keenCount: { color: c.brandPrimary, fontWeight: "700", fontSize: font.sm },
  keenPill: { flexDirection: "row", alignItems: "center", gap: 2 },
  keenText: { color: c.success, fontWeight: "700", fontSize: font.sm },
}));
