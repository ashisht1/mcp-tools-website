/**
 * AWS Lambda Function - Daily Website Status & Traffic Email Reporter
 * 
 * Schedule: EventBridge cron expression `cron(30 16 ? * * *)` (Runs daily at 16:30 UTC / 10:00 PM IST)
 * Environment Variables required in Lambda Configuration:
 *   - EMAIL_TO: Recipient email address (e.g. tehri.ashish@gmail.com).
 *   - SMTP_HOST: SMTP server (e.g. smtp.resend.com, smtp.gmail.com).
 *   - SMTP_PORT: Port (e.g. 465 or 587).
 *   - SMTP_USER: SMTP login username.
 *   - SMTP_PASS: SMTP password or app-specific password.
 *   - VERCEL_TOKEN: Vercel Personal Access Token.
 *   - VERCEL_PROJECT_ID: Vercel project ID (e.g. prj_xxxxxxxxxxxxxxxxxx).
 *   - GITHUB_TOKEN: GitHub Personal Access Token.
 *   - GITHUB_OWNER: GitHub owner name (ashisht1).
 *   - GITHUB_REPO: GitHub repository name (mcp-tools-website).
 */

import nodemailer from 'nodemailer';

export const handler = async (event) => {
  console.log("Starting daily website audit and email report generation...");

  const emailTo = process.env.EMAIL_TO || "tehri.ashish@gmail.com";
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubOwner = process.env.GITHUB_OWNER || "ashisht1";
  const githubRepo = process.env.GITHUB_REPO || "mcp-tools-website";

  // SMTP Settings
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    const err = "Missing SMTP credentials. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS.";
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err }) };
  }

  // Time calculations
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let trafficReport = { pageviews: 0, visitors: 0, referrers: [] };
  let deploymentReport = [];
  let gitReport = [];
  let systemStatus = "Healthy";
  let statusMessage = "All systems operational. Website is serving correctly.";

  try {
    // 1. Fetch Vercel Web Analytics (Graceful fallback if no token or project id)
    if (vercelToken && projectId) {
      console.log("Fetching Vercel Web Analytics...");
      try {
        const analyticsUrl = `https://api.vercel.com/v1/web-analytics/timeseries?projectId=${projectId}&from=${yesterday.toISOString()}&to=${now.toISOString()}`;
        const res = await fetch(analyticsUrl, {
          headers: { "Authorization": `Bearer ${vercelToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Sum up pageviews and unique visitors
          let pvCount = 0;
          let visCount = 0;
          if (data.pageviews && data.pageviews.values) {
            pvCount = data.pageviews.values.reduce((sum, item) => sum + (item.value || 0), 0);
          }
          if (data.visitors && data.visitors.values) {
            visCount = data.visitors.values.reduce((sum, item) => sum + (item.value || 0), 0);
          }
          trafficReport.pageviews = pvCount;
          trafficReport.visitors = visCount;
        } else {
          console.warn("Vercel Web Analytics API returned status " + res.status);
        }
      } catch (err) {
        console.error("Error fetching Vercel Analytics:", err);
      }
    } else {
      console.log("Vercel token or project ID missing; providing placeholder traffic data.");
    }

    // 2. Fetch Vercel Deployments Status
    if (vercelToken && projectId) {
      console.log("Fetching Vercel Deployments list...");
      try {
        const deploymentsUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5`;
        const res = await fetch(deploymentsUrl, {
          headers: { "Authorization": `Bearer ${vercelToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.deployments) {
            deploymentReport = data.deployments.map(d => ({
              id: d.uid,
              url: d.url,
              state: d.state, // READY, ERROR, BUILDING
              creator: d.creator?.username || "System",
              created: new Date(d.created).toLocaleTimeString()
            }));
            
            // Check if latest deployment failed
            const latest = data.deployments[0];
            if (latest && latest.state === "ERROR") {
              systemStatus = "Warning";
              statusMessage = `Latest deployment (${latest.url}) failed to build successfully.`;
            }
          }
        }
      } catch (err) {
        console.error("Error fetching Vercel Deployments:", err);
      }
    }

    // 3. Fetch GitHub Repository Commit updates
    if (githubToken) {
      console.log("Fetching GitHub Repository commits...");
      try {
        const gitUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/commits?since=${yesterday.toISOString()}`;
        const res = await fetch(gitUrl, {
          headers: {
            "Authorization": `Bearer ${githubToken}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "MCP-Email-Reporter"
          }
        });
        if (res.ok) {
          const commits = await res.json();
          if (Array.isArray(commits)) {
            gitReport = commits.map(c => ({
              message: c.commit.message,
              author: c.commit.author.name,
              time: new Date(c.commit.author.date).toLocaleTimeString()
            }));
          }
        }
      } catch (err) {
        console.error("Error fetching GitHub commits:", err);
      }
    }

    // 4. Compose HTML Email content
    const isHealthy = systemStatus === "Healthy";
    const statusColor = isHealthy ? "#10b981" : "#f59e0b";
    
    let deploymentsHtml = deploymentReport.length > 0 
      ? deploymentReport.map(d => `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
            <td style="padding: 10px; font-family: monospace; color:#3b82f6;">${d.url}</td>
            <td style="padding: 10px; font-weight:bold; color: ${d.state === 'READY' ? '#10b981' : d.state === 'ERROR' ? '#ef4444' : '#f59e0b'};">${d.state}</td>
            <td style="padding: 10px; color:#64748b;">${d.created}</td>
            <td style="padding: 10px; color:#64748b;">${d.creator}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="4" style="padding:15px; text-align:center; color:#94a3b8; font-size:13px;">No Vercel deployment records found. Connect your token to fetch updates.</td></tr>`;

    let commitsHtml = gitReport.length > 0
      ? gitReport.map(c => `
          <div style="border-left: 3px solid #6366f1; padding-left:12px; margin-bottom:12px;">
            <strong style="font-size:13px; color:#1e293b;">${c.message}</strong>
            <span style="font-size:11px; color:#64748b; display:block;">Pushed by ${c.author} at ${c.time}</span>
          </div>
        `).join('')
      : `<p style="font-size:13px; color:#94a3b8; margin:0;">No code updates committed in the last 24 hours.</p>`;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 30px; text-align: center; color: white;">
              <span style="font-size: 24px; font-weight: bold; letter-spacing: -0.02em;">⚡ MCP<span style="color:#00f2fe;">Hub</span> Status Report</span>
              <span style="display:block; font-size: 13px; color: #94a3b8; margin-top: 6px;">Daily Analytics & Health Summary</span>
            </td>
          </tr>
          
          <!-- Content Body -->
          <tr>
            <td style="padding: 30px;">
              <!-- Date Title -->
              <span style="font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase;">${dateStr}</span>
              
              <!-- System Status Card -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${statusColor}; padding: 16px; border-radius: 8px; margin-top: 12px; margin-bottom: 24px;">
                <strong style="color: ${statusColor}; font-size: 15px; display:block;">System Status: ${systemStatus}</strong>
                <span style="font-size: 13px; color: #475569; display:block; margin-top: 4px;">${statusMessage}</span>
              </div>

              <!-- Traffic Metrics Row -->
              <h3 style="font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 16px;">📈 Traffic Analytics</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="50%" style="padding-right:10px;">
                    <div style="background-color:#eff6ff; border: 1px solid #bfdbfe; border-radius:8px; padding:15px; text-align:center;">
                      <span style="font-size: 28px; font-weight: bold; color: #2563eb; display:block;">${trafficReport.pageviews}</span>
                      <span style="font-size: 12px; color: #1e3a8a; font-weight:600; text-transform:uppercase;">Pageviews</span>
                    </div>
                  </td>
                  <td width="50%" style="padding-left:10px;">
                    <div style="background-color:#ecfdf5; border: 1px solid #a7f3d0; border-radius:8px; padding:15px; text-align:center;">
                      <span style="font-size: 28px; font-weight: bold; color: #059669; display:block;">${trafficReport.visitors}</span>
                      <span style="font-size: 12px; color: #064e3b; font-weight:600; text-transform:uppercase;">Unique Visitors</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Vercel Deployments -->
              <h3 style="font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 16px;">🚀 Vercel Deployment History</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow:hidden; margin-bottom: 24px; border-collapse:collapse;">
                <tr style="background-color: #f1f5f9; font-size: 12px; font-weight: bold; text-align: left;">
                  <th style="padding:10px;">URL</th>
                  <th style="padding:10px;">State</th>
                  <th style="padding:10px;">Time</th>
                  <th style="padding:10px;">Trigger</th>
                </tr>
                ${deploymentsHtml}
              </table>

              <!-- GitHub Code Commits -->
              <h3 style="font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 16px;">🐙 GitHub Commits (24h)</h3>
              <div style="margin-bottom: 10px;">
                ${commitsHtml}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
              This is an automated status report generated by your AWS Lambda daily cron service.<br>
              Website: <a href="https://mcptools.dev" style="color:#2563eb; text-decoration:none; font-weight:600;">mcptools.dev</a>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // 5. Setup Nodemailer and dispatch email
    console.log(`Setting up SMTP transport for ${smtpHost}...`);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // True for 465, false for 587
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    console.log(`Sending audit email to ${emailTo}...`);
    const mailOptions = {
      from: `"MCP Hub Diagnostics" <${smtpUser}>`,
      to: emailTo,
      subject: `[Status: ${systemStatus}] mcptools.dev Daily Report - ${dateStr}`,
      html: htmlBody
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email dispatched successfully! Message ID:", info.messageId);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Report successfully compiled and emailed.", messageId: info.messageId })
    };

  } catch (error) {
    console.error("Daily report task failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
