#!/usr/bin/env node
// Axiom MCP server — stdio transport. Read-only v1 (build steps 1-3):
// connection/auth with session refresh, shared helpers, and the read tools
// get_estimate / list_estimates / get_project. No write tools yet.

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./tools.js";
import { WRITE_TOOLS } from "./writes.js";
import type { ToolResult } from "./types.js";

const ALL_TOOLS = [...TOOLS, ...WRITE_TOOLS];

async function main(): Promise<void> {
  const server = new Server(
    { name: "axiom-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<ToolResult> => {
    const { name, arguments: args } = req.params;
    const tool = ALL_TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      return await tool.handler((args ?? {}) as Record<string, unknown>);
    } catch (e) {
      // Fail closed with a clear message; never surface raw stack/env values.
      const message = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP protocol channel.
  console.error("[axiom-mcp] running on stdio");
}

main().catch((e) => {
  console.error("[axiom-mcp] fatal:", e);
  process.exit(1);
});
