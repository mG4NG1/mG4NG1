import { ActivityIndicator, View } from "react-native";
import { useTheme } from "@/src/theme";

// The root gate in _layout.tsx redirects from here.
export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
      <ActivityIndicator color={colors.brandPrimary} />
    </View>
  );
}
