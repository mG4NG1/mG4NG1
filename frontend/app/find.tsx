import { useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Person } from "@/src/api";
import { PermissionPrompt, PermState } from "@/src/components/permission-prompt";
import { ConnectionAction, EmptyState, Notice, PersonRow, SectionHeader, TradeChips } from "@/src/components/ui";
import { useAddPerson, useTrades } from "@/src/hooks";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function FindPeople() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const trades = useTrades();
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState<string | null>(null);
  const [perm, setPerm] = useState<PermState>(null);
  const [syncing, setSyncing] = useState(false);
  const [contactPhones, setContactPhones] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const add = useAddPerson();

  const search = useQuery({
    queryKey: ["search", q.trim(), trade],
    queryFn: () => api<Person[]>(`/search?q=${encodeURIComponent(q.trim())}${trade ? `&trade=${encodeURIComponent(trade)}` : ""}`),
  });
  const matches = useQuery({
    queryKey: ["contacts-match", contactPhones?.length],
    queryFn: () => api<Person[]>("/contacts/match", { method: "POST", body: { phones: contactPhones } }),
    enabled: !!contactPhones?.length,
  });

  const syncContacts = async () => {
    if (Platform.OS === "web") {
      setNotice("Contact sync works in the phone app. Search by number here instead.");
      return;
    }
    setSyncing(true);
    try {
      let p = await Contacts.getPermissionsAsync();
      if (p.status !== "granted" && p.canAskAgain) p = await Contacts.requestPermissionsAsync();
      setPerm({ status: p.status as any, canAskAgain: p.canAskAgain });
      if (p.status !== "granted") return;
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      const phones = data.flatMap((c) => (c.phoneNumbers ?? []).map((n) => n.number ?? "")).filter(Boolean);
      setContactPhones(phones);
      if (!phones.length) setNotice("No phone numbers found in your contacts.");
    } catch (e: any) {
      setNotice(e?.message ?? "Couldn't read contacts");
    } finally {
      setSyncing(false);
    }
  };

  const onAdd = (p: Person) => add.mutate(p, { onSuccess: () => setNotice(`Request sent to ${p.name}`) });

  const renderPerson = (p: Person) => (
    <PersonRow
      key={p.user_id}
      testID={`person-row-${p.user_id}`}
      person={p}
      subtitle={p.suburb}
      onPress={() => router.push(`/person/${p.user_id}`)}
      right={<ConnectionAction person={p} onAdd={() => onAdd(p)} busy={add.isPending && add.variables?.user_id === p.user_id} />}
    />
  );

  const showContactsPrompt = !contactPhones;

  return (
    <View style={s.root} testID="find-people-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={s.titleRow}>
          <Pressable onPress={() => router.back()} style={s.back} testID="find-back-button">
            <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
          </Pressable>
          <Text style={s.title}>Find people</Text>
        </View>
        <View style={s.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="find-search-input"
            style={[s.input, Platform.OS === "web" && ({ outlineStyle: "none" } as any)]}
            value={q}
            onChangeText={setQ}
            placeholder="Name, business or mobile number"
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} testID="find-clear-button" hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <TradeChips trades={trades.data ?? []} value={trade} onChange={setTrade} testIDPrefix="find-trade" />
      <FlatList
        data={search.data ?? []}
        keyExtractor={(p) => p.user_id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListHeaderComponent={
          <View>
            {notice ? (
              <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
                <Notice text={notice} testID="find-notice" />
              </View>
            ) : null}
            {showContactsPrompt ? (
              <PermissionPrompt
                testID="contacts-permission"
                icon="call-outline"
                title="Find tradies you already know"
                body="We check your phone contacts for numbers already on SubbieNet. Your contacts are never stored or shared."
                perm={perm}
                onAllow={syncContacts}
                loading={syncing}
                allowLabel="Sync my contacts"
              />
            ) : (
              <>
                <SectionHeader title={`From your contacts · ${matches.data?.length ?? 0}`} />
                {matches.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
                {(matches.data ?? []).map((p, i) => (
                  <View key={p.user_id}>
                    {i > 0 ? <View style={s.sep} /> : null}
                    {renderPerson(p)}
                  </View>
                ))}
                {matches.data && !matches.data.length ? (
                  <Text style={s.hint} testID="contacts-no-matches">None of your contacts are on SubbieNet yet.</Text>
                ) : null}
                <Pressable onPress={() => router.push("/invite")} style={s.inviteRow} testID="find-invite-link">
                  <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.onBrandTertiary} />
                  <Text style={s.inviteText}>Invite mates who aren&apos;t on SubbieNet yet</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.onBrandTertiary} />
                </Pressable>
              </>
            )}
            <SectionHeader title={q.trim() ? "Search results" : "People on SubbieNet"} />
            {search.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          </View>
        }
        renderItem={({ item }) => renderPerson(item)}
        ListEmptyComponent={
          search.isLoading ? null : (
            <EmptyState testID="find-empty" icon="search-outline" title="No one found" body="Try a different name or the full mobile number." />
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -spacing.md },
  title: { fontSize: font.xxl, fontWeight: "800", color: c.onSurface },
  search: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.surfaceTertiary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: font.lg, color: c.onSurface, height: 44 },
  sep: { height: 1, backgroundColor: c.divider, marginLeft: 72 },
  hint: { color: c.muted, fontSize: font.base, paddingHorizontal: spacing.lg },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: c.brandTertiary, borderRadius: radius.md },
  inviteText: { flex: 1, color: c.onBrandTertiary, fontWeight: "600", fontSize: font.base },
}));
