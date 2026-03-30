"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import { useCart } from "@/components/shop/CartProvider";
import { formatPrice } from "@/lib/utils";
import { Product } from "@/types";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Sample data — will be replaced with Supabase queries
const products: Record<string, Product> = {
  "steel-and-pine-table": {
    id: "1",
    name: "Steel and Pine Table",
    slug: "steel-and-pine-table",
    description:
      '4" steel U-shaped legs with 1-1/2" stained pine top. Seats 6 people comfortably. Handcrafted with attention to every detail — this table is built to be a centerpiece for years to come.',
    price: 50000,
    images: [],
    specs: { Seats: "6", Legs: '4" Steel U-Shaped', Top: '1-1/2" Stained Pine' },
    stock: 1,
    available: true,
    stripe_price_id: "",
    created_at: "2024-01-01",
  },
  "a-frame-bookshelf": {
    id: "2",
    name: "A-Frame Bookshelf",
    slug: "a-frame-bookshelf",
    description:
      'Pine with clear finish. 36" tall by 36" wide. A clean, modern design that works in any space.',
    price: 25000,
    images: [],
    specs: { Material: "Pine w/ Clear Finish", Height: '36"', Width: '36"' },
    stock: 1,
    available: true,
    stripe_price_id: "",
    created_at: "2024-02-01",
  },
  "golf-locker": {
    id: "3",
    name: "Golf Locker",
    slug: "golf-locker",
    description:
      "Custom storage for shoes, golf clubs, and additional items. Built with premium materials to keep your gear organized and protected.",
    price: 85000,
    images: [],
    specs: { Storage: "Shoes, Clubs, Accessories" },
    stock: 1,
    available: true,
    stripe_price_id: "",
    created_at: "2024-03-01",
  },
};

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const product = products[slug];
  const { addItem } = useCart();

  if (!product) {
    return (
      <div className="py-24 px-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
        <Link href="/shop" className="text-accent hover:underline">
          Back to Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-muted hover:text-accent transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to Shop
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Image area */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="aspect-square bg-card border border-border flex items-center justify-center"
          >
            <p className="text-muted text-sm uppercase tracking-wider">
              Product Image
            </p>
          </motion.div>

          {/* Details */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              {product.name}
            </h1>
            <p className="text-3xl font-bold text-accent mb-6">
              {formatPrice(product.price)}
            </p>
            <p className="text-muted leading-relaxed mb-8">
              {product.description}
            </p>

            {/* Specs */}
            <div className="border-t border-border pt-6 mb-8">
              <h3 className="text-sm uppercase tracking-wider text-muted mb-4">
                Specifications
              </h3>
              <div className="space-y-2">
                {Object.entries(product.specs).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted">{key}</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {product.available ? (
                <>
                  <Button onClick={() => addItem(product)} size="lg">
                    Add to Cart
                  </Button>
                  <span className="text-sm text-green-500">
                    {product.stock} available
                  </span>
                </>
              ) : (
                <p className="text-muted">
                  This item has been sold.{" "}
                  <Link href="/new-client" className="text-accent hover:underline">
                    Order a custom build
                  </Link>
                  .
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
