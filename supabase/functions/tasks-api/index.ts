import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const VALID_LOCATIONS = [
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
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getTodayLocation(): string {
  const day = new Date().getDay();
  const dayMap: Record<number, string> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };
  return dayMap[day] || "monday";
}

function resolveLocation(input: string): string | null {
  const lower = input.toLowerCase().trim();

  if (lower === "today") {
    return getTodayLocation();
  }

  if (VALID_LOCATIONS.includes(lower)) {
    return lower;
  }

  return null;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type AuthResult =
  | { userId: string; isServiceCall: false }
  | { isServiceCall: true };

async function authenticate(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<AuthResult | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "Missing or invalid Authorization header. Use: Bearer nb_your_key" },
      401
    );
  }

  const apiKey = authHeader.slice(7).trim();

  // Service-to-service auth (e.g., Luca creating tasks on behalf of users)
  const serviceSecret = Deno.env.get("TESSIO_SERVICE_SECRET");
  if (serviceSecret && apiKey === serviceSecret) {
    return { isServiceCall: true };
  }

  if (!apiKey.startsWith("nb_")) {
    return jsonResponse({ error: "Invalid API key format" }, 401);
  }

  const keyHash = await hashKey(apiKey);
  const { data: keyRow, error: keyError } = await supabase
    .from("api_keys")
    .select("user_id")
    .eq("key_hash", keyHash)
    .single();

  if (keyError || !keyRow) {
    return jsonResponse({ error: "Invalid API key" }, 401);
  }

  // Update last_used_at (fire and forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash)
    .then(() => {});

  return { userId: keyRow.user_id, isServiceCall: false };
}

// GET — list tasks with optional filters
async function handleGetTasks(
  req: Request,
  userId: string,
  supabase: ReturnType<typeof createClient>
) {
  const url = new URL(req.url);
  const location = url.searchParams.get("location");
  const completed = url.searchParams.get("completed");

  let query = supabase
    .from("tasks")
    .select("id, title, notes, completed, location, workstream, tags, created_at, completed_at, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (location) {
    const resolved = resolveLocation(location);
    if (!resolved) {
      return jsonResponse(
        {
          error: `Invalid location "${location}". Valid values: today, this-week, monday, tuesday, wednesday, thursday, friday, saturday, sunday, next-week, later`,
        },
        400
      );
    }
    query = query.eq("location", resolved);
  }

  if (completed === "true") {
    query = query.eq("completed", true);
  } else if (completed === "false") {
    query = query.eq("completed", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch tasks:", error);
    return jsonResponse({ error: "Failed to fetch tasks" }, 500);
  }

  return jsonResponse({ tasks: data || [] }, 200);
}

interface TaskBody {
  title?: string;
  notes?: string;
  location?: string;
  tags?: string[];
  activate_at?: string;
  target_user_id?: string;
}

// POST — create a task
async function handleCreateTask(
  body: TaskBody,
  userId: string,
  supabase: ReturnType<typeof createClient>
) {
  const title = body.title?.trim();
  if (!title) {
    return jsonResponse(
      { error: '"title" is required and must be a non-empty string' },
      400
    );
  }

  const locationInput = body.location || "later";
  const location = resolveLocation(locationInput);
  if (!location) {
    return jsonResponse(
      {
        error: `Invalid location "${locationInput}". Valid values: today, this-week, monday, tuesday, wednesday, thursday, friday, saturday, sunday, next-week, later`,
      },
      400
    );
  }

  const notes = body.notes?.trim() || "";

  // Get next sort order for this location
  const { data: existingTasks } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("location", location)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSortOrder =
    existingTasks && existingTasks.length > 0
      ? (existingTasks[0].sort_order ?? 0) + 1
      : 0;

  const task = {
    id: generateId(),
    user_id: userId,
    title,
    notes,
    completed: false,
    location,
    workstream: null,
    tags: [...new Set(["API", ...(Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string").map(t => t.trim()).filter(Boolean) : [])])],
    created_at: Date.now(),
    completed_at: null,
    activate_at: body.activate_at?.trim() || null,
    sort_order: nextSortOrder,
    parent_task_id: null,
  };

  const { error: insertError } = await supabase.from("tasks").insert(task);

  if (insertError) {
    console.error("Failed to insert task:", insertError);
    return jsonResponse({ error: "Failed to create task" }, 500);
  }

  return jsonResponse(
    {
      id: task.id,
      title: task.title,
      notes: task.notes,
      location: task.location,
      created_at: task.created_at,
    },
    201
  );
}

interface PatchBody {
  id: string;
  location?: string;
  title?: string;
  notes?: string;
  tags?: string[];
  activate_at?: string | null;
  target_user_id?: string;
}

// PATCH — update a task
async function handleUpdateTask(
  body: PatchBody,
  userId: string,
  supabase: ReturnType<typeof createClient>
) {
  const taskId = body.id?.trim();
  if (!taskId) {
    return jsonResponse(
      { error: '"id" is required' },
      400
    );
  }

  // Verify task belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !existing) {
    return jsonResponse({ error: "Task not found" }, 404);
  }

  const updates: Record<string, unknown> = {};

  if (body.location !== undefined) {
    const resolved = resolveLocation(body.location);
    if (!resolved) {
      return jsonResponse(
        {
          error: `Invalid location "${body.location}". Valid values: today, this-week, monday, tuesday, wednesday, thursday, friday, saturday, sunday, next-week, later`,
        },
        400
      );
    }
    updates.location = resolved;
  }

  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.notes !== undefined) updates.notes = body.notes.trim();
  if (body.tags !== undefined) {
    updates.tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string").map(t => t.trim()).filter(Boolean)
      : [];
  }
  if ("activate_at" in body) updates.activate_at = body.activate_at;

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: "No fields to update" }, 400);
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("user_id", userId);

  if (updateError) {
    console.error("Failed to update task:", updateError);
    return jsonResponse({ error: "Failed to update task" }, 500);
  }

  return jsonResponse({ ok: true, id: taskId, updates }, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const allowedMethods = ["GET", "POST", "PATCH"];
  if (!allowedMethods.includes(req.method)) {
    return jsonResponse({ error: `Method not allowed. Use ${allowedMethods.join(", ")}.` }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${supabaseServiceKey}` },
      },
    });

    const authResult = await authenticate(req, supabase);
    if (authResult instanceof Response) {
      return authResult;
    }

    if (req.method === "GET") {
      if (authResult.isServiceCall) {
        return jsonResponse({ error: "Service keys only support POST" }, 405);
      }
      return await handleGetTasks(req, authResult.userId, supabase);
    }

    // POST/PATCH — parse body once
    let body: TaskBody & PatchBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // Resolve effective userId
    let userId: string;
    if (authResult.isServiceCall) {
      if (!body.target_user_id || typeof body.target_user_id !== "string") {
        return jsonResponse(
          { error: "Service calls require target_user_id (Supabase auth UUID)" },
          400
        );
      }
      userId = body.target_user_id;
    } else {
      userId = authResult.userId;
    }

    if (req.method === "PATCH") {
      return await handleUpdateTask(body, userId, supabase);
    }

    return await handleCreateTask(body, userId, supabase);
  } catch (error) {
    console.error("Function error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
