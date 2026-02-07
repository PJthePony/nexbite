import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "pjtanzillo@gmail.com";

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

    const startTime = Date.now();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const results: string[] = [];

    // Stats for admin report
    let totalUsers = uniqueUserIds.length;
    let usersWithEmail = 0;
    let usersSkippedNoEmail = 0;
    let usersSkippedNoCompletions = 0;
    let emailsSent = 0;
    let emailsFailed = 0;
    let userErrors = 0;
    const perUserStats: { email: string; completed: number; created: number; pending: number; status: string }[] = [];

    for (const userId of uniqueUserIds) {
      const email = emailMap[userId];
      if (!email) {
        console.log(`No email for user ${userId}, skipping`);
        usersSkippedNoEmail++;
        continue;
      }
      usersWithEmail++;

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

        // Tasks created in the past 7 days
        const createdThisWeek = tasks.filter(
          (t) => t.created_at && t.created_at >= sevenDaysAgo
        );

        // Pending tasks (not completed)
        const pendingTasks = tasks.filter((t) => !t.completed);

        if (completedThisWeek.length === 0) {
          console.log(`User ${userId} has 0 completions, skipping`);
          usersSkippedNoCompletions++;
          perUserStats.push({ email, completed: 0, created: createdThisWeek.length, pending: pendingTasks.length, status: "skipped (no completions)" });
          continue;
        }

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
          emailsFailed++;
          perUserStats.push({ email, completed: completedThisWeek.length, created: createdThisWeek.length, pending: pendingTasks.length, status: `mailgun error` });
        } else {
          console.log(`Email sent to ${email}`);
          results.push(`${email}: sent`);
          emailsSent++;
          perUserStats.push({ email, completed: completedThisWeek.length, created: createdThisWeek.length, pending: pendingTasks.length, status: "sent" });
        }

        // Small delay between users to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (userError) {
        console.error(`Error processing user ${userId}:`, userError);
        results.push(`${userId}: error`);
        userErrors++;
        perUserStats.push({ email: emailMap[userId] || userId, completed: 0, created: 0, pending: 0, status: `error: ${(userError as Error).message}` });
      }
    }

    // Send admin report email
    const elapsedMs = Date.now() - startTime;
    try {
      const adminHtml = buildAdminReportHtml({
        totalUsers,
        usersWithEmail,
        usersSkippedNoEmail,
        usersSkippedNoCompletions,
        emailsSent,
        emailsFailed,
        userErrors,
        perUserStats,
        elapsedMs,
        totalAuthUsers: authData?.users?.length || 0,
      });

      const adminFormData = new FormData();
      adminFormData.append("from", `NexBite Admin <admin@${mailgunDomain}>`);
      adminFormData.append("to", ADMIN_EMAIL);
      adminFormData.append("subject", `NexBite Weekly Job Report — ${emailsSent} emails sent`);
      adminFormData.append("html", adminHtml);

      const adminMgRes = await fetch(
        `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
          },
          body: adminFormData,
        }
      );

      if (!adminMgRes.ok) {
        const adminErr = await adminMgRes.text();
        console.error(`Failed to send admin report: ${adminErr}`);
      } else {
        console.log(`Admin report sent to ${ADMIN_EMAIL}`);
      }
    } catch (adminError) {
      console.error("Failed to send admin report:", adminError);
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

// Build the admin report HTML email
function buildAdminReportHtml(data: {
  totalUsers: number;
  usersWithEmail: number;
  usersSkippedNoEmail: number;
  usersSkippedNoCompletions: number;
  emailsSent: number;
  emailsFailed: number;
  userErrors: number;
  perUserStats: { email: string; completed: number; created: number; pending: number; status: string }[];
  elapsedMs: number;
  totalAuthUsers: number;
}) {
  const {
    totalUsers,
    usersWithEmail,
    usersSkippedNoEmail,
    usersSkippedNoCompletions,
    emailsSent,
    emailsFailed,
    userErrors,
    perUserStats,
    elapsedMs,
    totalAuthUsers,
  } = data;

  const elapsed = (elapsedMs / 1000).toFixed(1);
  const runTime = new Date().toISOString();

  const userRows = perUserStats
    .map((u) => {
      const statusColor =
        u.status === "sent"
          ? "#1a5f4a"
          : u.status.startsWith("skipped")
          ? "#888"
          : "#c0392b";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">${escapeHtml(u.email)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${u.completed}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${u.created}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${u.pending}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;color:${statusColor};">${escapeHtml(u.status)}</td>
        </tr>`;
    })
    .join("");

  const noUsersMessage =
    perUserStats.length === 0
      ? `<tr><td colspan="5" style="padding:16px;text-align:center;color:#888;font-style:italic;">No users with tasks found</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2c3e50,#3498db);border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">NexBite Admin Report</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Weekly Summary Job — ${escapeHtml(runTime)}</p>
    </div>

    <!-- Overview Stats -->
    <div style="background:#fff;padding:20px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 16px;font-size:16px;color:#333;">Job Overview</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="25%" align="center" style="padding:8px;">
            <div style="font-size:28px;font-weight:700;color:#1a5f4a;">${emailsSent}</div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;">Emails Sent</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #eee;">
            <div style="font-size:28px;font-weight:700;color:#e65100;">${emailsFailed + userErrors}</div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;">Errors</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #eee;">
            <div style="font-size:28px;font-weight:700;color:#888;">${usersSkippedNoCompletions}</div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;">Skipped</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #eee;">
            <div style="font-size:28px;font-weight:700;color:#3498db;">${elapsed}s</div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;">Duration</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Detailed Stats -->
    <div style="background:#fff;padding:20px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#333;">Detailed Breakdown</h2>
      <table style="width:100%;font-size:14px;color:#555;">
        <tr><td style="padding:4px 0;">Total auth users in system</td><td style="text-align:right;font-weight:600;">${totalAuthUsers}</td></tr>
        <tr><td style="padding:4px 0;">Users with tasks in DB</td><td style="text-align:right;font-weight:600;">${totalUsers}</td></tr>
        <tr><td style="padding:4px 0;">Users with email found</td><td style="text-align:right;font-weight:600;">${usersWithEmail}</td></tr>
        <tr><td style="padding:4px 0;">Skipped — no email</td><td style="text-align:right;font-weight:600;">${usersSkippedNoEmail}</td></tr>
        <tr><td style="padding:4px 0;">Skipped — no completions</td><td style="text-align:right;font-weight:600;">${usersSkippedNoCompletions}</td></tr>
        <tr><td style="padding:4px 0;">Emails sent successfully</td><td style="text-align:right;font-weight:600;color:#1a5f4a;">${emailsSent}</td></tr>
        <tr><td style="padding:4px 0;">Mailgun failures</td><td style="text-align:right;font-weight:600;color:${emailsFailed > 0 ? '#c0392b' : '#555'};">${emailsFailed}</td></tr>
        <tr><td style="padding:4px 0;">Processing errors</td><td style="text-align:right;font-weight:600;color:${userErrors > 0 ? '#c0392b' : '#555'};">${userErrors}</td></tr>
      </table>
    </div>

    <!-- Per-User Table -->
    <div style="background:#fff;padding:20px;border-radius:0 0 12px 12px;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#333;">Per-User Details</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">
        <thead>
          <tr style="background:#f8f9fa;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#555;border-bottom:2px solid #eee;">User</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;color:#555;border-bottom:2px solid #eee;">Done</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;color:#555;border-bottom:2px solid #eee;">New</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;color:#555;border-bottom:2px solid #eee;">Pending</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#555;border-bottom:2px solid #eee;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${userRows}${noUsersMessage}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;color:#aaa;font-size:12px;">
      NexBite Admin Report — Auto-generated
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
