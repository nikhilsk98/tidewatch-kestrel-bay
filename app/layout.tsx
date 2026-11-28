import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "./_components/Sidebar";
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
  title: "Tidewatch",
  description: "What to buy. What to clear. Why.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-fog text-ink lg:flex">
        {/* Lets keyboard users jump past the navigation. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-kelp focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <Sidebar />
        <div id="content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </div>
      </body>
    </html>
  );
}
