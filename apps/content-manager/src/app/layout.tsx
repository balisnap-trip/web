import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Manager | Bali Snap Trip",
  description: "Content Manager scaffold for catalog publish workflow",
  icons: {
    icon: "/favicon.png"
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
