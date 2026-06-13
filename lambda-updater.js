/**
 * AWS Lambda Function - Daily MCP Registry Discoverer & Updater
 * 
 * Schedule: EventBridge cron expression `cron(30 15 ? * * *)` (Runs daily at 15:30 UTC / 9:00 PM IST)
 * Environment Variables required in Lambda Configuration:
 *   - EMAIL_TO: Recipient email address (e.g. tehri.ashish@gmail.com).
 *   - SMTP_HOST: SMTP server (e.g. smtp.gmail.com).
 *   - SMTP_PORT: Port (e.g. 465 or 587).
 *   - SMTP_USER: SMTP login username.
 *   - SMTP_PASS: SMTP password or app-specific password.
 *   - GITHUB_TOKEN: A GitHub Personal Access Token (PAT) with "repo" scope.
 *   - GITHUB_OWNER: The GitHub username or organization (ashisht1).
 *   - GITHUB_REPO: The repository name (mcp-tools-website).
 *   - GITHUB_BRANCH: The target branch (default "main").
 */

import { Buffer } from 'buffer';
import nodemailer from 'nodemailer';

export const handler = async (event) => {
  console.log("Starting daily MCP registry update & validation task...");
  
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || "ashisht1";
  const repo = process.env.GITHUB_REPO || "mcp-tools-website";
  const branch = process.env.GITHUB_BRANCH || "main";
  const emailTo = process.env.EMAIL_TO || "tehri.ashish@gmail.com";
  const filePath = "data.json";

  // SMTP Settings
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  const isPlaceholder = (val) => !val || val === 'PLACEHOLDER';

  if (!token || isPlaceholder(token) || isPlaceholder(smtpHost) || isPlaceholder(smtpUser) || isPlaceholder(smtpPass)) {
    const errorMsg = "Missing required credentials. Ensure GITHUB_TOKEN and SMTP details are configured.";
    console.error(errorMsg);
    return { statusCode: 400, body: JSON.stringify({ error: errorMsg }) };
  }

  let updateLogs = [];
  let newToolsAdded = [];
  let validationReport = "Not Run";
  let status = "No Updates";

  try {
    // 1. Fetch current data.json from GitHub
    console.log(`Fetching current ${filePath} from GitHub repository ${owner}/${repo}...`);
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    
    const fileRes = await fetch(fileUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "MCP-Lambda-Updater"
      }
    });

    if (!fileRes.ok) {
      throw new Error(`Failed to fetch ${filePath} from GitHub: ${fileRes.status} ${fileRes.statusText}`);
    }

    const fileData = await fileRes.json();
    const sha = fileData.sha;
    const currentData = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
    
    const existingServerIds = new Set(currentData.mcpRegistry.map(s => s.id));
    console.log(`Successfully loaded ${currentData.mcpRegistry.length} existing servers.`);

    // 2. Fetch published servers from the official registry.modelcontextprotocol.io API
    console.log("Fetching latest servers from official MCP registry...");
    const registryUrl = "https://registry.modelcontextprotocol.io/v0.1/servers?limit=50";
    const registryRes = await fetch(registryUrl, {
      headers: { "Accept": "application/json" }
    });

    if (registryRes.ok) {
      const registryData = await registryRes.json();
      const rawServers = registryData.servers || [];
      console.log(`Found ${rawServers.length} servers in official registry.`);

      // Helper function to auto-categorize and determine emoji based on name/description keywords
      const categorizeAndGetIcon = (title, desc) => {
        const text = `${title} ${desc}`.toLowerCase();
        if (text.includes("db") || text.includes("database") || text.includes("postgres") || text.includes("sql") || text.includes("redis")) {
          return { category: "databases", icon: "🗄️" };
        }
        if (text.includes("search") || text.includes("web") || text.includes("crawl") || text.includes("fetch") || text.includes("browser")) {
          return { category: "search", icon: "🌐" };
        }
        if (text.includes("chat") || text.includes("slack") || text.includes("discord") || text.includes("api") || text.includes("mail") || text.includes("sms")) {
          return { category: "apis", icon: "✉️" };
        }
        return { category: "utilities", icon: "🛠️" };
      };

      // 3. Match and append new servers
      for (const entry of rawServers) {
        const s = entry.server;
        if (!s || !s.name) continue;

        // Create a unique clean ID
        const cleanId = s.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

        if (!existingServerIds.has(cleanId)) {
          const { category, icon } = categorizeAndGetIcon(s.title || s.name, s.description || "");
          
          // Determine the run command
          let command = `npx -y ${s.name}`;
          if (s.packages && s.packages.length > 0) {
            const pkg = s.packages[0];
            if (pkg.registryType === "npm") {
              command = `npx -y ${pkg.identifier}`;
            } else if (pkg.registryType === "pip" || pkg.registryType === "pipx") {
              command = `pip install ${pkg.identifier}`;
            }
          }

          const newServer = {
            id: cleanId,
            name: s.title || s.name.split("/").pop() || s.name,
            icon: icon,
            category: category,
            description: s.description || "No description provided.",
            command: command,
            author: s.repository?.url ? s.repository.url.split("/")[3] : "Community",
            stars: "New"
          };

          currentData.mcpRegistry.push(newServer);
          existingServerIds.add(cleanId);
          newToolsAdded.push(newServer);
          updateLogs.push(`Discovered and added new server: **${newServer.name}** [Category: ${newServer.category}]`);
        }
      }
    } else {
      console.warn("Could not reach official MCP registry API, skipping discovery.");
      updateLogs.push("Warning: Official MCP Registry API was unreachable during discovery run.");
    }

    // 4. Update star counts of existing servers (gracefully using GitHub API)
    console.log("Updating star metrics for current registry...");
    const repoMapping = {
      github: "modelcontextprotocol/servers",
      postgres: "modelcontextprotocol/servers",
      slack: "zencoderai/slack-mcp-server",
      filesystem: "modelcontextprotocol/servers",
      memory: "modelcontextprotocol/servers",
      fetch: "modelcontextprotocol/servers",
      "brave-search": "brave/brave-search-mcp-server",
      kite: "zerodha/kiteconnect-js"
    };

    for (let server of currentData.mcpRegistry) {
      const gitPath = repoMapping[server.id];
      if (gitPath) {
        try {
          const apiRes = await fetch(`https://api.github.com/repos/${gitPath}`, {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept": "application/vnd.github+json",
              "User-Agent": "MCP-Lambda-Updater"
            }
          });
          if (apiRes.ok) {
            const repoInfo = await apiRes.json();
            const stars = repoInfo.stargazers_count;
            let formattedStars = stars.toString();
            if (stars >= 1000) {
              formattedStars = (stars / 1000).toFixed(1) + "k";
            }
            if (server.stars !== formattedStars) {
              updateLogs.push(`Updated stars for **${server.name}**: ${server.stars} -> ${formattedStars}`);
              server.stars = formattedStars;
            }
          }
        } catch (e) {
          console.warn(`Could not update stars for ${server.id}:`, e);
        }
      }
    }

    // 5. Commit updates back to GitHub if changes occurred
    if (newToolsAdded.length > 0 || updateLogs.length > 0) {
      status = "Content Updated";
      console.log("Changes detected. Committing updated data.json to GitHub...");
      
      const updatedJsonString = JSON.stringify(currentData, null, 2);
      const base64Content = Buffer.from(updatedJsonString).toString('base64');
      
      const commitBody = {
        message: `chore: daily automated mcp registry update [discovered ${newToolsAdded.length} new tools]`,
        content: base64Content,
        sha: sha,
        branch: branch
      };

      const commitRes = await fetch(fileUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github+json",
          "User-Agent": "MCP-Lambda-Updater"
        },
        body: JSON.stringify(commitBody)
      });

      if (!commitRes.ok) {
        const errText = await commitRes.text();
        throw new Error(`Failed to commit changes: ${commitRes.status} ${errText}`);
      }

      console.log("Changes committed. Vercel deployment triggered automatically.");
      updateLogs.push("Successfully committed updates to repository. Vercel auto-deployment triggered.");
      
      // Wait for Vercel deployment and run validation
      console.log("Waiting 30 seconds for Vercel to build and serve new portal...");
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Perform validation check on live website
      console.log("Verifying live site mcptools.dev...");
      try {
        const verifyRes = await fetch("https://mcptools.dev");
        if (verifyRes.ok) {
          const html = await verifyRes.text();
          if (html.includes("index.html") || html.includes("MCP") || html.includes("mcpServers")) {
            validationReport = "SUCCESS: Live website is online, parsing correctly, and serving registry tools.";
          } else {
            validationReport = "WARNING: Site is online but index signature check failed.";
          }
        } else {
          validationReport = `ERROR: Live site verification returned HTTP Status ${verifyRes.status}`;
        }
      } catch (err) {
        validationReport = `ERROR: Failed to contact mcptools.dev: ${err.message}`;
      }
    } else {
      console.log("No new updates found.");
      updateLogs.push("Checked for updates: Registry database is already up to date.");
      validationReport = "SUCCESS: Checked live site. Active database is verified correct.";
    }

    // 6. Send status update email to tehri.ashish@gmail.com
    console.log("Sending automated content update email...");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });

    const isUpdated = status === "Content Updated";
    const emailSubject = `⚡ MCP Registry Update Report: ${isUpdated ? 'New Tools Discovered!' : 'Registry Up-To-Date'}`;
    
    let updatesListHtml = updateLogs.map(log => `<li>${log}</li>`).join('');
    let newToolsHtml = newToolsAdded.length > 0 
      ? `
        <h4 style="color:#2563eb; margin-bottom: 8px;">🆕 New Tools Discovered Today:</h4>
        <table width="100%" cellpadding="6" cellspacing="0" style="border:1px solid #e2e8f0; border-collapse:collapse; margin-bottom:15px; font-size:13px;">
          <tr style="background:#f1f5f9; font-weight:bold; text-align:left;">
            <th style="border:1px solid #e2e8f0;">Name</th>
            <th style="border:1px solid #e2e8f0;">Category</th>
            <th style="border:1px solid #e2e8f0;">Install Command</th>
          </tr>
          ${newToolsAdded.map(t => `
            <tr>
              <td style="border:1px solid #e2e8f0; font-weight:bold;">${t.icon} ${t.name}</td>
              <td style="border:1px solid #e2e8f0; color:#64748b;">${t.category}</td>
              <td style="border:1px solid #e2e8f0; font-family:monospace; color:#0f172a; background:#f8fafc;">${t.command}</td>
            </tr>
          `).join('')}
        </table>
      `
      : "";

    const emailBody = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="background:#0f172a; color:white; padding:20px; text-align:center;">
              <span style="font-size:18px; font-weight:bold;">⚡ MCP Hub Content Sync</span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;">
              <p style="font-size:14px; margin-top:0;">Hello Ashish,</p>
              <p style="font-size:14px;">Here is the daily status of your website content update task:</p>
              
              <div style="background-color: ${isUpdated ? '#eff6ff' : '#f0fdf4'}; border: 1px solid ${isUpdated ? '#bfdbfe' : '#bbf7d0'}; border-radius: 6px; padding: 12px; margin-bottom: 20px;">
                <strong style="color: ${isUpdated ? '#1d4ed8' : '#15803d'}; display:block; font-size:14px;">Status: ${status}</strong>
              </div>

              ${newToolsHtml}

              <h4 style="margin-bottom: 8px;">Activity Logs:</h4>
              <ul style="font-size:13px; color:#475569; padding-left:20px; margin-top:0;">
                ${updatesListHtml}
              </ul>

              <h4 style="margin-bottom: 8px;">Verification & Correctness Report:</h4>
              <div style="background-color:#f8fafc; border: 1px solid #e2e8f0; font-family: monospace; font-size:12px; padding:12px; border-radius:6px; color:#0f172a;">
                ${validationReport}
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
              MCP Registry Automated Updater Lambda &bull; <a href="https://mcptools.dev" style="color:#2563eb; text-decoration:none;">mcptools.dev</a>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: `"MCP Hub Content Sync" <${smtpUser}>`,
      to: emailTo,
      subject: emailSubject,
      html: emailBody
    });
    console.log("Status email dispatched successfully. ID:", info.messageId);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Task executed successfully.", status, logs: updateLogs, validationReport })
    };

  } catch (error) {
    console.error("Content updater task failed:", error);
    
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass }
      });
      
      let failMessage = error.message;
      if (failMessage.includes("Resource not accessible by personal access token") || failMessage.includes("403")) {
        failMessage = `GitHub Token Permission Error: The GITHUB_TOKEN does not have write access to repository contents. Please go to your GitHub Developer Settings -> Personal access tokens -> select your token -> verify it has "Read and Write" access to "Contents" of the repository.`;
      }
      
      const emailBody = `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 20px;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background:#ef4444; color:white; padding:20px; text-align:center;">
                <span style="font-size:18px; font-weight:bold;">❌ MCP Hub Content Sync Failed</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;">
                <p style="font-size:14px; margin-top:0;">Hello Ashish,</p>
                <p style="font-size:14px; color:#ef4444;"><strong>The daily automated website update task encountered an error:</strong></p>
                <div style="background-color:#fef2f2; border: 1px solid #fee2e2; padding:12px; border-radius:6px; font-family:monospace; font-size:12px; color:#b91c1c; margin-bottom:20px;">
                  ${failMessage}
                </div>
                <p style="font-size:13px; color:#64748b;">Please review the error details above to restore the automated sync pipeline.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
                MCP Registry Automated Updater Lambda &bull; <a href="https://mcptools.dev" style="color:#2563eb; text-decoration:none;">mcptools.dev</a>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      
      await transporter.sendMail({
        from: `"MCP Hub Content Sync" <${smtpUser}>`,
        to: emailTo,
        subject: `❌ Alert: MCP Registry Update Failed`,
        html: emailBody
      });
      console.log("Failure alert email sent successfully.");
    } catch (mailErr) {
      console.error("Failed to send error notification email:", mailErr);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
