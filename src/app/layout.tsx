import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MyAccountButton } from "@/components/MyAccountButton";
import { getSignatureCount } from "@/lib/db/queries";
import { LiveSignersProvider } from "./LiveSignersProvider";
import LiveSignerBanner from "./LiveSignerBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";

const OG_TITLE =
  "The AI Bill of Rights — Nine Commitments Every AI Company Must Make";
const OG_DESCRIPTION =
  "A People's Demand for Human-Centered AI. Nine commitments on your data, your memory, your attention, and your right to reach a human. Read it and add your name.";

export const metadata: Metadata = {
  // Without metadataBase, Next resolves the relative OG image URL against
  // VERCEL_URL — a per-deployment *.vercel.app host — and warns at build time.
  metadataBase: new URL(SITE_URL),
  title: "AI Bill of Rights",
  description: OG_DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: "/",
    siteName: "AI Bill of Rights",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "The AI Bill of Rights — nine commitments demanded of every AI company",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: ["/api/og"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let initialCount = 0;
  try {
    initialCount = await getSignatureCount();
  } catch (err) {
    console.error("[layout] getSignatureCount failed; starting at 0:", err);
  }

  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <LiveSignersProvider initialCount={initialCount}>
            <MyAccountButton />
            <LiveSignerBanner />
            {children}
          </LiveSignersProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
