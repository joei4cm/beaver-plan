import type { Metadata } from "next";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { clerkEnabled, wechatLoginEnabled } from "@/lib/clerk";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ strategy?: string | string[] }>;
}) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const raw = params.strategy;
  const oauthStrategy = Array.isArray(raw) ? raw[0] : raw;

  return (
    <SignInPanel
      locale={locale}
      clerkReady={clerkEnabled()}
      wechatEnabled={wechatLoginEnabled()}
      oauthStrategy={oauthStrategy}
    />
  );
}
