import type { Metadata } from "next";
import { Archivo_Black, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* Three faces, each with one job.

   Archivo Black — headings and big figures. A tight grotesque with no
   personality to get in the way, which is what brutalist display type needs;
   the previous theme's Anton was a poster face and read as decoration.
   Inter — body copy.
   JetBrains Mono — anything that is a readout rather than a sentence: labels,
   timestamps, team numbers, column heads. */
const archivo = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "XPLORE'26 — Treasure Hunt",
  description: "Team registration and round dashboard for the XPLORE'26 treasure hunt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${inter.variable} ${jetbrains.variable} h-full`}
    >
      <body className="min-h-full">
        <div className="grid-bg" />
        {children}
      </body>
    </html>
  );
}
