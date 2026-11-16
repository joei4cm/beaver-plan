import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function clerkPublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!key || key.includes("xxxxxxxx") || !key.startsWith("pk_")) {
    return undefined;
  }
  return key;
}

/**
 * Soft Clerk middleware: only active when a real publishable key exists.
 * Trip pages stay public; BFF enforces mutation auth.
 */
const withClerk = clerkMiddleware();

export default function middleware(req: NextRequest, event: unknown) {
  if (!clerkPublishableKey()) {
    return NextResponse.next();
  }
  return withClerk(req, event as never);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
