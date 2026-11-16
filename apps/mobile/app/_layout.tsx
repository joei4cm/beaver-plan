import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@beaver/ui-tokens";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.riverDeep },
          headerTintColor: colors.foam,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.paper },
        }}
      />
    </>
  );
}
