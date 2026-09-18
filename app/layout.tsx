import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reel Extract",
  description: "Extract user-confirmed places and websites from shared Reels."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
