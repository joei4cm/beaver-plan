"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import {
  clerkEmailElements,
  clerkEmailVariables,
} from "@/components/auth/clerk-email-appearance";

export function BeaverClerkProvider({
  publishableKey,
  children,
}: {
  publishableKey?: string;
  children: ReactNode;
}) {
  if (!publishableKey) {
    return <>{children}</>;
  }
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        // Auth email sheet Lumen craft (BEA-498) — river / paper / ink; not
        // Slice-D teal #1f6b5c / cream #f7faf8. SoftFail untouched.
        variables: { ...clerkEmailVariables },
        elements: {
          formButtonPrimary: clerkEmailElements.formButtonPrimary,
          formFieldInput: clerkEmailElements.formFieldInput,
          formFieldLabel: clerkEmailElements.formFieldLabel,
          headerTitle: clerkEmailElements.headerTitle,
          headerSubtitle: clerkEmailElements.headerSubtitle,
          footerActionLink: clerkEmailElements.footerActionLink,
          identityPreviewEditButton:
            clerkEmailElements.identityPreviewEditButton,
          formFieldAction: clerkEmailElements.formFieldAction,
        },
      }}
    >
      {/* Clerk pins an older React type; cast keeps Next 19 children happy. */}
      {children as never}
    </ClerkProvider>
  );
}
