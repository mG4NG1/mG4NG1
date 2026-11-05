import React from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { Person, pictureSource } from "@/src/api";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Display picture: a portrait photo is round, a business logo is a rounded square on white.
export function Avatar({
  name,
  picture,
  kind,
  size = 44,
}: {
  name?: string | null;
  picture?: string | null;
  kind?: "photo" | "logo" | null;
  size?: number;
}) {
  const s = useStyles();
  const initials = (name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const src = pictureSource(picture, Platform.OS === "web");
  const shape = { width: size, height: size, borderRadius: kind === "logo" ? size * 0.22 : size / 2 };
  if (src) {
    return (
      <Image
        source={src}
        style={[shape, kind === "logo" && s.logoFrame]}
        contentFit={kind === "logo" ? "contain" : "cover"}
        cachePolicy="memory-disk"
        transition={150}
      />
    );
  }
  return (
    <View style={[s.avatar, shape]}>
      <Text style={[s.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export function VerifiedBadge({ small }: { small?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.verified} testID="verified-badge">
      <Ionicons name="shield-checkmark" size={small ? 12 : 14} color={colors.success} />
      <Text style={[s.verifiedText, small && { fontSize: 11 }]}>Verified</Text>
    </View>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "dark" | "outline" | "ghost";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  testID?: string;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = "primary", icon, loading, disabled, small, testID, style }: BtnProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const bg = {
    primary: colors.brandPrimary,
    dark: colors.brandSecondary,
    outline: colors.surfaceSecondary,
    ghost: "transparent",
  }[variant];
  const fg = {
    primary: colors.onBrandPrimary,
    dark: colors.onBrandSecondary,
    outline: colors.onSurface,
    ghost: colors.onBrandTertiary,
  }[variant];
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === "outline" && s.btnOutline,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 20} color={fg} /> : null}
          <Text style={[s.btnText, small && s.btnTextSmall, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TradeChips({
  trades,
  value,
  onChange,
  testIDPrefix = "trade-chip",
}: {
  trades: string[];
  value: string | null;
  onChange: (t: string | null) => void;
  testIDPrefix?: string;
}) {
  const s = useStyles();
  const all = ["All", ...trades];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.chipRow}
      contentContainerStyle={s.chipRowContent}
    >
      {all.map((t) => {
        const selected = (t === "All" && !value) || t === value;
        return (
          <Pressable
            key={t}
            testID={`${testIDPrefix}-${t.toLowerCase().replace(/\s/g, "-")}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(t === "All" ? null : t);
            }}
            style={[s.chip, selected && s.chipSelected]}
          >
            <Text style={[s.chipText, selected && s.chipTextSelected]}>{t}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TradeBadge({ trade }: { trade?: string | null }) {
  const s = useStyles();
  if (!trade) return null;
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{trade}</Text>
    </View>
  );
}

export function ConnectionAction({
  person,
  onAdd,
  busy,
}: {
  person: Person;
  onAdd: () => void;
  busy?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  if (person.connection === "connected") {
    return (
      <View style={s.statusPill} testID={`status-connected-${person.user_id}`}>
        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
        <Text style={s.statusText}>In crew</Text>
      </View>
    );
  }
  if (person.connection === "sent") {
    return (
      <View style={s.statusPill} testID={`status-sent-${person.user_id}`}>
        <Ionicons name="time-outline" size={16} color={colors.muted} />
        <Text style={s.statusText}>Requested</Text>
      </View>
    );
  }
  return (
    <Button
      small
      testID={`add-person-${person.user_id}`}
      label={person.connection === "received" ? "Accept" : "Add"}
      icon={person.connection === "received" ? "checkmark" : "person-add"}
      onPress={onAdd}
      loading={busy}
    />
  );
}

export function PersonRow({
  person,
  right,
  onPress,
  subtitle,
  testID,
}: {
  person: { user_id: string; name: string; picture?: string | null; picture_kind?: "photo" | "logo" | null; phone_verified?: boolean; trade?: string | null; business_name?: string | null };
  right?: React.ReactNode;
  onPress?: () => void;
  subtitle?: string | null;
  testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.row, pressed && onPress ? { opacity: 0.7 } : null]}
    >
      <Avatar name={person.name} picture={person.picture} kind={person.picture_kind} />
      <View style={s.rowBody}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={s.rowTitle} numberOfLines={1}>
            {person.name}
          </Text>
          {person.phone_verified ? <Ionicons name="shield-checkmark" size={14} color={colors.success} /> : null}
        </View>
        <Text style={s.rowSub} numberOfLines={1}>
          {[person.trade, subtitle ?? person.business_name].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body?: string;
  action?: React.ReactNode;
  testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.empty} testID={testID}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={32} color={colors.brandPrimary} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function LockedCard({ title, body, onUpgrade, testID }: { title: string; body: string; onUpgrade: () => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.locked} testID={testID}>
      <View style={s.lockIcon}>
        <Ionicons name="lock-closed" size={22} color={colors.onBrandPrimary} />
      </View>
      <Text style={s.lockedTitle}>{title}</Text>
      <Text style={s.lockedBody}>{body}</Text>
      <Button label="Upgrade to Pro · $2.99/wk" icon="star" onPress={onUpgrade} testID={`${testID}-upgrade-button`} />
    </View>
  );
}

export function Notice({ text, tone = "info", testID }: { text: string; tone?: "info" | "error" | "success"; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const c = tone === "error" ? colors.error : tone === "success" ? colors.success : colors.onBrandTertiary;
  return (
    <View style={[s.notice, { borderColor: c }]} testID={testID}>
      <Text style={[s.noticeText, { color: c }]}>{text}</Text>
    </View>
  );
}

export function SectionHeader({ title }: { title: string }) {
  const s = useStyles();
  return <Text style={s.section}>{title.toUpperCase()}</Text>;
}

const useStyles = makeStyles((c) => ({
  avatar: { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  logoFrame: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  verified: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  verifiedText: { color: c.success, fontSize: font.sm, fontWeight: "600" },
  btn: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  btnSmall: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  btnOutline: { borderWidth: 1, borderColor: c.border },
  btnText: { fontSize: font.lg, fontWeight: "600" },
  btnTextSmall: { fontSize: font.base },
  chipRow: { flexGrow: 0, height: 56 },
  chipRowContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: c.brandSecondary, borderColor: c.brandSecondary },
  chipText: { fontSize: font.base, fontWeight: "500", color: c.onSurface },
  chipTextSelected: { color: c.onBrandSecondary },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: c.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: { color: c.onBrandTertiary, fontSize: font.sm, fontWeight: "600" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  statusText: { color: c.muted, fontSize: font.base, fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: c.surfaceSecondary,
    minHeight: 64,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: font.lg, fontWeight: "600", color: c.onSurface },
  rowSub: { fontSize: font.base, color: c.muted, marginTop: 2 },
  empty: { alignItems: "center", padding: spacing.xl, gap: spacing.md },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: font.xl, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  emptyBody: { fontSize: font.base, color: c.muted, textAlign: "center", lineHeight: 20 },
  locked: {
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary,
    gap: spacing.md,
    alignItems: "center",
  },
  lockIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: { fontSize: font.xl, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  lockedBody: { fontSize: font.base, color: c.muted, textAlign: "center", lineHeight: 20, marginBottom: spacing.sm },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.surfaceSecondary },
  noticeText: { fontSize: font.base, fontWeight: "500" },
  section: {
    fontSize: font.sm,
    fontWeight: "600",
    color: c.muted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    letterSpacing: 0.5,
  },
}));
