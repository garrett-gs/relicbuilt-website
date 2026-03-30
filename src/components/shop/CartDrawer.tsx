"use client";

import { X, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/utils";
import Button from "@/components/ui/Button";

export default function CartDrawer() {
  const { items, removeItem, updateQuantity, total, cartOpen, setCartOpen } =
    useCart();

  if (!cartOpen) return null;

  const handleCheckout = async () => {
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity,
            image: item.product.images[0],
          })),
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={() => setCartOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-background border-l border-border z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold uppercase tracking-wider">Cart</h2>
          <button
            onClick={() => setCartOpen(false)}
            className="text-muted hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted">Your cart is empty</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex gap-4 py-4 border-b border-border"
                >
                  <div className="w-20 h-20 bg-card flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium">{item.product.name}</h3>
                    <p className="text-muted text-sm">
                      {formatPrice(item.product.price)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity - 1)
                        }
                        className="text-muted hover:text-foreground"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-sm w-6 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity + 1)
                        }
                        className="text-muted hover:text-foreground"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => removeItem(item.product.id)}
                        className="ml-auto text-muted hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-border">
              <div className="flex justify-between mb-4">
                <span className="text-muted uppercase text-sm tracking-wider">
                  Total
                </span>
                <span className="font-bold">{formatPrice(total)}</span>
              </div>
              <Button onClick={handleCheckout} className="w-full">
                Checkout
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
