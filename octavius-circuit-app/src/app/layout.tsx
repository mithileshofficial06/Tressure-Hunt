import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XPLORE'26 — Octavius Circuit",
  description: "Route the current from source to end node at exactly the target voltage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
