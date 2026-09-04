import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Privacy Messenger",
  description: "A privacy-focused messaging application.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
