import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vidscope — Video discovery",
  description: "Discover and compare videos across platforms. Search topics and sort by available views, likes, and comments.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
