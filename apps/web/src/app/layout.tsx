import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUX Platform",
  description: "Crowd-demanded, creator-controlled productions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
