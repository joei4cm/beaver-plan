import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect } from "react";
import { setMobileApiAuth } from "./api";
import { clerkEnabled } from "./clerk";

export function MobileAuthBridge() {
  if (!clerkEnabled()) {
    return <DemoBridge />;
  }
  return <ClerkBridge />;
}

function DemoBridge() {
  useEffect(() => {
    setMobileApiAuth({
      demoUserId: "demo-user",
      demoDisplayName: "Demo Traveler",
    });
  }, []);
  return null;
}

function ClerkBridge() {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isSignedIn) {
      setMobileApiAuth({ getToken: async () => null });
      return;
    }
    setMobileApiAuth({
      getToken: () => getToken(),
      demoDisplayName:
        user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? undefined,
    });
  }, [getToken, isSignedIn, user]);

  return null;
}
