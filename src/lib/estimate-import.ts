import type { EstimateLineItem, EstimateLaborItem } from "@/types/axiom";

// Parses a line-item list file (built in Claude Desktop, or hand-edited in a
// spreadsheet) into estimate line items + labor, ready to append in the
// Estimator. JSON is the first-class format; CSV is accepted for materials.
//
// JSON shape (everything but line_items is optional):
//   {
//     "project_name": "…",
//     "line_items": [
//       { "item_number": "ASH-44", "description": "4/4 Ash, S3S",
//         "quantity": 40, "unit_price": 6.25, "unit": "bf" }
//     ],
//     "labor_items": [ { "description": "Build", "hours": 24, "rate": 65 } ],
//     "markup_percent": 20,
//     "notes": "…"
//   }
// A bare JSON array is treated as line_items. Field names are matched loosely
// (qty/quantity, price/unit_price/cost, sku/item_number, …) so a reasonable
// file from any source still lands.

export interface ParsedEstimateImport {
  lineItems: EstimateLineItem[];
  laborItems: EstimateLaborItem[];
  projectName?: string;
  markupPercent?: number;
  notes?: string;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,]/g, "").trim());
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}
function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

type Raw = Record<string, unknown>;

function normLine(raw: Raw): EstimateLineItem | null {
  const description = str(raw.description ?? raw.desc ?? raw.name ?? raw.item ?? raw.product);
  if (!description) return null;
  return {
    item_number: str(raw.item_number ?? raw.item_no ?? raw.itemNumber ?? raw.sku ?? raw.part ?? raw.part_number),
    description,
    quantity: num(raw.quantity ?? raw.qty ?? raw.count, 1) || 1,
    unit_price: num(raw.unit_price ?? raw.unitPrice ?? raw.price ?? raw.unit_cost ?? raw.cost, 0),
    unit: str(raw.unit ?? raw.uom ?? raw.units) || "ea",
  };
}

function normLabor(raw: Raw): EstimateLaborItem | null {
  const description = str(raw.description ?? raw.desc ?? raw.name ?? raw.task);
  if (!description) return null;
  const hours = num(raw.hours ?? raw.hrs ?? raw.qty ?? raw.quantity, 0);
  const rate = num(raw.rate ?? raw.hourly_rate ?? raw.price, 60) || 60;
  const cost = num(raw.cost, hours * rate);
  return { description, hours, rate, cost: cost || hours * rate };
}

export function parseEstimateFile(filename: string, text: string): ParsedEstimateImport {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("That file is empty.");
  const looksJson = /\.json$/i.test(filename) || trimmed.startsWith("{") || trimmed.startsWith("[");
  return looksJson ? parseJson(trimmed) : parseCsv(trimmed);
}

function parseJson(text: string): ParsedEstimateImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON. Re-export it or check for a stray comma.");
  }
  const obj: Raw = Array.isArray(data)
    ? { line_items: data }
    : data && typeof data === "object"
    ? (data as Raw)
    : (() => {
        throw new Error("Expected a JSON object or an array of line items.");
      })();

  const rawLines = obj.line_items ?? obj.lineItems ?? obj.materials ?? obj.items;
  const rawLabor = obj.labor_items ?? obj.laborItems ?? obj.labor;
  const lineItems = Array.isArray(rawLines)
    ? (rawLines.map((r) => normLine(r as Raw)).filter(Boolean) as EstimateLineItem[])
    : [];
  const laborItems = Array.isArray(rawLabor)
    ? (rawLabor.map((r) => normLabor(r as Raw)).filter(Boolean) as EstimateLaborItem[])
    : [];

  const out: ParsedEstimateImport = { lineItems, laborItems };
  const pn = str(obj.project_name ?? obj.projectName ?? obj.project);
  if (pn) out.projectName = pn;
  if (obj.markup_percent != null || obj.markupPercent != null || obj.markup != null) {
    out.markupPercent = num(obj.markup_percent ?? obj.markupPercent ?? obj.markup);
  }
  const notes = str(obj.notes);
  if (notes) out.notes = notes;
  return out;
}

// ── CSV (materials only) ────────────────────────────────────────────────────

function parseCsv(text: string): ParsedEstimateImport {
  const rows = csvRows(text);
  if (rows.length === 0) throw new Error("That CSV has no rows.");

  const first = rows[0].map((h) => h.toLowerCase().trim());
  const hasHeader = first.some((h) => /desc|item|qty|quantity|price|unit|cost|sku|part|name/.test(h));

  let colmap: Partial<Record<keyof EstimateLineItem, number>>;
  let dataRows: string[][];
  if (hasHeader) {
    colmap = mapColumns(first);
    dataRows = rows.slice(1);
  } else {
    // Positional fallback: item_number, description, quantity, unit_price, unit
    colmap = { item_number: 0, description: 1, quantity: 2, unit_price: 3, unit: 4 };
    dataRows = rows;
  }
  if (colmap.description == null) {
    throw new Error("CSV needs a 'description' column (plus quantity, unit price, unit).");
  }

  const at = (r: string[], i?: number) => (i != null ? r[i] : undefined);
  const lineItems = dataRows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) =>
      normLine({
        item_number: at(r, colmap.item_number),
        description: at(r, colmap.description),
        quantity: at(r, colmap.quantity),
        unit_price: at(r, colmap.unit_price),
        unit: at(r, colmap.unit),
      })
    )
    .filter(Boolean) as EstimateLineItem[];

  if (lineItems.length === 0) throw new Error("No rows with a description were found in that CSV.");
  return { lineItems, laborItems: [] };
}

function mapColumns(header: string[]): Partial<Record<keyof EstimateLineItem, number>> {
  const find = (...pats: RegExp[]) => header.findIndex((h) => pats.some((p) => p.test(h)));
  const map: Partial<Record<keyof EstimateLineItem, number>> = {};
  const set = (key: keyof EstimateLineItem, idx: number) => {
    if (idx >= 0) map[key] = idx;
  };
  set("item_number", find(/item.?(number|no|#)/, /^sku$/, /part/));
  set("description", find(/desc/, /^item$/, /^name$/, /product/));
  set("quantity", find(/qty/, /quantity/, /count/));
  set("unit_price", find(/unit.?price/, /^price$/, /unit.?cost/, /^cost$/, /each/));
  set("unit", find(/^unit$/, /^units$/, /uom/));
  return map;
}

// Minimal RFC-4180-ish CSV: handles quoted fields, escaped "" quotes, and
// CRLF/LF line endings.
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\n") {
      endRow();
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ""));
}
