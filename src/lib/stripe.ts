import Stripe from "stripe";
import { BusinessEntity } from "@/types/axiom";

const clients: Partial<Record<BusinessEntity, Stripe>> = {};

/**
 * Stripe client for a given business entity. Wallflower RELIC uses
 * STRIPE_SECRET_KEY; Relic uses its own account via STRIPE_SECRET_KEY_RELIC.
 * Throws if the entity's key isn't configured — callers handling money for a
 * Relic invoice must surface that rather than silently charge Wallflower's
 * account.
 */
export function getStripe(entity: BusinessEntity = "wallflower_relic") {
  const key =
    entity === "relic"
      ? process.env.STRIPE_SECRET_KEY_RELIC
      : process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      entity === "relic"
        ? "Relic Stripe account is not configured (STRIPE_SECRET_KEY_RELIC)."
        : "Stripe is not configured (STRIPE_SECRET_KEY)."
    );
  }
  if (!clients[entity]) {
    clients[entity] = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return clients[entity]!;
}
