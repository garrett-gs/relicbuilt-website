import { NextRequest, NextResponse } from "next/server";
import { BusinessEntity } from "@/types/axiom";
import { identifyCaller, AuthError, CallerContext } from "@/lib/assistant/identity";
import {
  TOOLS,
  toolKind,
  toolRisk,
  describeAction,
  runTool,
  buildContextBlurb,
} from "@/lib/assistant/tools";

/**
 * Axiom Assistant — a tool-using agent for daily operations.
 *
 * It can ONLY call the whitelisted data tools in @/lib/assistant/tools. It has
 * no ability to change code, schema, settings structure, or deploy anything.
 *
 * Confirmation model (matches the owner's rule — confirm anything we *do*):
 *   - READ tools run automatically, server-side, and the loop continues.
 *   - WRITE tools PAUSE. We return the proposed action to the client, which
 *     shows a Confirm/Cancel card. The card re-hits this route with `approve`.
 * Parallel tool use is disabled so each assistant turn is at most one tool.
 */

const MODEL = "claude-opus-4-5";
const MAX_STEPS = 10;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type Msg = { role: "user" | "assistant"; content: string | Block[] };

function textOf(content: string | Block[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function lastToolUse(messages: Msg[]): (Extract<Block, { type: "tool_use" }>) | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content;
    if (Array.isArray(c)) {
      const tu = [...c].reverse().find((b) => b.type === "tool_use");
      if (tu) return tu as Extract<Block, { type: "tool_use" }>;
    }
  }
  return null;
}

function systemPrompt(entity: BusinessEntity, callerName: string, contextBlurb: string): string {
  const brand = entity === "relic" ? "RELIC" : "Wallflower RELIC";
  const today = new Date().toISOString().slice(0, 10);
  return `You are the Axiom Assistant, an operations helper for ${brand}. Today is ${today}. You are helping ${callerName}.

You are currently working in the "${entity}" workspace. Every record you create or read belongs to this workspace — never mix Wallflower RELIC and Relic data.

Your job is to help with day-to-day operations: adding and updating customers and companies, managing work orders, drafting estimates and invoices, creating tasks, and logging inventory and expenses. Use the provided tools to do real work — do not just describe steps.

Rules:
- Use tools to look things up before answering questions about live data. Don't guess IDs, prices, or statuses.
- Before any tool that changes data, gather the details you need. If something required is missing, ask a short question instead of inventing values.
- Every write is confirmed by the user in the UI, so propose the specific change clearly. Keep your messages short and concrete.
- You cannot change the site's code, structure, or settings. If asked, explain that's outside what you can do.
- Money and outbound actions (invoices, marking paid, anything sent to a client) are treated as sensitive — be precise with amounts and names.
- Inventory/catalog item names are terse vendor SKUs — e.g. "IMP 3/4 BIRCH WHT RAW C2 VC WPF" is 3/4" birch plywood, "WP IMP 1/2 BIRCH WHT C2 VC WPF" is 1/2" birch plywood. When asked for a product or its price, call list_inventory, pick the best semantic match from the ranked results, and use its unit_cost as the price. If several plausibly match, name them and their prices and ask which.
- To add materials to an estimate: find the estimate (find_estimates), look up each product's price (list_inventory), then call add_estimate_line_items with the catalog unit_cost. Confirm the item and price you matched if there's any ambiguity before adding.
- If the user gives a product URL, use price_from_url to pull its name/price, show them what you found, and offer to add it to the catalog with add_inventory_item (unit_cost = the price).
- Prefer one action at a time. After an action is confirmed and done, briefly confirm what happened.

Live workspace context:
${contextBlurb}`;
}

async function callAnthropic(apiKey: string, system: string, messages: Msg[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: TOOLS,
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Assistant isn't configured (no API key)." }, { status: 500 });

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    let caller: CallerContext;
    try {
      caller = await identifyCaller(token);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const body = await req.json();
    const requested = (body.entity as BusinessEntity) || "wallflower_relic";
    // Never let a user operate in Relic without access — pin to Wallflower.
    const entity: BusinessEntity = requested === "relic" && caller.hasRelicAccess ? "relic" : "wallflower_relic";
    const approve = body.approve as { toolUseId: string; approved: boolean } | undefined;
    const messages = (body.messages || []) as Msg[];

    const ctx = { admin: caller.admin, entity, email: caller.email, hasRelicAccess: caller.hasRelicAccess };

    // If the client is resolving a paused write, apply (or decline) it first.
    if (approve) {
      const tu = lastToolUse(messages);
      if (!tu || tu.id !== approve.toolUseId) {
        return NextResponse.json({ error: "That action expired. Please try again." }, { status: 409 });
      }
      let result: Block;
      if (!approve.approved) {
        result = {
          type: "tool_result",
          tool_use_id: tu.id,
          content: "The user cancelled this action. Do not perform it. Acknowledge and ask what they'd like to do instead.",
        };
      } else {
        const r = await runTool(tu.name, tu.input, ctx);
        result = {
          type: "tool_result",
          tool_use_id: tu.id,
          content: r.ok ? JSON.stringify(r.data ?? { ok: true }) : `Error: ${r.error}`,
          is_error: !r.ok,
        };
      }
      messages.push({ role: "user", content: [result] });
    }

    const contextBlurb = await buildContextBlurb(ctx);
    const system = systemPrompt(entity, caller.member.name || caller.email, contextBlurb);

    // Agent loop: auto-run reads, pause on writes.
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await callAnthropic(apiKey, system, messages);
      const content = (data.content || []) as Block[];
      messages.push({ role: "assistant", content });

      if (data.stop_reason !== "tool_use") {
        return NextResponse.json({ messages, reply: textOf(content), done: true });
      }

      const tu = content.find((b) => b.type === "tool_use") as Extract<Block, { type: "tool_use" }> | undefined;
      if (!tu) {
        return NextResponse.json({ messages, reply: textOf(content), done: true });
      }

      const kind = toolKind(tu.name);
      if (kind === "read") {
        const r = await runTool(tu.name, tu.input, ctx);
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: tu.id,
              content: r.ok ? JSON.stringify(r.data ?? {}) : `Error: ${r.error}`,
              is_error: !r.ok,
            },
          ],
        });
        continue; // keep going — the model will use the result
      }

      // Write tool → pause for confirmation.
      const { title, summary } = describeAction(tu.name, tu.input);
      return NextResponse.json({
        messages,
        reply: textOf(content),
        pending: { toolUseId: tu.id, tool: tu.name, title, summary, risk: toolRisk(tu.name) },
        done: false,
      });
    }

    return NextResponse.json({ messages, reply: "That took too many steps — let's try a smaller request.", done: true });
  } catch (err) {
    console.error("[assistant] error:", err);
    return NextResponse.json({ error: "The assistant hit an error. Please try again." }, { status: 500 });
  }
}
