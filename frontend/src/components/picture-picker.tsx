import { useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, BACKEND_URL, getToken, User } from "@/src/api";
import { Avatar, Button, Notice } from "@/src/components/ui";
import { uploadForm } from "@/src/utils/upload";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Kind = "photo" | "logo";

// Display picture rule: a portrait photo of you, or your business logo. Member chooses which.
export function PicturePicker({ user, onChange }: { user: User; onChange: (u: User) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [kind, setKind] = useState<Kind>(user.picture_kind ?? "photo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<"library" | "camera" | null>(null);

  const upload = async (asset: ImagePicker.ImagePickerAsset) => {
    setBusy(true);
    setError(null);
    try {
      const res = await uploadForm(`${BACKEND_URL}/api/profile/picture`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        fields: { kind },
        files: { file: { uri: asset.uri, name: asset.fileName ?? `picture.${asset.mimeType?.split("/")[1] ?? "jpg"}`, mimeType: asset.mimeType ?? "image/jpeg" } },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Upload failed");
      onChange(data as User);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (source: "library" | "camera") => {
    setError(null);
    if (source === "camera" && Platform.OS === "web") {
      setError("Taking a photo works in the phone app. Choose from your library here.");
      return;
    }
    const get = source === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
    const req = source === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    let p = await get();
    if (!p.granted && p.canAskAgain) p = await req();
    if (!p.granted) {
      if (!p.canAskAgain) setBlocked(source);
      else setError(source === "camera" ? "Camera access is needed to take your photo." : "Photo access is needed to choose a picture.");
      return;
    }
    setBlocked(null);
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets?.[0]) return;
    await upload(result.assets[0]);
  };

  const remove = async () => {
    setBusy(true);
    try {
      onChange(await api<User>("/profile/picture", { method: "DELETE" }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card} testID="picture-picker">
      <View style={s.top}>
        <View>
          <Avatar name={user.name} picture={user.picture} kind={user.picture_kind} size={96} />
          {busy ? <View style={s.busy}><Ionicons name="cloud-upload" size={20} color={colors.onBrandPrimary} /></View> : null}
        </View>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text style={s.title}>Display picture</Text>
          <Text style={s.body}>Use a portrait photo of yourself or your business logo. Nothing else.</Text>
          <View style={s.segment}>
            {(["photo", "logo"] as Kind[]).map((k) => (
              <Pressable key={k} testID={`picture-kind-${k}`} onPress={() => setKind(k)} style={[s.segBtn, kind === k && s.segBtnOn]}>
                <Ionicons name={k === "photo" ? "person" : "business"} size={14} color={kind === k ? colors.onBrandSecondary : colors.muted} />
                <Text style={[s.segText, kind === k && s.segTextOn]}>{k === "photo" ? "Portrait" : "Logo"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
      {blocked ? (
        <View style={s.blocked}>
          <Text style={s.body}>{blocked === "camera" ? "Camera" : "Photo"} access is turned off. Open Settings to allow it.</Text>
          <Button small variant="dark" label="Open Settings" icon="settings-outline" onPress={() => Linking.openSettings()} testID="picture-open-settings" />
        </View>
      ) : null}
      <View style={s.actions}>
        <Button small style={{ flex: 1 }} label={kind === "logo" ? "Choose logo" : "Choose photo"} icon="images" onPress={() => pick("library")} loading={busy} testID="picture-choose-button" />
        {kind === "photo" ? (
          <Button small style={{ flex: 1 }} variant="outline" label="Take photo" icon="camera" onPress={() => pick("camera")} disabled={busy} testID="picture-camera-button" />
        ) : null}
        {user.picture && user.picture.startsWith("/api/") ? (
          <Pressable onPress={remove} disabled={busy} style={s.remove} testID="picture-remove-button" hitSlop={8}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Notice text={error} tone="error" testID="picture-error" /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  busy: { position: "absolute", right: -4, bottom: -4, width: 32, height: 32, borderRadius: 16, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: font.lg, fontWeight: "700", color: c.onSurface },
  body: { fontSize: font.sm, color: c.muted, lineHeight: 18 },
  segment: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.sm + 2, padding: 2, alignSelf: "flex-start" },
  segBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, height: 44, borderRadius: radius.sm },
  segBtnOn: { backgroundColor: c.brandSecondary },
  segText: { fontSize: font.sm, fontWeight: "600", color: c.muted },
  segTextOn: { color: c.onBrandSecondary },
  actions: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  blocked: { gap: spacing.sm },
}));
