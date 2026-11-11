import { Tabs } from "expo-router";
import { Ionicons } from "@react-native-vector-icons/ionicons";

// A consistent hard-hat yellow footer on Android and iOS.
// Extra legacy routes stay reachable internally but are not main tabs.
export default function TabsLayout() {
  const icon = (on: React.ComponentProps<typeof Ionicons>["name"], off: React.ComponentProps<typeof Ionicons>["name"]) =>
    ({ focused, color }: { focused: boolean; color: string }) =>
      <Ionicons name={focused ? on : off} size={23} color={color} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#4A4030",
        tabBarStyle: { backgroundColor: "#FFC400", borderTopColor: "#F0B500", height: 66 },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 10 },
        tabBarItemStyle: { paddingTop: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Board", tabBarButtonTestID: "tab-board", tabBarIcon: icon("megaphone", "megaphone-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarButtonTestID: "tab-profile", tabBarIcon: icon("person", "person-outline") }} />
      <Tabs.Screen name="crew" options={{ title: "Crew", tabBarButtonTestID: "tab-crew", tabBarIcon: icon("people", "people-outline") }} />
      <Tabs.Screen name="inbox" options={{ title: "Chats", tabBarButtonTestID: "tab-chats", tabBarIcon: icon("chatbubbles", "chatbubbles-outline") }} />
      <Tabs.Screen name="radar" options={{ title: "Map", tabBarButtonTestID: "tab-map", tabBarIcon: icon("map", "map-outline") }} />
      <Tabs.Screen name="work" options={{ href: null }} />
      <Tabs.Screen name="noticeboard" options={{ href: null }} />
    </Tabs>
  );
}
