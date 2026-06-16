import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Limelight — See how AI talks about you",
    template: "%s · Limelight",
  },
  description:
    "Limelight is an open-source AI-visibility auditor: see how ChatGPT, Claude, Gemini and Perplexity describe you, find what earns citations, and generate the structured content that gets you mentioned.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Dark-by-default brand theme (near-black canvas + amber accent).
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
        <Toaster theme="dark" richColors position="top-center" />
      </body>
    </html>
  );
}
