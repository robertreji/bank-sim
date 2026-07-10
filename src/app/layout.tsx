import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StellarBank — Simulated Bank Portal",
  description: "Manage and authorize mock fiat transfers for Stellar Anchor integrations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
