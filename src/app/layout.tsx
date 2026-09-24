import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MyAccountButton } from "@/components/MyAccountButton";
import { getSignatureCount } from "@/lib/db/queries";
import { getViewerSignature } from "@/lib/viewer/signature";
import { SiteAnalytics } from "@/lib/analytics/SiteAnalytics";
import { buildRootMetadata } from "@/lib/site-metadata";
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

export const metadata: Metadata = buildRootMetadata();

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
  // Never throws: a signer who can't be recognized just sees the stranger's view.
  const initialViewer = await getViewerSignature();

  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {/* Injects the analytics script. Without it every track() call in
              src/lib/analytics is a silent no-op. */}
          <SiteAnalytics />
          <LiveSignersProvider
            initialCount={initialCount}
            initialViewer={initialViewer}
          >
            <MyAccountButton />
            <LiveSignerBanner />
            {children}
          </LiveSignersProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
