import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "BigShout — big calls, on the record",
  description:
    "Swipe to predict live World Cup moments. Calls lock before the outcome and settle on-chain via TxODDS' oracle — bragging rights you can prove.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-bg text-ink">
        <Header />
        <main className="mx-auto w-full max-w-5xl px-4 pb-24">{children}</main>
      </body>
    </html>
  );
}
