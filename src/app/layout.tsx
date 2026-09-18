import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hansan OS - F&B POS & Restaurant Operating System",
  description: "Enterprise modular restaurant operating system for high-volume outlets",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased min-h-screen overflow-hidden bg-gray-50">
        {children}
      </body>
    </html>
  );
}
