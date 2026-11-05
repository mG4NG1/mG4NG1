import { StyleSheet, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";

import { useTheme } from "@/src/theme";

export type MapPoint = { id: string; name: string; trade?: string | null; lat: number; lng: number };

// Approximate areas only: each person is drawn as a ~1.5 km circle, not an exact pin.
export function CrewMap({ center, points, onSelect }: { center: { lat: number; lng: number }; points: MapPoint[]; onSelect?: (id: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} testID="crew-map">
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.35, longitudeDelta: 0.35 }}
        showsUserLocation={false}
      >
        <Circle
          center={{ latitude: center.lat, longitude: center.lng }}
          radius={1200}
          fillColor={colors.surfaceInverse}
          strokeColor={colors.surfaceInverse}
        />
        {points.map((p) => (
          <View key={p.id}>
            <Circle
              center={{ latitude: p.lat, longitude: p.lng }}
              radius={1500}
              fillColor={colors.brandAreaFill}
              strokeColor={colors.brandPrimary}
              strokeWidth={1}
            />
            <Marker
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.name}
              description={p.trade ?? undefined}
              pinColor={colors.brandPrimary}
              onCalloutPress={() => onSelect?.(p.id)}
            />
          </View>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 300, overflow: "hidden" },
});
