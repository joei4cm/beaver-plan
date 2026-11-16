import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import { brand } from "@beaver/ui-tokens";
import { AuthBridge } from "@/components/auth/auth-bridge";
import { BeaverClerkProvider } from "@/components/providers/clerk-provider";
import { SiteHeader } from "@/components/site-header";
import { clerkPublishableKey } from "@/lib/clerk";
import { getLocale } from "@/lib/locale";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const body = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
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
            'var(--font-fraunces), "Songti SC", Georgia, serif',
          "--bp-font-body":
            'var(--font-sora), "PingFang SC", system-ui, sans-serif',
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
