import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "https://jlkognkltdkzerzpcqpu.supabase.co/functions/v1/tasks-api";
const API_KEY = process.env.TESSIO_API_KEY;

if (!API_KEY) {
  console.error("TESSIO_API_KEY environment variable is required");
  process.exit(1);
}

async function apiCall(method, params = {}, body = null) {
  const url = new URL(API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API returned ${res.status}`);
  }

  return data;
}

const server = new McpServer({
  name: "tessio",
  version: "1.0.0",
});

// --- List tasks ---
server.tool(
  "tessio_list_tasks",
  "List tasks from Tessio with optional filters. Returns all incomplete tasks by default.",
  {
    location: z
      .enum([
        "today",
        "this-week",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "next-week",
        "later",
      ])
      .optional()
      .describe(
        'Filter by location/day. "today" resolves to the current weekday.'
      ),
    completed: z
      .enum(["true", "false"])
      .optional()
      .describe('Filter by completion status. Omit to get all tasks.'),
    workstream: z
      .string()
      .optional()
      .describe("Filter by workstream name (e.g. Chegg, Coding, Family)"),
    tag: z
      .string()
      .optional()
      .describe("Filter by tag name (e.g. API, email)"),
  },
  async ({ location, completed, workstream, tag }) => {
    const data = await apiCall("GET", { location, completed, workstream, tag });
    return {
      content: [{ type: "text", text: JSON.stringify(data.tasks, null, 2) }],
    };
  }
);

// --- Get single task ---
server.tool(
  "tessio_get_task",
  "Get a single task by ID with all fields.",
  {
    id: z.string().describe("The task ID"),
  },
  async ({ id }) => {
    const data = await apiCall("GET", { id });
    return {
      content: [{ type: "text", text: JSON.stringify(data.task, null, 2) }],
    };
  }
);

// --- List workstreams ---
server.tool(
  "tessio_list_workstreams",
  "List all workstreams (categories) available in Tessio. Use this to know valid workstream names before creating or updating tasks.",
  {},
  async () => {
    const data = await apiCall("GET", { resource: "workstreams" });
    return {
      content: [
        { type: "text", text: JSON.stringify(data.workstreams, null, 2) },
      ],
    };
  }
);

// --- Create task ---
server.tool(
  "tessio_create_task",
  'Create a new task in Tessio. Tasks land in "later" by default. Use location to schedule them for a specific day or week.',
  {
    title: z.string().describe("Task title (required)"),
    notes: z.string().optional().describe("Task notes/description"),
    location: z
      .enum([
        "today",
        "this-week",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "next-week",
        "later",
      ])
      .optional()
      .describe('Where to place the task. Defaults to "later".'),
    workstream: z
      .string()
      .optional()
      .describe("Workstream to assign the task to (e.g. 'Coding', 'Personal')."),
    tags: z
      .array(z.string())
      .optional()
      .describe('Tags to apply. "API" is always added automatically.'),
    activate_at: z
      .string()
      .optional()
      .describe(
        "ISO date (YYYY-MM-DD) for auto-promotion from later. Only relevant when location is later."
      ),
  },
  async ({ title, notes, location, workstream, tags, activate_at }) => {
    const data = await apiCall("POST", {}, { title, notes, location, workstream, tags, activate_at });
    return {
      content: [
        {
          type: "text",
          text: `Created task "${data.title}" (${data.id}) in ${data.location}`,
        },
      ],
    };
  }
);

// --- Update task ---
server.tool(
  "tessio_update_task",
  "Update a task's title, notes, location, tags, workstream, completion status, or sort order.",
  {
    id: z.string().describe("The task ID to update (required)"),
    title: z.string().optional().describe("New title"),
    notes: z.string().optional().describe("New notes"),
    location: z
      .enum([
        "today",
        "this-week",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "next-week",
        "later",
      ])
      .optional()
      .describe("Move task to this location"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Replace tags with this array"),
    workstream: z
      .string()
      .nullable()
      .optional()
      .describe("Set workstream name, or null to clear"),
    completed: z
      .boolean()
      .optional()
      .describe("Mark task complete (true) or incomplete (false)"),
    activate_at: z
      .string()
      .nullable()
      .optional()
      .describe("ISO date for auto-promotion, or null to clear"),
    sort_order: z
      .number()
      .optional()
      .describe("Set sort position within the location"),
  },
  async ({ id, title, notes, location, tags, workstream, completed, activate_at, sort_order }) => {
    const body = { id };
    if (title !== undefined) body.title = title;
    if (notes !== undefined) body.notes = notes;
    if (location !== undefined) body.location = location;
    if (tags !== undefined) body.tags = tags;
    if (workstream !== undefined) body.workstream = workstream;
    if (completed !== undefined) body.completed = completed;
    if (activate_at !== undefined) body.activate_at = activate_at;
    if (sort_order !== undefined) body.sort_order = sort_order;

    const data = await apiCall("PATCH", {}, body);
    const fields = Object.keys(data.updates || {}).join(", ");
    return {
      content: [
        { type: "text", text: `Updated task ${data.id}: ${fields}` },
      ],
    };
  }
);

// --- Complete task (convenience) ---
server.tool(
  "tessio_complete_task",
  "Mark a task as complete. Shortcut for update with completed=true.",
  {
    id: z.string().describe("The task ID to complete"),
  },
  async ({ id }) => {
    const data = await apiCall("PATCH", {}, { id, completed: true });
    return {
      content: [{ type: "text", text: `Completed task ${data.id}` }],
    };
  }
);

// --- Move task (convenience) ---
server.tool(
  "tessio_move_task",
  "Move a task to a different location/day. Shortcut for update with location.",
  {
    id: z.string().describe("The task ID to move"),
    location: z
      .enum([
        "today",
        "this-week",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "next-week",
        "later",
      ])
      .describe("Destination location"),
  },
  async ({ id, location }) => {
    const data = await apiCall("PATCH", {}, { id, location });
    return {
      content: [
        {
          type: "text",
          text: `Moved task ${data.id} to ${data.updates.location}`,
        },
      ],
    };
  }
);

// --- Delete task ---
server.tool(
  "tessio_delete_task",
  "Permanently delete a task from Tessio.",
  {
    id: z.string().describe("The task ID to delete"),
  },
  async ({ id }) => {
    const data = await apiCall("DELETE", { id });
    return {
      content: [{ type: "text", text: `Deleted task ${data.id}` }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
