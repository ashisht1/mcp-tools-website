/**
 * AWS Lambda Function - Weekly MCP Registry Updater
 * 
 * Schedule: EventBridge cron expression `cron(0 0 ? * SUN *)` (Every Sunday at 00:00 UTC)
 * Environment Variables required in Lambda Configuration:
 *   - GITHUB_TOKEN: A GitHub Personal Access Token (PAT) with "repo" scope.
 *   - GITHUB_OWNER: The GitHub username or organization (e.g. "ashish-tehri").
 *   - GITHUB_REPO: The repository name (e.g. "mcp-tools-website").
 *   - GITHUB_BRANCH: The target branch (default "main").
 */

import { Buffer } from 'buffer';

export const handler = async (event) => {
  console.log("Starting weekly MCP registry update task...");
  
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const filePath = "data.json";

  if (!token || !owner || !repo) {
    const errorMsg = "Missing required environment variables: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO.";
    console.error(errorMsg);
    return { statusCode: 500, body: JSON.stringify({ error: errorMsg }) };
  }

  try {
    // 1. Fetch data.json from the GitHub Repository
    console.log(`Fetching ${filePath} from GitHub repository ${owner}/${repo}...`);
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    
    const fileRes = await fetch(fileUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "MCP-Lambda-Updater"
      }
    });

    if (!fileRes.ok) {
      throw new Error(`Failed to fetch file: ${fileRes.status} ${fileRes.statusText}`);
    }

    const fileData = await fileRes.json();
    const sha = fileData.sha;
    const currentJson = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
    
    console.log("Successfully fetched current registry configuration.");

    // 2. Fetch latest GitHub star counts for listed servers
    console.log("Updating server statistics (star counts)...");
    
    // Maps repository identifiers for our listed servers
    const repoMapping = {
      github: "modelcontextprotocol/servers/tree/main/src/github", // Shared repo
      postgres: "modelcontextprotocol/servers/tree/main/src/postgres",
      slack: "modelcontextprotocol/servers/tree/main/src/slack",
      filesystem: "modelcontextprotocol/servers/tree/main/src/filesystem",
      memory: "modelcontextprotocol/servers/tree/main/src/memory",
      fetch: "modelcontextprotocol/servers/tree/main/src/fetch",
      "brave-search": "modelcontextprotocol/servers/tree/main/src/brave-search",
      kite: "zerodha/kiteconnect-js" // Example repo for Zerodha Kite SDK
    };

    // We can fetch star counts for main repositories
    // (For Anthropic servers, they are all in monorepo 'modelcontextprotocol/servers')
    const starCountCache = {};
    
    const fetchStars = async (repoPath) => {
      if (starCountCache[repoPath]) return starCountCache[repoPath];
      
      const apiRepo = repoPath.split('/tree/')[0]; // Extract base repo (e.g. modelcontextprotocol/servers)
      const url = `https://api.github.com/repos/${apiRepo}`;
      try {
        const res = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "MCP-Lambda-Updater"
          }
        });
        if (res.ok) {
          const data = await res.json();
          const stars = data.stargazers_count;
          
          // Format stars (e.g. 1500 -> 1.5k)
          let formattedStars = stars.toString();
          if (stars >= 1000) {
            formattedStars = (stars / 1000).toFixed(1) + "k";
          }
          starCountCache[repoPath] = formattedStars;
          return formattedStars;
        }
      } catch (err) {
        console.error(`Error fetching stars for ${repoPath}:`, err);
      }
      return null;
    };

    // Update each server card's stars in mcpRegistry
    for (let server of currentJson.mcpRegistry) {
      const repoPath = repoMapping[server.id];
      if (repoPath) {
        const freshStars = await fetchStars(repoPath);
        if (freshStars) {
          console.log(`Updated stars for ${server.name}: ${server.stars} -> ${freshStars}`);
          server.stars = freshStars;
        }
      }
    }

    // 3. Write updated data.json back to GitHub
    console.log("Committing updated data.json to GitHub repository...");
    
    const updatedContent = JSON.stringify(currentJson, null, 2);
    const base64Content = Buffer.from(updatedContent).toString('base64');
    
    const commitBody = {
      message: "chore: weekly automated mcp registry update [skip ci]",
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

    console.log("Weekly update completed successfully. Vercel deployment triggered.");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Successfully updated registry statistics." })
    };

  } catch (error) {
    console.error("Task failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
