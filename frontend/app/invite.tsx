import { useMemo, useState } from "react";
import { FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, InviteResult } from "@/src/api";
import { PermissionPrompt, PermState } from "@/src/components/permission-prompt";
import { Button, EmptyState, Notice, SectionHeader } from "@/src/components/ui";
import { useSmsStatus } from "@/src/hooks";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Contact = { id: string; name: string; phone: string };

const keyOf = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length >= 6 ? d.slice(-9) : "";
};

// Text mates who aren't on SubbieNet yet. Contact names stay on the phone; only the
// numbers you choose to invite are sent to the server.
export default function InviteScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sms = useSmsStatus();
  const [manual, setManual] = useState("");
  const [q, setQ] = useState("");
  const [perm, setPerm] = useState<PermState>(null);
  const [syncing, setSyncing] = useState(false);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [memberKeys, setMemberKeys] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, "sending" | "sent" | string>>({});
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" | "success" } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const loadContacts = async () => {
    if (Platform.OS === "web") {
      setNotice({ text: "Contact access works in the phone app. Type a number below to invite someone.", tone: "info" });
      return;
    }
    setSyncing(true);
    try {
      let p = await Contacts.getPermissionsAsync();
      if (p.status !== "granted" && p.canAskAgain) p = await Contacts.requestPermissionsAsync();
      setPerm({ status: p.status as any, canAskAgain: p.canAskAgain });
      if (p.status !== "granted") return;
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      const seen = new Set<string>();
      const list: Contact[] = [];
      data.forEach((c) => {
        (c.phoneNumbers ?? []).forEach((n) => {
          const k = keyOf(n.number ?? "");
          if (!k || seen.has(k)) return;
          seen.add(k);
          list.push({ id: `${c.id}-${k}`, name: c.name || n.number || "Unknown", phone: n.number! });
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(list);
      const r = await api<{ member_keys: string[] }>("/contacts/check", { method: "POST", body: { phones: list.map((c) => c.phone) } });
      setMemberKeys(new Set(r.member_keys));
      setMemberCount(r.member_keys.length);
    } catch (e: any) {
      setNotice({ text: e?.message ?? "Couldn't read contacts", tone: "error" });
    } finally {
      setSyncing(false);
    }
  };
  const [memberCount, setMemberCount] = useState(0);

  const invite = async (phones: string[], ids: string[]) => {
    setNotice(null);
    setStatus((m) => ({ ...m, ...Object.fromEntries(ids.map((i) => [i, "sending"])) }));
    try {
      const r = await api<InviteResult>("/invites", { method: "POST", body: { phones } });
      setRemaining(r.remaining_today);
      const next: Record<string, string> = {};
      r.results.forEach((res, i) => {
        next[ids[i]] = res.ok ? "sent" : res.error || "Failed";
      });
      setStatus((m) => ({ ...m, ...next }));
      if (r.sent) setNotice({ text: `Invite text sent${r.sent > 1 ? ` to ${r.sent} people` : ""}.`, tone: "success" });
      else if (r.results[0]?.error) setNotice({ text: r.results[0].error, tone: "error" });
    } catch (e: any) {
      setStatus((m) => ({ ...m, ...Object.fromEntries(ids.map((i) => [i, e.message])) }));
      setNotice({ text: e.message, tone: "error" });
    }
  };

  const visible = useMemo(() => {
    const list = (contacts ?? []).filter((c) => !memberKeys.has(keyOf(c.phone)));
    const needle = q.trim().toLowerCase();
    return (needle ? list.filter((c) => c.name.toLowerCase().includes(needle) || c.phone.includes(needle)) : list).slice(0, 200);
  }, [contacts, memberKeys, q]);

  const smsReady = !!sms.data?.messaging;

  return (
    <View style={s.root} testID="invite-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={s.titleRow}>
          <Pressable onPress={() => router.back()} style={s.back} testID="invite-back-button">
            <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
          </Pressable>
          <Text style={s.title}>Invite mates</Text>
        </View>
        <Text style={s.lead}>Text an invite to subbies who aren&apos;t on SubbieNet yet. Your contact list stays on your phone.</Text>
      </View>

      <FlatList
        data={smsReady ? visible : []}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm }}>
            {sms.isLoading ? null : !smsReady ? (
              <View style={{ padding: spacing.lg }}>
                <Notice text="Text invites aren't switched on yet. Once SMS is set up you can invite mates straight from here." testID="invite-sms-off" />
              </View>
            ) : (
              <>
                {notice ? (
                  <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
                    <Notice text={notice.text} tone={notice.tone} testID="invite-notice" />
                  </View>
                ) : null}
                <SectionHeader title="Invite by mobile number" />
                <View style={s.manualRow}>
                  <TextInput
                    testID="invite-phone-input"
                    style={s.input}
                    value={manual}
                    onChangeText={setManual}
                    keyboardType="phone-pad"
                    placeholder="e.g. 0412 345 678"
                    placeholderTextColor={colors.muted}
                  />
                  <Button
                    small
                    label={status.manual === "sending" ? "Sending" : "Send invite"}
                    icon="paper-plane"
                    loading={status.manual === "sending"}
                    disabled={manual.replace(/\D/g, "").length < 6}
                    onPress={() => invite([manual], ["manual"]).then(() => setManual(""))}
                    testID="invite-send-manual-button"
                  />
                </View>
                {remaining != null ? <Text style={s.remaining}>{remaining} invites left today</Text> : null}

                {!contacts ? (
                  <PermissionPrompt
                    testID="invite-contacts-permission"
                    icon="people-outline"
                    title="Pick from your contacts"
                    body="See which of your contacts aren't on SubbieNet yet and text them an invite. Names and numbers are only read on your phone."
                    perm={perm}
                    onAllow={loadContacts}
                    loading={syncing}
                    allowLabel="Choose from contacts"
                  />
                ) : (
                  <>
                    <SectionHeader title={`Not on SubbieNet yet · ${visible.length}${memberCount ? ` (${memberCount} already members)` : ""}`} />
                    <View style={s.search}>
                      <Ionicons name="search" size={16} color={colors.muted} />
                      <TextInput testID="invite-search-input" style={s.searchInput} value={q} onChangeText={setQ} placeholder="Search contacts" placeholderTextColor={colors.muted} />
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const st = status[item.id];
          return (
            <View style={s.row} testID={`invite-contact-${item.id}`}>
              <View style={s.initial}>
                <Text style={s.initialText}>{item.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                <Text style={s.phone} numberOfLines={1}>{st && st !== "sent" && st !== "sending" ? st : item.phone}</Text>
              </View>
              {st === "sent" ? (
                <View style={s.sentPill}>
                  <Ionicons name="checkmark" size={14} color={colors.success} />
                  <Text style={s.sentText}>Sent</Text>
                </View>
              ) : (
                <Button small variant="outline" label="Invite" loading={st === "sending"} onPress={() => invite([item.phone], [item.id])} testID={`invite-button-${item.id}`} />
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          contacts && smsReady ? <EmptyState testID="invite-empty" icon="checkmark-done-outline" title="Everyone's already here" body="All your contacts are on SubbieNet. Nice crew." /> : undefined
        }
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -spacing.md },
  title: { fontSize: font.xxl, fontWeight: "800", color: c.onSurface },
  lead: { fontSize: font.base, color: c.muted, lineHeight: 20 },
  manualRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  input: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, paddingHorizontal: spacing.lg, fontSize: font.lg, color: c.onSurface },
  remaining: { paddingHorizontal: spacing.lg, color: c.muted, fontSize: font.sm },
  search: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: font.base, color: c.onSurface, height: 40 },
  sep: { height: 1, backgroundColor: c.divider, marginLeft: 72 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.surfaceSecondary, minHeight: 64 },
  initial: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  initialText: { fontSize: font.lg, fontWeight: "700", color: c.onSurfaceTertiary },
  name: { fontSize: font.lg, fontWeight: "600", color: c.onSurface },
  phone: { fontSize: font.base, color: c.muted, marginTop: 2 },
  sentPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm },
  sentText: { color: c.success, fontWeight: "600", fontSize: font.base },
}));
