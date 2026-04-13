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
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${supabaseServiceKey}` },
      },
    });

    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const mailgunKey = Deno.env.get("MAILGUN_API_KEY")!;
    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN")!;

    // Get all distinct user IDs from tasks
    const { data: userRows, error: usersError, count } = await supabase
      .from("tasks")
      .select("user_id", { count: "exact" })
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

        // Tasks completed in the PRIOR week (7-14 days ago) for comparison
        const fourteenDaysAgo = sevenDaysAgo - 7 * 24 * 60 * 60 * 1000;
        const completedLastWeek = tasks.filter(
          (t) =>
            t.completed &&
            t.completed_at &&
            t.completed_at >= fourteenDaysAgo &&
            t.completed_at < sevenDaysAgo
        );

        // Tasks created in the past 7 days
        const createdThisWeek = tasks.filter(
          (t) => t.created_at && t.created_at >= sevenDaysAgo
        );

        // Pending tasks (not completed)
        const pendingTasks = tasks.filter((t) => !t.completed);

        // Upcoming tasks — things slotted for next-week or this-week that aren't done
        const upcomingTasks = tasks.filter(
          (t) =>
            !t.completed &&
            (t.location === "next-week" || t.location === "this-week")
        );

        // Build 12-week historical completions data
        const weeklyHistory: { weekLabel: string; count: number }[] = [];
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        for (let i = 11; i >= 0; i--) {
          const weekStart = Date.now() - (i + 1) * oneWeekMs;
          const weekEnd = Date.now() - i * oneWeekMs;
          const count = tasks.filter(
            (t) =>
              t.completed &&
              t.completed_at &&
              t.completed_at >= weekStart &&
              t.completed_at < weekEnd
          ).length;
          const d = new Date(weekEnd);
          const weekLabel = `${d.getMonth() + 1}/${d.getDate()}`;
          weeklyHistory.push({ weekLabel, count });
        }

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

        // Group upcoming tasks by workstream
        const upcomingByWorkstream: Record<string, Task[]> = {};
        upcomingTasks.forEach((t) => {
          const ws = t.workstream || "No Workstream";
          if (!upcomingByWorkstream[ws]) upcomingByWorkstream[ws] = [];
          upcomingByWorkstream[ws].push(t);
        });

        // Group last week's completions by workstream for comparison
        const lastWeekByWorkstream: Record<string, Task[]> = {};
        completedLastWeek.forEach((t) => {
          const ws = t.workstream || "No Workstream";
          if (!lastWeekByWorkstream[ws]) lastWeekByWorkstream[ws] = [];
          lastWeekByWorkstream[ws].push(t);
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

        const upcomingSummaryData = Object.entries(upcomingByWorkstream)
          .map(([ws, wsTasks]) => {
            const taskLines = wsTasks
              .map((t) => `  - ${t.title} (${t.location === "this-week" ? "this week" : "next week"})`)
              .join("\n");
            return `${ws}:\n${taskLines}`;
          })
          .join("\n\n");

        const lastWeekSummaryData = Object.entries(lastWeekByWorkstream)
          .map(([ws, wsTasks]) => {
            const taskLines = wsTasks.map((t) => `  - ${t.title}`).join("\n");
            return `${ws}:\n${taskLines}`;
          })
          .join("\n\n");

        // Week-over-week delta
        const delta = completedThisWeek.length - completedLastWeek.length;
        const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

        // Call OpenAI
        const aiPrompt = `You are writing a weekly status report summary as if the user were reporting to their boss. The tone should be professional but warm — confident, concise, and results-oriented. Structure your response in exactly 3 short paragraphs with these headers:

**Progress This Week:** Summarize the key accomplishments. Group by workstream when it makes sense. Be specific about what was delivered, not just task names. If bites were completed toward a larger parent task, frame it as progress toward that goal.

**What Changed:** Compare this week to last week. Note if output went up or down, if new workstreams got attention, or if focus shifted. If there's no last-week data, note that this is the first tracked week.

**Plan for Next Week:** Based on the upcoming/pending tasks, describe what's on deck. Highlight any large goals that have pending bites or next steps.

Keep the entire summary under 200 words. Do not use bullet points — write in paragraph form.

THIS WEEK — ${completedThisWeek.length} tasks completed (${deltaStr} vs last week):
${taskSummaryData}

LAST WEEK — ${completedLastWeek.length} tasks completed:
${lastWeekSummaryData || "(no data)"}

UPCOMING — ${upcomingTasks.length} tasks queued:
${upcomingSummaryData || "(nothing scheduled yet)"}

OVERALL: ${pendingTasks.length} tasks pending across all locations.

Note: "bites" are smaller sub-tasks broken off from larger tasks. When bites of a parent task were completed, describe progress toward the parent goal.`;

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
              max_tokens: 800,
              temperature: 0.7,
            }),
          }
        );

        let aiSummary: string;

        if (!openaiRes.ok) {
          const errText = await openaiRes.text();
          console.error(`OpenAI error for ${userId} (${openaiRes.status}): ${errText}`);
          // Fallback: generate a status-report style summary without AI
          const wsNames = Object.keys(byWorkstream).join(", ");
          const upWsNames = Object.keys(upcomingByWorkstream).join(", ");
          aiSummary = `**Progress This Week:** Completed ${completedThisWeek.length} tasks across ${Object.keys(byWorkstream).length} workstreams (${wsNames}).

**What Changed:** ${completedLastWeek.length > 0 ? `Output moved from ${completedLastWeek.length} to ${completedThisWeek.length} tasks (${deltaStr}).` : "This is the first tracked week — no prior data to compare."} ${pendingTasks.length} tasks remain in the backlog.

**Plan for Next Week:** ${upcomingTasks.length > 0 ? `${upcomingTasks.length} tasks are queued across ${upWsNames}.` : "No tasks scheduled yet for next week."}`;
        } else {
          const openaiData = await openaiRes.json();
          aiSummary =
            openaiData.choices?.[0]?.message?.content ||
            "Great work this week! Keep it up.";
        }

        // Build HTML email
        const html = buildEmailHtml({
          aiSummary,
          completedCount: completedThisWeek.length,
          createdCount: createdThisWeek.length,
          pendingCount: pendingTasks.length,
          lastWeekCount: completedLastWeek.length,
          delta,
          byWorkstream,
          upcomingByWorkstream,
          biteMap,
          allTasks: tasks,
          weeklyHistory,
        });

        // Send via Mailgun
        const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
        const formData = new FormData();
        formData.append(
          "from",
          `Tessio <weekly-summary@${mailgunDomain}>`
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
      adminFormData.append("from", `Tessio Admin <admin@${mailgunDomain}>`);
      adminFormData.append("to", ADMIN_EMAIL);
      adminFormData.append("subject", `Tessio Weekly Job Report — ${emailsSent} emails sent`);
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
  lastWeekCount: number;
  delta: number;
  byWorkstream: Record<string, Task[]>;
  upcomingByWorkstream: Record<string, Task[]>;
  biteMap: Record<string, string[]>;
  allTasks: Task[];
  weeklyHistory: { weekLabel: string; count: number }[];
}) {
  const {
    aiSummary,
    completedCount,
    createdCount,
    pendingCount,
    lastWeekCount,
    delta,
    byWorkstream,
    upcomingByWorkstream,
    allTasks,
    weeklyHistory,
  } = data;

  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaColor = delta > 0 ? "#059669" : delta < 0 ? "#ef4444" : "#94a3b8";

  // Build SVG bar chart for 12-week history
  const chartSvg = buildWeeklyChartSvg(weeklyHistory);

  const completedSections = Object.entries(byWorkstream)
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
          <h3 style="margin:0 0 8px 0;font-size:15px;color:#475569;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">${escapeHtml(ws)} <span style="color:#94a3b8;font-weight:400;font-size:13px;">(${wsTasks.length})</span></h3>
          <ul style="margin:0;padding-left:20px;list-style:none;">${taskItems}</ul>
        </div>`;
    })
    .join("");

  const upcomingSections = Object.entries(upcomingByWorkstream)
    .map(([ws, wsTasks]) => {
      const taskItems = wsTasks
        .map((t) => {
          const loc = t.location === "this-week" ? "this week" : "next week";
          return `<li style="margin-bottom:6px;color:#555;">&#x1F4CB; ${escapeHtml(t.title)} <span style="color:#aaa;font-size:12px;">(${loc})</span></li>`;
        })
        .join("");

      return `
        <div style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px 0;font-size:15px;color:#f97316;border-bottom:2px solid #fed7aa;padding-bottom:4px;">${escapeHtml(ws)}</h3>
          <ul style="margin:0;padding-left:20px;list-style:none;">${taskItems}</ul>
        </div>`;
    })
    .join("");

  // Convert markdown-style **bold** to HTML <strong> tags in AI summary
  const formattedSummary = escapeHtml(aiSummary)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p style=\"margin:12px 0 0;color:#64748b;font-size:15px;line-height:1.6;\">")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#475569;border-radius:12px 12px 0 0;padding:30px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Weekly Status Report</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:14px;">Tessio — Week in Review</p>
    </div>

    <!-- Stats Bar -->
    <div style="background:#fff;padding:20px;border-bottom:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="25%" align="center" style="padding:8px;">
            <div style="font-size:28px;font-weight:700;color:#475569;">${completedCount}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Completed</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #e2e8f0;">
            <div style="font-size:28px;font-weight:700;color:${deltaColor};">${deltaLabel}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">vs Last Week</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #e2e8f0;">
            <div style="font-size:28px;font-weight:700;color:#f97316;">${createdCount}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Created</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #e2e8f0;">
            <div style="font-size:28px;font-weight:700;color:#64748b;">${pendingCount}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Pending</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- 12-Week History Chart -->
    <div style="background:#fff;padding:24px;border-bottom:1px solid #e2e8f0;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a;">12-Week Trend</h2>
      ${chartSvg}
    </div>

    <!-- Status Report Summary -->
    <div style="background:#fff;padding:24px;border-bottom:1px solid #e2e8f0;">
      <h2 style="margin:0 0 14px;font-size:18px;color:#0f172a;">Status Report</h2>
      <p style="margin:0;color:#64748b;font-size:15px;line-height:1.6;">${formattedSummary}</p>
    </div>

    <!-- Completed Tasks by Workstream -->
    <div style="background:#fff;padding:24px;border-bottom:1px solid #e2e8f0;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a;">What Got Done</h2>
      ${completedSections}
    </div>

    <!-- Upcoming / Next Week -->
    ${upcomingSections ? `
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a;">On Deck</h2>
      ${upcomingSections}
    </div>
    ` : `
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
      <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a;">On Deck</h2>
      <p style="margin:0;color:#94a3b8;font-style:italic;">Nothing scheduled yet for next week.</p>
    </div>
    `}

    <!-- CTA -->
    <div style="text-align:center;padding:24px;">
      <a href="https://tessio.tanzillo.ai/app" style="display:inline-block;background:#475569;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">Open Tessio</a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:12px;color:#94a3b8;font-size:12px;">
      Sent by Tessio — tanzillo.ai
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
          ? "#059669"
          : u.status.startsWith("skipped")
          ? "#94a3b8"
          : "#ef4444";
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
<body style="margin:0;padding:0;background:#f8fafc;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#334155;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Tessio Admin Report</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Weekly Summary Job — ${escapeHtml(runTime)}</p>
    </div>

    <!-- Overview Stats -->
    <div style="background:#fff;padding:20px;border-bottom:1px solid #e2e8f0;">
      <h2 style="margin:0 0 16px;font-size:16px;color:#0f172a;">Job Overview</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="25%" align="center" style="padding:8px;">
            <div style="font-size:28px;font-weight:700;color:#059669;">${emailsSent}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Emails Sent</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #e2e8f0;">
            <div style="font-size:28px;font-weight:700;color:#ef4444;">${emailsFailed + userErrors}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Errors</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #e2e8f0;">
            <div style="font-size:28px;font-weight:700;color:#94a3b8;">${usersSkippedNoCompletions}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Skipped</div>
          </td>
          <td width="25%" align="center" style="padding:8px;border-left:1px solid #e2e8f0;">
            <div style="font-size:28px;font-weight:700;color:#475569;">${elapsed}s</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Duration</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Detailed Stats -->
    <div style="background:#fff;padding:20px;border-bottom:1px solid #e2e8f0;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a;">Detailed Breakdown</h2>
      <table style="width:100%;font-size:14px;color:#64748b;">
        <tr><td style="padding:4px 0;">Total auth users in system</td><td style="text-align:right;font-weight:600;">${totalAuthUsers}</td></tr>
        <tr><td style="padding:4px 0;">Users with tasks in DB</td><td style="text-align:right;font-weight:600;">${totalUsers}</td></tr>
        <tr><td style="padding:4px 0;">Users with email found</td><td style="text-align:right;font-weight:600;">${usersWithEmail}</td></tr>
        <tr><td style="padding:4px 0;">Skipped — no email</td><td style="text-align:right;font-weight:600;">${usersSkippedNoEmail}</td></tr>
        <tr><td style="padding:4px 0;">Skipped — no completions</td><td style="text-align:right;font-weight:600;">${usersSkippedNoCompletions}</td></tr>
        <tr><td style="padding:4px 0;">Emails sent successfully</td><td style="text-align:right;font-weight:600;color:#059669;">${emailsSent}</td></tr>
        <tr><td style="padding:4px 0;">Mailgun failures</td><td style="text-align:right;font-weight:600;color:${emailsFailed > 0 ? '#ef4444' : '#64748b'};">${emailsFailed}</td></tr>
        <tr><td style="padding:4px 0;">Processing errors</td><td style="text-align:right;font-weight:600;color:${userErrors > 0 ? '#ef4444' : '#64748b'};">${userErrors}</td></tr>
      </table>
    </div>

    <!-- Per-User Table -->
    <div style="background:#fff;padding:20px;border-radius:0 0 12px 12px;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a;">Per-User Details</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">User</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Done</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">New</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Pending</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${userRows}${noUsersMessage}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">
      Tessio Admin Report — tanzillo.ai
    </div>
  </div>
</body>
</html>`;
}

function buildWeeklyChartSvg(
  history: { weekLabel: string; count: number }[]
): string {
  const svgWidth = 540;
  const svgHeight = 160;
  const barPadding = 4;
  const bottomPadding = 24;
  const topPadding = 20;
  const chartHeight = svgHeight - bottomPadding - topPadding;
  const barWidth = (svgWidth - barPadding * (history.length - 1)) / history.length;
  const maxCount = Math.max(...history.map((w) => w.count), 1);

  const bars = history
    .map((week, i) => {
      const barHeight = Math.max((week.count / maxCount) * chartHeight, 2);
      const x = i * (barWidth + barPadding);
      const y = topPadding + chartHeight - barHeight;
      const isCurrentWeek = i === history.length - 1;
      const fill = isCurrentWeek ? "#f97316" : "#475569";
      const opacity = isCurrentWeek ? "1" : "0.7";

      const countLabel =
        week.count > 0
          ? `<text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" fill="#64748b" font-size="11" font-family="'IBM Plex Sans',sans-serif" font-weight="600">${week.count}</text>`
          : "";

      return `${countLabel}<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${fill}" opacity="${opacity}"/><text x="${x + barWidth / 2}" y="${svgHeight - 4}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="'IBM Plex Sans',sans-serif">${week.weekLabel}</text>`;
    })
    .join("");

  return `<svg width="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="display:block;">${bars}</svg>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
