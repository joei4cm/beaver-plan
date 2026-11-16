"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

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
        variables: {
          colorPrimary: "#1f6b5c",
          colorBackground: "#f7faf8",
          borderRadius: "0.375rem",
          fontFamily: "var(--bp-font-body)",
        },
      }}
    >
      {/* Clerk pins an older React type; cast keeps Next 19 children happy. */}
      {children as never}
    </ClerkProvider>
  );
}
