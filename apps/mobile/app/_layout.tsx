import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@beaver/ui-tokens";
import { MobileAuthBridge } from "../src/auth-bridge";
import { clerkPublishableKey } from "../src/clerk";

function AppStack() {
  return (
    <>
      <StatusBar style="light" />
      <MobileAuthBridge />
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

export default function RootLayout() {
  const key = clerkPublishableKey();
  if (!key) {
    return <AppStack />;
  }
  return (
    <ClerkProvider publishableKey={key} tokenCache={tokenCache}>
      <AppStack />
    </ClerkProvider>
  );
}
