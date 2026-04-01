import type { Metadata } from "next";
import { Raleway, Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CartProvider } from "@/components/shop/CartProvider";
import CartDrawer from "@/components/shop/CartDrawer";

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
    default: "RELIC | Custom Woodworking & Metalworks",
    template: "%s | RELIC",
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
    title: "RELIC",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "RELIC | Custom Woodworking & Metalworks",
    description:
      "Custom woodworking and metalworks shop built on craftsmanship and care.",
    url: "https://www.relicbuilt.com",
    siteName: "RELIC",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${raleway.variable} ${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CartProvider>
          <Navbar />
          <main className="flex-1 pt-16">{children}</main>
          <Footer />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
