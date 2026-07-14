import { axiom } from "@/lib/axiom-supabase";

/** A material line from a PO or invoice — only the fields we need to match + price. */
export interface PricedLine {
  description?: string;
  item_number?: string;
  unit_price?: number;
}

/**
 * "Newest price wins" price sync.
 *
 * When a material line on a PO or invoice is saved at a unit price that differs
 * from the matching inventory item's stored `unit_cost`, update that item's
 * `unit_cost` to the newly-entered price so future POs/estimates use it.
 *
 * - Matches a line to an inventory item by `item_number` (preferred) or by
 *   case-insensitive `description` — the same matching the PO-receive flow uses.
 * - Cost only: never touches `quantity_on_hand`.
 * - If several lines match the same item, the last (newest) one wins.
 * - No match → no-op (we only update prices for items already in the system).
 *
 * Returns the number of inventory items whose price was updated.
 */
export async function syncInventoryUnitCost(lines: PricedLine[]): Promise<number> {
  const priced = (lines || []).filter(
    (l) => l && (l.unit_price ?? 0) > 0 && (l.description?.trim() || l.item_number?.trim())
  );
  if (priced.length === 0) return 0;

  const { data: inv } = await axiom
    .from("inventory_items")
    .select("id, item_number, description, unit_cost")
    .eq("active", true);
  if (!inv || inv.length === 0) return 0;

  const byNumber = new Map<string, { id: string; unit_cost: number }>();
  const byDesc = new Map<string, { id: string; unit_cost: number }>();
  for (const it of inv) {
    if (it.item_number) byNumber.set(String(it.item_number).trim().toLowerCase(), it);
    if (it.description) byDesc.set(String(it.description).trim().toLowerCase(), it);
  }

  // inventory id -> new unit_cost (newest line wins because the loop overwrites)
  const updates = new Map<string, number>();
  for (const l of priced) {
    let match = l.item_number
      ? byNumber.get(String(l.item_number).trim().toLowerCase())
      : undefined;
    if (!match && l.description) match = byDesc.get(String(l.description).trim().toLowerCase());
    if (!match) continue;

    const newPrice = Math.round((l.unit_price as number) * 100) / 100;
    const current = Math.round((match.unit_cost || 0) * 100) / 100;
    if (newPrice !== current) updates.set(match.id, newPrice);
  }

  let updated = 0;
  for (const [id, unit_cost] of updates) {
    const { error } = await axiom
      .from("inventory_items")
      .update({ unit_cost, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) updated++;
  }
  return updated;
}
