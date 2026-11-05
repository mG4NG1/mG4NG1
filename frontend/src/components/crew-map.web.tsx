import { Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { font, makeStyles, spacing, useTheme } from "@/src/theme";

export type MapPoint = { id: string; name: string; trade?: string | null; lat: number; lng: number };

// Web preview has no native map; the phone app shows the real map.
export function CrewMap({ points }: { center: { lat: number; lng: number }; points: MapPoint[]; onSelect?: (id: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.wrap} testID="crew-map">
      <Ionicons name="map-outline" size={36} color={colors.brandPrimary} />
      <Text style={s.title}>{points.length} crew areas on the map</Text>
      <Text style={s.body}>Open the app on your phone to see the live map.</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { height: 180, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, gap: spacing.sm },
  title: { fontSize: font.lg, fontWeight: "700", color: c.onSurface },
  body: { fontSize: font.base, color: c.muted },
}));
