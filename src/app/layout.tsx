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

export const metadata: Metadata = {
  title: "AI Bill of Rights",
  description: "A People's Demand for Human-Centered AI",
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
