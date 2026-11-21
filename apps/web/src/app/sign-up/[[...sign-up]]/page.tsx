import type { Metadata } from "next";
import { SignUpPanel } from "@/components/auth/sign-up-panel";
import { clerkEnabled } from "@/lib/clerk";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignUpPage() {
  const locale = await getLocale();

  return (
    <SignUpPanel locale={locale} clerkReady={clerkEnabled()} />
  );
}
