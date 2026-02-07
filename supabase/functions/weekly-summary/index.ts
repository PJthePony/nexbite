import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface Task {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  location: string;
  workstream: string | null;
  tags: string[];
  created_at: number;
  completed_at: number | null;
  sort_order: number;
  parent_task_id: string | null;
  user_id: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify cron secret
    const cronSecret = Deno.env.get("CRON_SECRET");
    const requestSecret = req.headers.get("x-cron-secret");

    if (!cronSecret || requestSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const mailgunKey = Deno.env.get("MAILGUN_API_KEY")!;
    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN")!;

    // Get all distinct user IDs from tasks
    const { data: userRows, error: usersError } = await supabase
      .from("tasks")
      .select("user_id")
      .limit(1000);

    if (usersError) {
      throw new Error(`Failed to query users: ${usersError.message}`);
    }

    const uniqueUserIds = [
      ...new Set(
        (userRows || []).map((r: { user_id: string }) => r.user_id)
      ),
    ];
    console.log(`Found ${uniqueUserIds.length} unique users`);

    // Get user emails from auth
    const { data: authData, error: authError } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (authError) {
      throw new Error(`Failed to list users: ${authError.message}`);
    }

    const emailMap: Record<string, string> = {};
    (authData?.users || []).forEach(
      (u: { id: string; email?: string }) => {
        if (u.email) emailMap[u.id] = u.email;
      }
    );

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const results: string[] = [];

    for (const userId of uniqueUserIds) {
      const email = emailMap[userId];
      if (!email) {
        console.log(`No email for user ${userId}, skipping`);
        continue;
      }

      try {
        // Fetch ALL tasks for this user (for context: pending counts, bite relationships)
        const { data: allTasks, error: allError } = await supabase
          .from("tasks")
          .select("*")
          .eq("user_id", userId);

        if (allError) {
          console.error(
            `Failed to fetch tasks for ${userId}: ${allError.message}`
          );
          continue;
        }

        const tasks: Task[] = allTasks || [];

        // Tasks completed in the past 7 days
        const completedThisWeek = tasks.filter(
          (t) =>
            t.completed && t.completed_at && t.completed_at >= sevenDaysAgo
        );

        if (completedThisWeek.length === 0) {
          console.log(`User ${userId} has 0 completions, skipping`);
          continue;
        }

        // Tasks created in the past 7 days
        const createdThisWeek = tasks.filter(
          (t) => t.created_at && t.created_at >= sevenDaysAgo
        );

        // Pending tasks (not completed)
        const pendingTasks = tasks.filter((t) => !t.completed);

        // Build bite relationship map (parentId -> bite task titles)
        const biteMap: Record<string, string[]> = {};
        tasks.forEach((t) => {
          if (t.parent_task_id) {
            if (!biteMap[t.parent_task_id]) biteMap[t.parent_task_id] = [];
            biteMap[t.parent_task_id].push(t.title);
          }
        });

        // Group completed tasks by workstream
        const byWorkstream: Record<string, Task[]> = {};
        completedThisWeek.forEach((t) => {
          const ws = t.workstream || "No Workstream";
          if (!byWorkstream[ws]) byWorkstream[ws] = [];
          byWorkstream[ws].push(t);
        });

        // Build structured data for AI
        const taskSummaryData = Object.entries(byWorkstream)
          .map(([ws, wsTasks]) => {
            const taskLines = wsTasks
              .map((t) => {
                const bites = biteMap[t.id];
                const biteInfo =
                  bites && bites.length > 0
                    ? ` (bites: ${bites.join(", ")})`
                    : "";
                const parentTask = t.parent_task_id
                  ? tasks.find((p) => p.id === t.parent_task_id)
                  : null;
                const parentInfo = parentTask
                  ? ` [bite of "${parentTask.title}"]`
                  : "";
                return `  - ${t.title}${parentInfo}${biteInfo}`;
              })
              .join("\n");
            return `${ws}:\n${taskLines}`;
          })
          .join("\n\n");

        // Call OpenAI
        const aiPrompt = `You are a helpful productivity assistant. Write a brief, encouraging weekly accomplishment summary for the user based on their completed tasks this week. Be specific about what they achieved, highlight patterns of progress, and end with a motivating note for the week ahead. Keep it to 3-5 sentences max.

Stats:
- Completed: ${completedThisWeek.length} tasks
- Created: ${createdThisWeek.length} new tasks
- Pending: ${pendingTasks.length} tasks remaining

Completed tasks by workstream:
${taskSummaryData}

Note: "bites" are smaller sub-tasks broken off from larger tasks. Mention progress on parent tasks when bites were completed.`;

        const openaiRes = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: aiPrompt }],
              max_tokens: 500,
              temperature: 0.7,
            }),
          }
        );

        if (!openaiRes.ok) {
          const errText = await openaiRes.text();
          console.error(`OpenAI error for ${userId}: ${errText}`);
          continue;
        }

        const openaiData = await openaiRes.json();
        const aiSummary =
          openaiData.choices?.[0]?.message?.content ||
          "Great work this week! Keep it up.";

        // Build HTML email
        const html = buildEmailHtml({
          aiSummary,
          completedCount: completedThisWeek.length,
          createdCount: createdThisWeek.length,
          pendingCount: pendingTasks.length,
          byWorkstream,
          biteMap,
          allTasks: tasks,
        });

        // Send via Mailgun
        const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
        const formData = new FormData();
        formData.append(
          "from",
          `NexBite <weekly-summary@${mailgunDomain}>`
        );
        formData.append("to", email);
        formData.append(
          "subject",
          `Your Week in Review — ${completedThisWeek.length} tasks completed`
        );
        formData.append("html", html);

        const mgRes = await fetch(mailgunUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
          },
          body: formData,
        });

        if (!mgRes.ok) {
          const mgErr = await mgRes.text();
          console.error(`Mailgun error for ${userId}: ${mgErr}`);
          results.push(`${email}: mailgun error`);
        } else {
          console.log(`Email sent to ${email}`);
          results.push(`${email}: sent`);
        }

        // Small delay between users to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (userError) {
        console.error(`Error processing user ${userId}:`, userError);
        results.push(`${userId}: error`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Build the HTML email
function buildEmailHtml(data: {
  aiSummary: string;
  completedCount: number;
  createdCount: number;
  pendingCount: number;
  byWorkstream: Record<string, Task[]>;
  biteMap: Record<string, string[]>;
  allTasks: Task[];
}) {
  const {
    aiSummary,
    completedCount,
    createdCount,
    pendingCount,
    byWorkstream,
    allTasks,
  } = data;

  const workstreamSections = Object.entries(byWorkstream)
    .map(([ws, wsTasks]) => {
      const taskItems = wsTasks
        .map((t) => {
          const parentTask = t.parent_task_id
            ? allTasks.find((p) => p.id === t.parent_task_id)
            : null;
          const parentLabel = parentTask
            ? `<span style="color:#888;font-size:13px;"> — bite of "${escapeHtml(parentTask.title)}"</span>`
            : "";
          return `<li style="margin-bottom:6px;color:#333;">&#x2705; ${escapeHtml(t.title)}${parentLabel}</li>`;
        })
        .join("");

      return `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 8px 0;font-size:16px;color:#1a5f4a;border-bottom:2px solid #e8f4ef;padding-bottom:4px;">${escapeHtml(ws)}</h3>
          <ul style="margin:0;padding-left:20px;list-style:none;">${taskItems}</ul>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a5f4a,#2d8a6e);border-radius:12px 12px 0 0;padding:30px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">NexBite Weekly Review</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your accomplishments this week</p>
    </div>

    <!-- Stats Bar -->
    <div style="background:#fff;padding:20px;border-bottom:1px solid #eee;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="33%" align="center" style="padding:8px;">
            <div style="font-size:28px;font-weight:700;color:#1a5f4a;">${completedCount}</div>
            <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Completed</div>
          </td>
          <td width="33%" align="center" style="padding:8px;border-left:1px solid #eee;border-right:1px solid #eee;">
            <div style="font-size:28px;font-weight:700;color:#1565c0;">${createdCount}</div>
            <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Created</div>
          </td>
          <td width="33%" align="center" style="padding:8px;">
            <div style="font-size:28px;font-weight:700;color:#e65100;">${pendingCount}</div>
            <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Pending</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- AI Summary -->
    <div style="background:#fff;padding:24px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#333;">AI Summary</h2>
      <p style="margin:0;color:#555;font-size:15px;line-height:1.6;">${escapeHtml(aiSummary)}</p>
    </div>

    <!-- Task List by Workstream -->
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#333;">Completed Tasks</h2>
      ${workstreamSections}
    </div>

    <!-- CTA -->
    <div style="text-align:center;padding:24px;">
      <a href="https://nexbite-two.vercel.app" style="display:inline-block;background:#1a5f4a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">Open NexBite</a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:12px;color:#aaa;font-size:12px;">
      Sent by NexBite
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
