/** Soft Clerk gate — never invent secrets; UI degrades to demo auth. */

export function clerkPublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!key || key.includes("xxxxxxxx") || !key.startsWith("pk_")) {
    return undefined;
  }
  return key;
}

export function clerkEnabled(): boolean {
  return Boolean(clerkPublishableKey());
}

/** Show WeChat OAuth entry when Clerk is configured and the flag is on. */
export function wechatLoginEnabled(): boolean {
  if (!clerkEnabled()) return false;
  return process.env.NEXT_PUBLIC_CLERK_WECHAT_ENABLED === "true";
}
