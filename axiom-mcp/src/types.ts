// Canonical shapes, mirrored from src/types/axiom.ts in the main app.
// Money is decimal dollars (Postgres numeric), never integer cents.

export interface EstimateLineItem {
  item_number: string;
  description: string;
  quantity: number;
  unit_price: number; // dollars
  unit: string; // e.g. "ea", "roll", "ls", "hr"
}

export interface EstimateLaborItem {
  description: string;
  hours: number;
  rate: number; // dollars/hour
  cost: number; // dollars — stored directly, not derived
}

export interface Totals {
  materialTotal: number;
  laborTotal: number;
  subtotal: number;
  markupAmount: number;
  total: number;
  margin_percent: number;
}

// A tool handler's return value — the MCP CallTool result shape, taken
// straight from the SDK so it satisfies the request-handler signature.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export type ToolResult = CallToolResult;
