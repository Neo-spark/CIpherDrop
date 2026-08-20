import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: "CipherDrop — Encrypted temporary file sharing",
  description: "Send end-to-end encrypted files directly between two browsers. No accounts, no file storage, no permanent connections.",
  openGraph: {
    title: "CipherDrop",
    description: "Send files. Leave no trace.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "CipherDrop — Send files. Leave no trace." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CipherDrop",
    description: "Send files. Leave no trace.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
