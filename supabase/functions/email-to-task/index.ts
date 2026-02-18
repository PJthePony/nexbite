import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  if (lower === "today") return getTodayLocation();
  if (VALID_LOCATIONS.includes(lower)) return lower;
  return null;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Mailgun Webhook Parsing ──────────────────────────────────────────────────

interface InboundEmail {
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  strippedText: string;
  bodyPlain: string;
  messageId: string;
}

function parseInboundWebhook(body: Record<string, unknown>): InboundEmail {
  const sender = (body["sender"] as string) || "";
  const fromHeader = (body["from"] as string) || sender;

  // Parse "Name <email>" format
  let fromName = "";
  const nameMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/);
  if (nameMatch) {
    fromName = nameMatch[1].replace(/^["']|["']$/g, "").trim();
  }

  const toStr = (body["To"] as string) || (body["to"] as string) || "";
  const to = toStr
    .split(",")
    .map((a: string) => a.trim())
    .filter(Boolean);

  // Extract Message-Id from headers
  let messageId = "";
  try {
    const headersJson = body["message-headers"] as string;
    if (headersJson) {
      const headers = JSON.parse(headersJson) as [string, string][];
      const msgIdHeader = headers.find(
        ([name]) => name.toLowerCase() === "message-id"
      );
      if (msgIdHeader) messageId = msgIdHeader[1];
    }
  } catch {
    // ignore header parse errors
  }

  return {
    from: sender,
    fromName,
    to,
    subject: (body["subject"] as string) || "(no subject)",
    strippedText: (body["stripped-text"] as string) || "",
    bodyPlain: (body["body-plain"] as string) || "",
    messageId,
  };
}

// ── Mailgun Webhook Signature Verification ───────────────────────────────────

async function verifyWebhookSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = encoder.encode(timestamp + token);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

// ── Mailgun Sending ──────────────────────────────────────────────────────────

async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  mailgunKey: string;
  mailgunDomain: string;
}) {
  const formData = new FormData();
  formData.append("from", `Tessio <tessio@${options.mailgunDomain}>`);
  formData.append("to", options.to);
  formData.append("subject", options.subject);
  formData.append("text", options.text);
  if (options.inReplyTo) {
    formData.append("h:In-Reply-To", options.inReplyTo);
  }

  const res = await fetch(
    `https://api.mailgun.net/v3/${options.mailgunDomain}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${options.mailgunKey}`)}`,
      },
      body: formData,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`Mailgun send error: ${err}`);
  }
}

// ── Claude Task Parsing ──────────────────────────────────────────────────────

interface ParsedTaskEmail {
  task_title: string;
  task_notes?: string;
  task_location: string;
  task_activate_at?: string;
  response_draft: string;
}

const PARSE_TASK_EMAIL_TOOL = {
  name: "parse_task_email",
  description:
    "Parse an email sent to Tessio and extract a task to create in the task manager",
  input_schema: {
    type: "object" as const,
    properties: {
      task_title: {
        type: "string",
        description:
          "A concise, action-oriented task title extracted from the email (e.g., 'Review Q4 budget proposal', 'Call dentist to reschedule').",
      },
      task_notes: {
        type: "string",
        description:
          "Additional context or details from the email body that provide useful notes for the task. Can be empty string if none.",
      },
      task_location: {
        type: "string",
        enum: [
          "today",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "this-week",
          "next-week",
          "later",
        ],
        description:
          "When this task should be scheduled. Map temporal cues from the email to a location value.",
      },
      task_activate_at: {
        type: "string",
        description:
          "ISO date (YYYY-MM-DD) for when a 'later' task should surface. Only set this when task_location is 'later' AND the sender mentioned a specific future date.",
      },
      response_draft: {
        type: "string",
        description:
          "A short, friendly confirmation message from Tessio acknowledging the task was created. Mention the task title and when it's scheduled. Do NOT sign off — the system appends '- Tessio'.",
      },
    },
    required: ["task_title", "task_location", "response_draft"],
  },
};

async function parseTaskEmail(
  emailBody: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  timezone: string,
  anthropicKey: string
): Promise<ParsedTaskEmail> {
  const tz = timezone || "America/New_York";
  const now = new Date();
  const nowLocal = now.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const todayWeekday = now
    .toLocaleDateString("en-US", { weekday: "long", timeZone: tz })
    .toLowerCase();

  const systemPrompt = `You are Tessio, a friendly AI task manager. Someone has emailed you directly to create a task or reminder. Your job is to extract a clear, actionable task from the email.

Current date/time: ${nowLocal} (${tz})
Today is ${todayWeekday}.

LOCATION MAPPING (critical — follow these rules exactly):
- "today", "asap", "urgent", or no time specified → "today"
- "tomorrow" → the next weekday name in lowercase (e.g., if today is Wednesday, use "thursday"; if today is Friday, use "monday")
- A specific weekday name for THIS week (today or a later day this week) → that day in lowercase (e.g., "wednesday")
- A weekday name for NEXT week (e.g., "next Tuesday", "next Monday") → "next-week"
- "this week" / "sometime this week" → "this-week"
- "next week" → "next-week"
- A specific date more than 2 weeks out → "later" AND set task_activate_at to that date (YYYY-MM-DD)
- "later", "whenever", "no rush", "low priority" → "later" (do NOT set task_activate_at)

TASK EXTRACTION:
- Make the task title concise and action-oriented
- If the subject line IS the task, use it as the title

FORWARDED THREADS & CONTEXT:
- The email may contain a forwarded thread or quoted conversation below the sender's message
- Your job is to extract relevant context from the ENTIRE email (including forwarded/quoted content) and put it in task_notes
- Summarize the key context from the thread: who's involved, what's being discussed, any deadlines or details mentioned, and what the sender needs to do
- Keep task_notes concise but useful — someone reading the task later should understand the context without re-reading the email thread
- Format notes as plain text with line breaks for readability
- If there's no forwarded content, just pull any relevant details from the body into notes

RESPONSE:
- Write a brief, warm confirmation. Mention the task title and when it's scheduled.
- Example: "Got it! I've added 'Review Q4 budget' to your tasks for Thursday."
- Example for later: "Added 'Update the wiki' to your backlog — no rush."`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [PARSE_TASK_EMAIL_TOOL],
      tool_choice: { type: "tool", name: "parse_task_email" },
      messages: [
        {
          role: "user",
          content: `From: ${senderName || senderEmail} <${senderEmail}>\nSubject: ${subject}\n\n${emailBody}\n\nIMPORTANT: The sender's instruction is at the TOP of the email body. Everything below (forwarded messages, quoted replies, "---------- Forwarded message ----------" sections) is CONTEXT. Extract the task from the sender's instruction, and summarize the relevant thread context into task_notes.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const toolUse = data.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new Error("Claude did not return a tool use response for task parsing");
  }

  const input = toolUse.input as Record<string, unknown>;
  return {
    task_title: input.task_title as string,
    task_notes: (input.task_notes as string) || undefined,
    task_location: input.task_location as string,
    task_activate_at: (input.task_activate_at as string) || undefined,
    response_draft: input.response_draft as string,
  };
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const mailgunKey = Deno.env.get("MAILGUN_API_KEY")!;
  const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN") || "tanzillo.ai";
  const mailgunSigningKey = Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  let body: Record<string, unknown>;
  try {
    const formData = await req.formData();
    body = {};
    for (const [key, value] of formData.entries()) {
      body[key] = typeof value === "string" ? value : String(value);
    }
  } catch {
    return jsonResponse({ error: "Invalid form data" }, 400);
  }

  // Verify Mailgun webhook signature
  if (mailgunSigningKey) {
    const timestamp = body["timestamp"] as string;
    const token = body["token"] as string;
    const signature = body["signature"] as string;
    if (timestamp && token && signature) {
      const valid = await verifyWebhookSignature(
        timestamp,
        token,
        signature,
        mailgunSigningKey
      );
      if (!valid) {
        console.error("Invalid webhook signature");
        return jsonResponse({ error: "Invalid signature" }, 403);
      }
    }
  }

  const email = parseInboundWebhook(body);

  // Use full body so Claude can extract context from forwarded threads.
  // Prefer body-plain (includes quoted/forwarded content) over stripped-text
  // (which Mailgun strips of quoted replies). If the sender forwarded an
  // email thread, the context lives in the quoted portion.
  const emailText = email.bodyPlain || email.strippedText;

  // Helper to send error replies
  const replyWithError = async (message: string) => {
    await sendEmail({
      to: email.from,
      subject: email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`,
      text: `${message}\n\n- Tessio`,
      inReplyTo: email.messageId || undefined,
      mailgunKey,
      mailgunDomain,
    });
  };

  try {
    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${supabaseServiceKey}` },
      },
    });

    // Look up sender in auth.users by email
    const { data: authData, error: authError } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (authError) {
      console.error("Failed to list users:", authError);
      await replyWithError(
        "Sorry, I ran into an error looking up your account. Please try again later."
      );
      return jsonResponse({ status: "error", message: "Auth lookup failed" }, 500);
    }

    const user = authData?.users?.find(
      (u: { email?: string }) =>
        u.email?.toLowerCase() === email.from.toLowerCase()
    );

    if (!user) {
      console.warn(`Email from unregistered user: ${email.from}`);
      await replyWithError(
        "I don't recognize your email address. You need a Tessio account to create tasks via email. Sign up at tessio.tanzillo.ai and try again!"
      );
      return jsonResponse({ status: "no_user" }, 200);
    }

    // Parse the email with Claude to extract the task
    const parsed = await parseTaskEmail(
      emailText,
      email.from,
      email.fromName,
      email.subject,
      "America/New_York",
      anthropicKey
    );

    // Resolve the task location
    const location = resolveLocation(parsed.task_location) || "later";

    // Get next sort order for this location
    const { data: existingTasks } = await supabase
      .from("tasks")
      .select("sort_order")
      .eq("user_id", user.id)
      .eq("location", location)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existingTasks && existingTasks.length > 0
        ? (existingTasks[0].sort_order ?? 0) + 1
        : 0;

    // Insert the task
    const task = {
      id: generateId(),
      user_id: user.id,
      title: parsed.task_title,
      notes: parsed.task_notes?.trim() || "",
      completed: false,
      location,
      workstream: null,
      tags: ["email"],
      created_at: Date.now(),
      completed_at: null,
      activate_at: parsed.task_activate_at?.trim() || null,
      sort_order: nextSortOrder,
      parent_task_id: null,
    };

    const { error: insertError } = await supabase.from("tasks").insert(task);

    if (insertError) {
      console.error("Failed to insert task:", insertError);
      await replyWithError(
        "I understood your task, but hit an error saving it. Please try again or add it directly at tessio.tanzillo.ai."
      );
      return jsonResponse({ status: "error", message: "Insert failed" }, 500);
    }

    // Send confirmation reply
    await sendEmail({
      to: email.from,
      subject: email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`,
      text: `${parsed.response_draft}\n\n- Tessio`,
      inReplyTo: email.messageId || undefined,
      mailgunKey,
      mailgunDomain,
    });

    return jsonResponse({ status: "task_created", taskId: task.id }, 200);
  } catch (err) {
    console.error("=== EMAIL-TO-TASK ERROR ===");
    console.error("Error:", err);
    console.error("Stack:", err instanceof Error ? err.stack : "no stack");

    await replyWithError(
      "Something went wrong while processing your email. Please try again later or add the task directly at tessio.tanzillo.ai."
    );

    return jsonResponse({ status: "error", message: "Internal server error" }, 500);
  }
});
