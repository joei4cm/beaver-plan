/** Soft Clerk gate for Expo — no fake secrets. */

export function clerkPublishableKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!key || key.includes("xxxxxxxx") || !key.startsWith("pk_")) {
    return undefined;
  }
  return key;
}

export function clerkEnabled(): boolean {
  return Boolean(clerkPublishableKey());
}

export function wechatLoginEnabled(): boolean {
  if (!clerkEnabled()) return false;
  return process.env.EXPO_PUBLIC_CLERK_WECHAT_ENABLED === "true";
}
