import type { Metadata } from "next";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { clerkEnabled, wechatLoginEnabled } from "@/lib/clerk";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage() {
  const locale = await getLocale();
  return (
    <SignInPanel
      locale={locale}
      clerkReady={clerkEnabled()}
      wechatEnabled={wechatLoginEnabled()}
    />
  );
}
