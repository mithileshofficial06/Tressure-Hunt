import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Web of Secrets — SHIFT://VERSE',
  description:
    'Web of Secrets — an immersive event experience. Decode the encrypted Caesar Cipher messages to reveal the correct answers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
