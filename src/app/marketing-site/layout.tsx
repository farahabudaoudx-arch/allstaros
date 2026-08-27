import type { Metadata } from "next";
import "./marketing.css";

const title = "All Star Life Group";
const description =
  "We help families find life insurance coverage that protects the people they love and gives them confidence about the future.";
const siteUrl = "https://www.allstarlifegroup.com";
const previewImage = `${siteUrl}/marketing/social-preview.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: "/marketing/favicon.ico",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: title,
    title,
    description,
    images: [
      {
        url: previewImage,
        width: 1920,
        height: 1080,
        alt: "All Star Life Group",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [previewImage],
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="marketing-site">
      <link rel="preconnect" href="https://app.iclosed.io" />
      <link rel="dns-prefetch" href="https://app.iclosed.io" />
      {children}
    </div>
  );
}
