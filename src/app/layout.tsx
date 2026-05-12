import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import "./globals.css";

const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-LWQ9HE34Y6";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// metadataBase resolves every relative URL the per-page metadata
// ships (OG images, canonicals) into a fully-qualified URL that
// crawlers + social cards can fetch. Override via env so preview
// deployments emit their own absolute URLs.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchtracker.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "pitchtracker",
  title: {
    default: "pitchtracker · MLB pitch trajectories in 3D",
    template: "%s · pitchtracker",
  },
  description:
    "MLB pitch trajectories rendered in 3D — pitcher arsenal comparison, pitch-by-pitch at-bat replay, daily leaderboards.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/logo.png", sizes: "256x256", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "pitchtracker",
    url: SITE_URL,
    title: "pitchtracker · MLB pitch trajectories in 3D",
    description:
      "Compare pitcher arsenals side-by-side, replay any at-bat pitch-by-pitch in 3D, and browse season leaderboards across velo, whiff %, CSW, spin, and VAA.",
    images: [
      {
        url: "/logo.png",
        width: 256,
        height: 256,
        alt: "pitchtracker",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "pitchtracker · MLB pitch trajectories in 3D",
    description:
      "Compare arsenals, replay at-bats in 3D, and browse season leaderboards.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
    >
      <body className="bg-[#0a0e14] text-white/90">
        <NuqsAdapter>
          {children}
          <SiteFooter />
        </NuqsAdapter>
        <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
      </body>
    </html>
  );
}
