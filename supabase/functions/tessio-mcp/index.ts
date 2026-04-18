/**
 * Tessio MCP Server — Supabase Edge Function
 *
 * Implements the MCP (Model Context Protocol) Streamable HTTP transport
 * directly via JSON-RPC 2.0, without the SDK (which has Node.js deps
 * that don't work cleanly in Deno).
 *
 * Supports: initialize, tools/list, tools/call
 * Auth: Bearer nb_ token, or OAuth 2.0 client_credentials flow
 *       (for Claude Co-Work custom connector)
 */

const BASE_URL = "https://jlkognkltdkzerzpcqpu.supabase.co/functions/v1/tessio-mcp";
const TASKS_API_BASE = "https://jlkognkltdkzerzpcqpu.supabase.co/functions/v1/tasks-api";

// --- Tessio API helper ---
async function apiCall(apiKey: string, method: string, params: Record<string, string | undefined> = {}, body: unknown = null) {
  const url = new URL(TASKS_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url.toString(), options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API returned ${res.status}`);
  }

  return data;
}

// --- Auth ---
function authenticateRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith("nb_")) return token;
  }
  const serverKey = Deno.env.get("TESSIO_API_KEY");
  if (serverKey) return serverKey;
  return null;
}

// --- OAuth 2.0 support for Co-Work ---

function getSubpath(req: Request): string {
  const url = new URL(req.url);
  // Supabase Edge Function path: /functions/v1/tessio-mcp/...
  const match = url.pathname.match(/\/tessio-mcp(\/.*)?$/);
  return match?.[1] || "/";
}

function handleOAuthProtectedResource(): Response {
  // RFC 9728: OAuth Protected Resource Metadata
  return new Response(
    JSON.stringify({
      resource: BASE_URL,
      authorization_servers: [BASE_URL],
      bearer_methods_supported: ["header"],
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function handleOAuthAuthorizationServer(): Response {
  // RFC 8414: OAuth Authorization Server Metadata
  return new Response(
    JSON.stringify({
      issuer: BASE_URL,
      token_endpoint: `${BASE_URL}/token`,
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      grant_types_supported: ["client_credentials"],
      response_types_supported: ["token"],
      service_documentation: "https://tessio.tanzillo.ai",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleTokenRequest(req: Request): Promise<Response> {
  // OAuth 2.0 Client Credentials Grant (RFC 6749 §4.4)
  let clientId = "";
  let clientSecret = "";

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const grantType = params.get("grant_type");
    if (grantType !== "client_credentials") {
      return new Response(
        JSON.stringify({ error: "unsupported_grant_type", error_description: "Only client_credentials is supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clientId = params.get("client_id") || "";
    clientSecret = params.get("client_secret") || "";
  } else if (contentType.includes("application/json")) {
    const body = await req.json();
    if (body.grant_type !== "client_credentials") {
      return new Response(
        JSON.stringify({ error: "unsupported_grant_type", error_description: "Only client_credentials is supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clientId = body.client_id || "";
    clientSecret = body.client_secret || "";
  }

  // Also support HTTP Basic auth for client credentials
  if (!clientSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Basic ")) {
      const decoded = atob(authHeader.slice(6));
      const colonIndex = decoded.indexOf(":");
      if (colonIndex > -1) {
        clientId = clientId || decoded.slice(0, colonIndex);
        clientSecret = decoded.slice(colonIndex + 1);
      }
    }
  }

  // Validate: client_secret must be an nb_ API key
  if (!clientSecret.startsWith("nb_")) {
    return new Response(
      JSON.stringify({ error: "invalid_client", error_description: "client_secret must be a valid Tessio API key (nb_...)" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Verify the key works by making a lightweight API call
  try {
    await apiCall(clientSecret, "GET", { resource: "workstreams" });
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "invalid_client", error_description: "API key validation failed" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Issue the API key as the access token
  return new Response(
    JSON.stringify({
      access_token: clientSecret,
      token_type: "bearer",
      // No expiry — nb_ keys don't expire
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}

// --- Tool definitions ---
const LOCATIONS = [
  "today", "this-week", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday", "sunday", "next-week", "later",
];

const TOOLS = [
  {
    name: "tessio_list_tasks",
    description: "List tasks from Tessio with optional filters. Returns all incomplete tasks by default.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", enum: LOCATIONS, description: 'Filter by location/day. "today" resolves to the current weekday.' },
        completed: { type: "string", enum: ["true", "false"], description: "Filter by completion status." },
        workstream: { type: "string", description: "Filter by workstream name" },
        tag: { type: "string", description: "Filter by tag name" },
      },
    },
  },
  {
    name: "tessio_get_task",
    description: "Get a single task by ID with all fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The task ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "tessio_list_workstreams",
    description: "List all workstreams (categories) available in Tessio.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tessio_create_task",
    description: 'Create a new task in Tessio. Tasks land in "later" by default.',
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (required)" },
        notes: { type: "string", description: "Task notes/description" },
        location: { type: "string", enum: LOCATIONS, description: 'Where to place the task. Defaults to "later".' },
        workstream: { type: "string", description: "Workstream to assign the task to (e.g. 'Coding', 'Personal')." },
        tags: { type: "array", items: { type: "string" }, description: "Tags to apply." },
        activate_at: { type: "string", description: "ISO date (YYYY-MM-DD) for auto-promotion from later." },
      },
      required: ["title"],
    },
  },
  {
    name: "tessio_update_task",
    description: "Update a task's title, notes, location, tags, workstream, completion status, or sort order.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The task ID to update (required)" },
        title: { type: "string", description: "New title" },
        notes: { type: "string", description: "New notes" },
        location: { type: "string", enum: LOCATIONS, description: "Move task to this location" },
        tags: { type: "array", items: { type: "string" }, description: "Replace tags with this array" },
        workstream: { type: ["string", "null"], description: "Set workstream name, or null to clear" },
        completed: { type: "boolean", description: "Mark task complete (true) or incomplete (false)" },
        activate_at: { type: ["string", "null"], description: "ISO date for auto-promotion, or null to clear" },
        sort_order: { type: "number", description: "Set sort position within the location" },
      },
      required: ["id"],
    },
  },
  {
    name: "tessio_complete_task",
    description: "Mark a task as complete.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The task ID to complete" },
      },
      required: ["id"],
    },
  },
  {
    name: "tessio_move_task",
    description: "Move a task to a different location/day.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The task ID to move" },
        location: { type: "string", enum: LOCATIONS, description: "Destination location" },
      },
      required: ["id", "location"],
    },
  },
  {
    name: "tessio_delete_task",
    description: "Permanently delete a task from Tessio.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The task ID to delete" },
      },
      required: ["id"],
    },
  },
];

// --- Tool execution ---
async function executeTool(apiKey: string, name: string, args: Record<string, unknown> = {}): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  try {
    switch (name) {
      case "tessio_list_tasks": {
        const data = await apiCall(apiKey, "GET", {
          location: args.location as string | undefined,
          completed: args.completed as string | undefined,
          workstream: args.workstream as string | undefined,
          tag: args.tag as string | undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(data.tasks, null, 2) }] };
      }
      case "tessio_get_task": {
        const data = await apiCall(apiKey, "GET", { id: args.id as string });
        return { content: [{ type: "text", text: JSON.stringify(data.task, null, 2) }] };
      }
      case "tessio_list_workstreams": {
        const data = await apiCall(apiKey, "GET", { resource: "workstreams" });
        return { content: [{ type: "text", text: JSON.stringify(data.workstreams, null, 2) }] };
      }
      case "tessio_create_task": {
        const data = await apiCall(apiKey, "POST", {}, {
          title: args.title,
          notes: args.notes,
          location: args.location,
          workstream: args.workstream,
          tags: args.tags,
          activate_at: args.activate_at,
        });
        return { content: [{ type: "text", text: `Created task "${data.title}" (${data.id}) in ${data.location}` }] };
      }
      case "tessio_update_task": {
        const body: Record<string, unknown> = { id: args.id };
        for (const field of ["title", "notes", "location", "tags", "workstream", "completed", "activate_at", "sort_order"]) {
          if (args[field] !== undefined) body[field] = args[field];
        }
        const data = await apiCall(apiKey, "PATCH", {}, body);
        const fields = Object.keys(data.updates || {}).join(", ");
        return { content: [{ type: "text", text: `Updated task ${data.id}: ${fields}` }] };
      }
      case "tessio_complete_task": {
        await apiCall(apiKey, "PATCH", {}, { id: args.id, completed: true });
        return { content: [{ type: "text", text: `Completed task ${args.id}` }] };
      }
      case "tessio_move_task": {
        const data = await apiCall(apiKey, "PATCH", {}, { id: args.id, location: args.location });
        return { content: [{ type: "text", text: `Moved task ${data.id} to ${data.updates.location}` }] };
      }
      case "tessio_delete_task": {
        await apiCall(apiKey, "DELETE", { id: args.id as string });
        return { content: [{ type: "text", text: `Deleted task ${args.id}` }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
  }
}

// --- JSON-RPC helpers ---
function jsonrpcResponse(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// --- Handle a single JSON-RPC request ---
async function handleRpcRequest(apiKey: string, req: { jsonrpc: string; method: string; params?: Record<string, unknown>; id?: string | number | null }) {
  const id = req.id ?? null;

  switch (req.method) {
    case "initialize":
      return jsonrpcResponse(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "tessio", version: "1.0.0" },
      });

    case "notifications/initialized":
      // Client acknowledgment — no response needed for notifications
      return null;

    case "tools/list":
      return jsonrpcResponse(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = req.params?.name as string;
      const toolArgs = (req.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await executeTool(apiKey, toolName, toolArgs);
      return jsonrpcResponse(id, result);
    }

    default:
      return jsonrpcError(id, -32601, `Method not found: ${req.method}`);
  }
}

// --- CORS ---
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-session-id, last-event-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

// --- Main handler ---
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const subpath = getSubpath(req);

  // --- OAuth discovery & token endpoints (no auth required) ---

  // RFC 9728: Protected Resource Metadata
  if (req.method === "GET" && subpath === "/.well-known/oauth-protected-resource") {
    return handleOAuthProtectedResource();
  }

  // RFC 8414: Authorization Server Metadata
  if (req.method === "GET" && subpath === "/.well-known/oauth-authorization-server") {
    return handleOAuthAuthorizationServer();
  }

  // OAuth token endpoint
  if (req.method === "POST" && subpath === "/token") {
    return await handleTokenRequest(req);
  }

  // --- MCP endpoints (auth required) ---

  const apiKey = authenticateRequest(req);
  if (!apiKey) {
    // Return 401 with pointer to OAuth metadata per MCP auth spec
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Bearer token required" }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`,
        },
      }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify(jsonrpcError(null, -32000, "Method not allowed. Use POST.")),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    // Handle batch requests (array of JSON-RPC messages)
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map((r: any) => handleRpcRequest(apiKey, r)));
      const responses = results.filter((r) => r !== null);
      return new Response(
        JSON.stringify(responses.length === 1 ? responses[0] : responses),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single request
    const result = await handleRpcRequest(apiKey, body);
    if (result === null) {
      // Notification — no response body
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("MCP server error:", err);
    return new Response(
      JSON.stringify(jsonrpcError(null, -32700, "Parse error")),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
