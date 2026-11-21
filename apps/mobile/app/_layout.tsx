import { useEffect } from "react";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@beaver/ui-tokens";
import { MobileAuthBridge } from "../src/auth-bridge";
import { clerkPublishableKey } from "../src/clerk";
import { ensureLumenWebFonts, fontBody } from "../src/theme";

function AppStack() {
  useEffect(() => {
    ensureLumenWebFonts();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <MobileAuthBridge />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.foam },
          headerTintColor: colors.ink,
          headerTitleStyle: {
            fontWeight: "700",
            fontFamily: fontBody,
            color: colors.ink,
          },
          headerShadowVisible: false,
          headerBackTitle: " ",
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
