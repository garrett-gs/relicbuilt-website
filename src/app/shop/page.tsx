"use client";

import { motion } from "framer-motion";
import ProductCard from "@/components/shop/ProductCard";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { Product } from "@/types";

// Sample data — will be replaced with Supabase queries
const sampleProducts: Product[] = [
  {
    id: "1",
    name: "Steel and Pine Table",
    slug: "steel-and-pine-table",
    description: '4" steel U-shaped legs with 1-1/2" stained pine top. Seats 6 people comfortably.',
    price: 50000,
    images: [],
    specs: { seats: "6", legs: '4" Steel U-Shaped', top: '1-1/2" Stained Pine' },
    stock: 1,
    available: true,
    stripe_price_id: "",
    created_at: "2024-01-01",
  },
  {
    id: "2",
    name: "A-Frame Bookshelf",
    slug: "a-frame-bookshelf",
    description: 'Pine with clear finish. 36" tall by 36" wide. Perfect for any room.',
    price: 25000,
    images: [],
    specs: { material: "Pine w/ Clear Finish", height: '36"', width: '36"' },
    stock: 1,
    available: true,
    stripe_price_id: "",
    created_at: "2024-02-01",
  },
  {
    id: "3",
    name: "Golf Locker",
    slug: "golf-locker",
    description: "Custom storage for shoes, golf clubs, and additional items. Built to last.",
    price: 85000,
    images: [],
    specs: { storage: "Shoes, Clubs, Accessories" },
    stock: 1,
    available: true,
    stripe_price_id: "",
    created_at: "2024-03-01",
  },
];

export default function ShopPage() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Shop
          </h1>
          <p className="text-muted mb-8">
            Shop available items or{" "}
            <Link href="/new-client" className="text-accent hover:underline">
              start a custom order
            </Link>
            .
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sampleProducts.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} />
          ))}
        </div>

        <div className="mt-16 text-center border border-border p-12">
          <h2 className="text-2xl font-bold mb-4">
            Don&apos;t See What You&apos;re Looking For?
          </h2>
          <p className="text-muted mb-6">
            We specialize in custom builds. Tell us what you need and
            we&apos;ll make it happen.
          </p>
          <Link href="/new-client">
            <Button>Start a Custom Order</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
