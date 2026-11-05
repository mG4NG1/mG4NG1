import { useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import { api, CrewMember, Person, User } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CrewMap } from "@/src/components/crew-map";
import { PermissionPrompt, PermState } from "@/src/components/permission-prompt";
import { Button, ConnectionAction, EmptyState, LockedCard, Notice, PersonRow, SectionHeader } from "@/src/components/ui";
import { useAddPerson } from "@/src/hooks";
import { useSubscription } from "@/src/lib/revenuecat";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, spacing, useTheme } from "@/src/theme";

const QUICK_MSG = "G'day mate, you looking for work? I've got a job on nearby and could use a hand.";

export default function RadarScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const qc = useQueryClient();
  const { user, setUser } = useAuth();
  const { isSubscribed } = useSubscription();
  const add = useAddPerson();
  const [perm, setPerm] = useState<PermState>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<string | null>(null);

  const hasArea = user?.approx_lat != null;
  const nearby = useQuery({
    queryKey: ["nearby"],
    queryFn: () => api<Person[]>("/nearby"),
    enabled: isSubscribed && hasArea,
  });
  const crew = useQuery({ queryKey: ["crew"], queryFn: () => api<CrewMember[]>("/connections"), enabled: isSubscribed });

  const shareArea = async () => {
    setLocating(true);
    setLocError(null);
    try {
      let p = await Location.getForegroundPermissionsAsync();
      if (p.status !== "granted" && p.canAskAgain) p = await Location.requestForegroundPermissionsAsync();
      setPerm({ status: p.status as any, canAskAgain: p.canAskAgain });
      if (p.status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let suburb: string | null = null;
      if (Platform.OS !== "web") {
        try {
          const [g] = await Location.reverseGeocodeAsync(pos.coords);
          suburb = g?.district || g?.city || g?.subregion || null;
        } catch {}
      }
      const u = await api<User>("/location", { method: "POST", body: { lat: pos.coords.latitude, lng: pos.coords.longitude, suburb } });
      setUser(u);
      qc.invalidateQueries({ queryKey: ["nearby"] });
    } catch (e: any) {
      setLocError(e?.message ?? "Couldn't get your location");
    } finally {
      setLocating(false);
    }
  };

  const quickMessage = async (p: Person) => {
    setSending(p.user_id);
    try {
      await api("/messages", { method: "POST", body: { to_user_id: p.user_id, text: QUICK_MSG } });
      setSentTo((m) => ({ ...m, [p.user_id]: true }));
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } finally {
      setSending(null);
    }
  };

  const points = (crew.data ?? [])
    .filter((m) => m.approx_lat != null && m.approx_lng != null)
    .map((m) => ({ id: m.user_id, name: m.name, trade: m.trade, lat: m.approx_lat!, lng: m.approx_lng! }));

  return (
    <View style={s.root} testID="radar-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={s.title}>Radar</Text>
        <Text style={s.sub} testID="radar-area-label">
          {hasArea ? `Your area: ${user?.suburb || "shared"} · within 25 km` : "Share your area to find and be found"}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}>
        {locError ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <Notice text={locError} tone="error" testID="radar-location-error" />
          </View>
        ) : null}
        {!hasArea ? (
          <PermissionPrompt
            testID="location-permission"
            icon="location-outline"
            title="Share your approximate area"
            body="Contractors nearby can find you for work. Only your rough suburb area is saved, never your exact spot."
            perm={perm}
            onAllow={shareArea}
            loading={locating}
            allowLabel="Share my area"
          />
        ) : null}

        {!isSubscribed ? (
          <LockedCard
            testID="radar-locked"
            title="Find subbies near you"
            body="Pro unlocks the crew map and lets you message tradies within 25 km: “Hey mate, looking for work?”"
            onUpgrade={() => router.push("/paywall")}
          />
        ) : (
          <>
            {hasArea ? (
              <CrewMap center={{ lat: user!.approx_lat!, lng: user!.approx_lng! }} points={points} onSelect={(id) => router.push(`/person/${id}`)} />
            ) : null}
            {hasArea ? (
              <View style={s.refresh}>
                <Text style={s.mapNote}>Circles show approximate areas only.</Text>
                <Button small variant="outline" label="Update my area" icon="locate" onPress={shareArea} loading={locating} testID="radar-update-area-button" />
              </View>
            ) : null}
            <SectionHeader title={`Nearby subbies · ${nearby.data?.length ?? 0}`} />
            {nearby.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
            {hasArea && nearby.data && !nearby.data.length ? (
              <EmptyState testID="nearby-empty" icon="radio-outline" title="No subbies nearby yet" body="Invite tradies you know to join so they show up here." />
            ) : null}
            {(nearby.data ?? []).map((p) => (
              <View key={p.user_id} style={s.nearCard} testID={`nearby-${p.user_id}`}>
                <PersonRow
                  person={p}
                  subtitle={`${p.distance_km ?? "?"} km away${p.suburb ? ` · ${p.suburb}` : ""}`}
                  onPress={() => router.push(`/person/${p.user_id}`)}
                  right={<ConnectionAction person={p} onAdd={() => add.mutate(p)} />}
                />
                <View style={s.quick}>
                  <Button
                    testID={`quick-message-${p.user_id}`}
                    variant={sentTo[p.user_id] ? "outline" : "dark"}
                    icon={sentTo[p.user_id] ? "checkmark" : "paper-plane"}
                    label={sentTo[p.user_id] ? "Sent" : "Looking for work? Send"}
                    disabled={sentTo[p.user_id]}
                    loading={sending === p.user_id}
                    onPress={() => quickMessage(p)}
                  />
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 2 },
  title: { fontSize: 32, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: font.base, color: c.muted },
  refresh: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, gap: spacing.md },
  mapNote: { flex: 1, color: c.muted, fontSize: font.sm },
  nearCard: { backgroundColor: c.surfaceSecondary, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: 12, overflow: "hidden" },
  quick: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
}));
