import type { Metadata, Viewport } from "next";
import { Raleway, Geist } from "next/font/google";
import "./globals.css";
import SiteShell from "@/components/layout/SiteShell";
import { CartProvider } from "@/components/shop/CartProvider";
import PwaRegistrar from "@/components/layout/PwaRegistrar";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Wallflower RELIC | Custom Woodworking & Metalworks",
    template: "%s | Wallflower RELIC",
  },
  description:
    "Custom woodworking and metalworks shop. We build with dedication to craftsmanship, purpose, and care. Residential and commercial projects.",
  keywords: [
    "custom woodworking",
    "metalworks",
    "custom furniture",
    "cabinetry",
    "millwork",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Wallflower RELIC",
    statusBarStyle: "black-translucent",
    // Pinned to the larger 180x180 apple-touch-icon so iPad/iPhone home
    // screen icons render crisp rather than scaling the Next-generated
    // 32px icon up to 180px and looking pixelated.
    startupImage: ["/apple-touch-icon-wr.png"],
  },
  icons: {
    apple: [{ url: "/apple-touch-icon-wr.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Wallflower RELIC | Custom Woodworking & Metalworks",
    description:
      "Custom woodworking and metalworks shop built on craftsmanship and care.",
    url: "https://www.relicbuilt.com",
    siteName: "Wallflower RELIC",
    type: "website",
  },
};

// Pinned theme color matches the manifest accent so installed PWAs render
// the status bar / title bar in RELIC gold instead of the default white.
export const viewport: Viewport = {
  themeColor: "#5b642e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-US"
      className={`${raleway.variable} ${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CartProvider>
          <SiteShell>{children}</SiteShell>
          <PwaRegistrar />
        </CartProvider>
      </body>
    </html>
  );
}
