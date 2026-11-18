import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { brand } from "@beaver/ui-tokens";
import { AuthBridge } from "@/components/auth/auth-bridge";
import { BeaverClerkProvider } from "@/components/providers/clerk-provider";
import { SiteHeader } from "@/components/site-header";
import { clerkPublishableKey } from "@/lib/clerk";
import { getLocale } from "@/lib/locale";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: `${brand.en} / ${brand.zh}`,
    template: `%s · ${brand.en}`,
  },
  description: brand.taglineEn,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const publishableKey = clerkPublishableKey();

  return (
    <html
      lang={locale}
      className={`${display.variable} ${body.variable}`}
      style={
        {
          "--bp-font-display":
            'var(--font-bricolage), "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
          "--bp-font-body":
            'var(--font-jakarta), "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
        } as React.CSSProperties
      }
    >
      <body>
        <BeaverClerkProvider publishableKey={publishableKey}>
          <AuthBridge />
          <SiteHeader locale={locale} />
          <main>{children}</main>
        </BeaverClerkProvider>
      </body>
    </html>
  );
}
