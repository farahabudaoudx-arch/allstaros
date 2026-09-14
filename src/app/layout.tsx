import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeInit } from "@/components/ThemeInit";
import { PostHogPageView } from "@/components/PostHogPageView";
import { VersionWatcher } from "@/components/VersionWatcher";
import { getInstallationConfig } from "@/lib/installation/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const installation = await getInstallationConfig();
  return {
    title: installation.productName,
    description: installation.metadataDescription,
    icons: { icon: installation.faviconUrl },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const installation = await getInstallationConfig();
  const brandStyle = {
    "--color-accent": installation.brandAccentColor,
    "--color-accent-soft": installation.brandPrimaryColor,
  } as CSSProperties;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={brandStyle}
    >
      <body className="min-h-full flex flex-col bg-background text-ink">
        <ThemeInit />
        <PostHogPageView />
        <VersionWatcher />
        {children}
      </body>
    </html>
  );
}
