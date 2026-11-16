"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { setApiAuth } from "@/lib/api";
import { clerkEnabled } from "@/lib/clerk";

/** Keeps BFF fetches in sync with Clerk session or demo identity. */
export function AuthBridge({
  demoUserId = "demo-user",
  demoDisplayName = "Demo Traveler",
}: {
  demoUserId?: string;
  demoDisplayName?: string;
}) {
  if (!clerkEnabled()) {
    return <DemoAuthBridge userId={demoUserId} displayName={demoDisplayName} />;
  }
  return <ClerkAuthBridge />;
}

function DemoAuthBridge({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  useEffect(() => {
    setApiAuth({ demoUserId: userId, demoDisplayName: displayName });
  }, [userId, displayName]);
  return null;
}

function ClerkAuthBridge() {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isSignedIn) {
      setApiAuth({
        demoUserId: undefined,
        getToken: async () => null,
      });
      return;
    }
    setApiAuth({
      getToken: () => getToken(),
      demoDisplayName:
        user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? undefined,
    });
  }, [getToken, isSignedIn, user]);

  return null;
}
