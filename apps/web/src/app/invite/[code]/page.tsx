import type { Metadata } from "next";
import { InviteAccept } from "@/components/collab/invite-accept";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "Join trip",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const locale = await getLocale();
  return <InviteAccept code={code} locale={locale} />;
}
