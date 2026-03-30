"use client";

import { motion } from "framer-motion";
import { Product } from "@/types";
import { formatPrice } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Link from "next/link";

interface ProductCardProps {
  product: Product;
  index: number;
}

export default function ProductCard({ product, index }: ProductCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="border border-border group"
    >
      <Link href={`/shop/${product.slug}`}>
        <div className="aspect-square bg-card flex items-center justify-center overflow-hidden">
          <p className="text-muted text-xs uppercase tracking-wider">
            {product.name}
          </p>
        </div>
      </Link>
      <div className="p-6">
        <Link href={`/shop/${product.slug}`}>
          <h3 className="font-bold text-lg mb-1 group-hover:text-accent transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="text-muted text-sm mb-3 line-clamp-2">
          {product.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold">{formatPrice(product.price)}</span>
          {product.available ? (
            <span className="text-xs text-green-500 uppercase tracking-wider">
              Available
            </span>
          ) : (
            <span className="text-xs text-muted uppercase tracking-wider">
              Sold
            </span>
          )}
        </div>
        <Link href={`/shop/${product.slug}`} className="mt-4 block">
          <Button variant="outline" size="sm" className="w-full">
            View Details
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
