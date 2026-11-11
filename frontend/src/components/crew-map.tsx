import { Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import { useTheme } from "@/src/theme";

export type MapPoint = { id: string; name: string; trade?: string | null; lat: number; lng: number };
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Markers are based on the server's approximate (~2 km grid) areas, not live GPS.
// We don't enable MapLibre's real-time user-location tracking.
export function CrewMap({
  center,
  points,
  onSelect,
}: {
  center: { lat: number; lng: number };
  points: MapPoint[];
  onSelect?: (id: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} testID="crew-map">
      <Map style={styles.map} mapStyle={MAP_STYLE} attribution>
        <Camera initialViewState={{ center: [center.lng, center.lat], zoom: 10.1 }} />
        {points.map((p) => (
          <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} onPress={() => onSelect?.(p.id)}>
            <Pressable
              accessibilityLabel={`Open ${p.name} — approximate location`}
              onPress={() => onSelect?.(p.id)}
              style={[styles.marker, { backgroundColor: colors.brandPrimary }]}
            >
              <Text style={styles.markerText}>{p.name.charAt(0).toUpperCase()}</Text>
            </Pressable>
          </Marker>
        ))}
      </Map>
      <View pointerEvents="none" style={styles.mapLabel}>
        <Text style={styles.mapLabelText}>20 km radar · Approximate locations</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 360, overflow: "hidden", borderRadius: 16, marginHorizontal: 16, marginTop: 8 },
  map: { flex: 1 },
  marker: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#FFF", alignItems: "center", justifyContent: "center", elevation: 4 },
  markerText: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  mapLabel: { position: "absolute", left: 12, right: 12, top: 12, backgroundColor: "rgba(0,0,0,0.75)", padding: 8, borderRadius: 8 },
  mapLabelText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
});
