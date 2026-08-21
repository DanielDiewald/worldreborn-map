import type { Metadata } from "next";
import "./globals.css";
import "./entity-images.css";
import "./profile-images.css";
import "./form-quality.css";

export const metadata: Metadata = {
  title: "WorldReborn",
  description: "Private worldbuilding and campaign management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
