import type { Metadata, Viewport } from "next";
import { Raleway, Geist } from "next/font/google";
import "./globals.css";
import SiteShell from "@/components/layout/SiteShell";
import { CartProvider } from "@/components/shop/CartProvider";
import PwaRegistrar from "@/components/layout/PwaRegistrar";
import { SITE_ENTITY } from "@/lib/axiom-site";

const IS_RELIC = SITE_ENTITY === "relic";

// Per-deployment tab/title branding (see axiom-site.ts). The RELIC site shows
// RELIC marks; the Wallflower (default) deployment keeps its historic metadata.
const BRAND = IS_RELIC
  ? {
      name: "RELIC",
      titleDefault: "RELIC · Axiom",
      icon: "/relic-shield-gold.png",
      themeColor: "#b8963c",
      url: "https://axiom.relicbuilt.com",
    }
  : {
      name: "Wallflower RELIC",
      titleDefault: "Wallflower RELIC | Custom Woodworking & Metalworks",
      icon: "/favicon.ico",
      themeColor: "#5b642e",
      url: "https://www.relicbuilt.com",
    };

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
    default: BRAND.titleDefault,
    template: `%s | ${BRAND.name}`,
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
    title: "Axiom",
    statusBarStyle: "black-translucent",
    // Pinned to the larger 180x180 apple-touch-icon so iPad/iPhone home
    // screen icons render crisp rather than scaling a 32px icon up to 180px
    // and looking pixelated.
    startupImage: ["/apple-touch-icon.png"],
  },
  // Relicon brass "A" icon set (see RELICON_APP_ICONS.md). Served from public/.
  icons: IS_RELIC
    ? {
        icon: [{ url: "/relic-shield-gold.png", type: "image/png" }],
        apple: [{ url: "/relic-shield-gold.png" }],
        shortcut: ["/relic-shield-gold.png"],
      }
    : {
        icon: [
          { url: "/favicon.ico", sizes: "any" },
          { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
          { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
        ],
        apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
        shortcut: ["/favicon.ico"],
      },
  openGraph: {
    title: BRAND.titleDefault,
    description:
      "Custom woodworking and metalworks shop built on craftsmanship and care.",
    url: BRAND.url,
    siteName: BRAND.name,
    type: "website",
  },
};

// Pinned theme color matches the manifest accent so installed PWAs render
// the status bar / title bar in RELIC gold instead of the default white.
export const viewport: Viewport = {
  themeColor: BRAND.themeColor,
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
