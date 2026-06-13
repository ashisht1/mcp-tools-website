// State-managed data loaded asynchronously
let mcpRegistry = [];
let learningResources = [];

// Map category IDs to user-friendly titles
const categoryMap = {
  "llm-fundamentals": "LLM Fundamentals",
  "agent-orchestration": "Agent Orchestration",
  "custom-mcp": "Custom MCP Dev"
};

// DOM Elements
const serverGrid = document.getElementById("server-grid");
const resourcesGrid = document.getElementById("resources-grid");
const searchInput = document.getElementById("search-input");
const categoryFilters = document.getElementById("category-filters");
const controlsList = document.getElementById("controls-list");
const jsonPreview = document.getElementById("json-preview");
const copyConfigBtn = document.getElementById("copy-config-btn");
const toast = document.getElementById("toast-notification");

// Tab toggles
const tabViews = document.querySelectorAll(".tab-view");
const pageTabs = document.querySelectorAll(".page-tab");
const tabLinks = document.querySelectorAll(".tab-nav-link");

// Resource filters
const resourceSort = document.getElementById("resource-sort");
const resourceCategorySelect = document.getElementById("resource-category");
const resourceLevelSelect = document.getElementById("resource-level");
const costBtns = document.querySelectorAll(".cost-btn");

// Validator Elements
const validatorTextarea = document.getElementById("validator-textarea");
const validatorStatusContainer = document.getElementById("validator-status-container");
const validatorRulesLogs = document.getElementById("validator-rules-logs");
const btnLoadSample = document.getElementById("btn-load-sample");

// Modal Elements
const submitBtn = document.querySelector(".submit-btn");
const submitModal = document.getElementById("submit-modal");
const modalCloseBtn = document.getElementById("modal-close-btn");

// Application State
let activeTab = "servers"; // "servers", "learning", or "validator"
let currentCategory = "all";
let costFilter = "all"; // "all", "free", "paid"
let resourceCategoryFilter = "all"; // "all", "llm-fundamentals", etc.
let resourceLevelFilter = "all"; // "all", "beginner", "intermediate", "advanced"
let sortBy = "rating"; // "rating", "price-asc", "price-desc"
let searchQuery = "";
let selectedServers = {
  kite: true // Pre-select Kite for illustration
};
let serverParamValues = {};

// Initialize Website
async function init() {
  try {
    // Fetch dynamic JSON data with cache buster
    const response = await fetch('./data.json?v=' + new Date().getTime());
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const data = await response.json();
    
    mcpRegistry = data.mcpRegistry;
    learningResources = data.learningResources;
    
    // Render and bind
    renderServers();
    renderResources();
    setupEventListeners();
    renderConfigGenerator();
    updateConfigJSON();
  } catch (err) {
    console.error("Failed to load registry data", err);
    serverGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: red;">Failed to load data.json. Make sure the file exists and is served.</div>`;
  }
}

// Lightweight JSON syntax highlighter
function highlightJSON(jsonString) {
  if (!jsonString) return "";
  let html = jsonString
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  const regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  
  return html.replace(regex, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

// Direct card-specific config copies
window.copyServerConfig = function(serverId) {
  const server = mcpRegistry.find(s => s.id === serverId);
  if (!server) return;
  
  // Set default placeholders
  const defaults = {};
  if (serverId === "github") {
    defaults.GITHUB_PERSONAL_ACCESS_TOKEN = "YOUR_GITHUB_TOKEN";
  } else if (serverId === "postgres") {
    defaults.connectionString = "postgresql://localhost:5432/mydb";
  } else if (serverId === "slack") {
    defaults.SLACK_BOT_TOKEN = "YOUR_SLACK_BOT_TOKEN";
  } else if (serverId === "brave-search") {
    defaults.BRAVE_API_KEY = "YOUR_BRAVE_API_KEY";
  } else if (serverId === "filesystem") {
    defaults.allowedDirectories = "/path/to/folder";
  }
  
  const singleConfig = {
    mcpServers: {
      [serverId]: server.id === "github" ? {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: defaults.GITHUB_PERSONAL_ACCESS_TOKEN }
      } : server.id === "postgres" ? {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", defaults.connectionString]
      } : server.id === "slack" ? {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: { SLACK_BOT_TOKEN: defaults.SLACK_BOT_TOKEN }
      } : server.id === "brave-search" ? {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-brave-search"],
        env: { BRAVE_API_KEY: defaults.BRAVE_API_KEY }
      } : server.id === "filesystem" ? {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", defaults.allowedDirectories]
      } : server.id === "kite" ? {
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.kite.trade/mcp"]
      } : {
        command: "npx",
        args: ["-y", `@modelcontextprotocol/server-${serverId}`]
      }
    }
  };
  
  const text = JSON.stringify(singleConfig, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${server.name} config block copied!`);
  }).catch(() => {
    alert("Copy failed.");
  });
};

// Render the grid cards dynamically (Tab 1: Servers)
function renderServers() {
  if (!serverGrid) return;
  serverGrid.innerHTML = "";
  
  const filtered = mcpRegistry.filter(server => {
    const matchesCategory = currentCategory === "all" || server.category === currentCategory;
    const matchesSearch = server.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          server.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    serverGrid.innerHTML = `
      <div class="no-results" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="font-size: 1.2rem; margin-bottom: 8px;">No servers found</p>
        <p style="font-size: 0.9rem;">Try searching for another keyword or check the spelling.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(server => {
    const card = document.createElement("div");
    card.className = "server-card glass-panel";
    
    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-wrap">
          <span class="card-icon">${server.icon}</span>
          <div>
            <h3 class="card-name">${server.name}</h3>
            <span class="card-badge">${server.category}</span>
          </div>
        </div>
      </div>
      <p class="card-desc">${server.description}</p>
      
      <div class="card-actions">
        <div class="card-install">
          <span class="install-cmd" id="cmd-${server.id}">${server.command}</span>
          <button class="btn-copy" onclick="copyText('cmd-${server.id}', 'Command copied!')" title="Copy install command">
            📋
          </button>
        </div>
        <button class="btn-card-action" onclick="copyServerConfig('${server.id}')" title="Copy default mcp_config.json block">
          ⚙️ Copy JSON
        </button>
      </div>
      
      <div class="card-footer">
        <span class="card-author">By ${server.author}</span>
        <span class="card-stars">⭐️ ${server.stars}</span>
      </div>
    `;
    
    serverGrid.appendChild(card);
  });
}

// Render learning resources cards dynamically (Tab 2: Learning & Resources)
function renderResources() {
  if (!resourcesGrid) return;
  resourcesGrid.innerHTML = "";

  // Apply combined filters
  let filtered = learningResources.filter(res => {
    const matchesCost = costFilter === "all" || res.cost === costFilter;
    const matchesCategory = resourceCategoryFilter === "all" || res.courseCategory === resourceCategoryFilter;
    const matchesLevel = resourceLevelFilter === "all" || res.level === resourceLevelFilter;
    const matchesSearch = res.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          res.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          res.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCost && matchesCategory && matchesLevel && matchesSearch;
  });

  // Sort
  if (sortBy === "rating") {
    filtered.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === "price-asc") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortBy === "price-desc") {
    filtered.sort((a, b) => b.price - a.price);
  }

  if (filtered.length === 0) {
    resourcesGrid.innerHTML = `
      <div class="no-results" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="font-size: 1.2rem; margin-bottom: 8px;">No resources found</p>
        <p style="font-size: 0.9rem;">Try altering your filters or search keywords.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(res => {
    const card = document.createElement("div");
    card.className = "resource-card glass-panel";
    
    const priceText = res.cost === "free" ? "Free" : `$${res.price.toFixed(2)}`;
    const priceClass = res.cost === "free" ? "free" : "paid";
    const categoryTitle = categoryMap[res.courseCategory] || res.courseCategory;
    
    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-wrap">
          <div>
            <h3 class="card-name">${res.title}</h3>
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
              <span class="resource-badge">${res.type}</span>
              <span class="level-badge">${res.level}</span>
              <span class="category-badge">${categoryTitle}</span>
            </div>
          </div>
        </div>
        ${res.badge ? `<span class="badge" style="margin-bottom:0; font-size:0.6rem; padding:4px 10px;">${res.badge}</span>` : ''}
      </div>
      <p class="card-desc">${res.description}</p>
      
      <div class="card-footer" style="border:none; padding-top:0;">
        <span class="card-author">By ${res.author}</span>
        <div class="price-container">
          <span class="price-tag ${priceClass}">${priceText}</span>
        </div>
      </div>
      
      <div class="card-footer" style="padding-top:10px;">
        <div class="rating-stars">
          <span class="rating-value">${res.rating.toFixed(1)}</span>
          ${"★".repeat(Math.floor(res.rating))}${"☆".repeat(5 - Math.floor(res.rating))}
          <span class="rating-count">(${res.reviewCount})</span>
        </div>
        <a href="${res.url}" target="_blank" rel="noopener sponsored" class="btn btn-primary btn-sm">
          Visit Resource ↗
        </a>
      </div>
    `;
    
    resourcesGrid.appendChild(card);
  });
}

// Real-time config validator audit function
function validateConfigJSON(rawText) {
  if (!validatorStatusContainer || !validatorRulesLogs) return;
  
  const trimmed = rawText.trim();
  if (trimmed === "") {
    // Reset to idle/waiting state
    validatorStatusContainer.innerHTML = `
      <div class="validation-alert info" style="display:flex; gap:16px; background:rgba(79, 172, 254, 0.08); border:1px solid rgba(79, 172, 254, 0.2); border-radius:8px; padding:16px;">
        <span style="font-size:1.5rem; line-height:1.2;">💡</span>
        <div>
          <strong style="color:var(--accent-blue); display:block; font-size:0.95rem;">Waiting for input...</strong>
          <span style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-top:4px;">Paste your configuration JSON in the editor on the left to begin audit.</span>
        </div>
      </div>
    `;
    validatorRulesLogs.innerHTML = "";
    return;
  }

  let parsed = null;
  let parseError = null;

  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    parseError = err.message;
  }

  if (parseError) {
    // Render JSON parsing syntax error
    validatorStatusContainer.innerHTML = `
      <div class="validation-alert error">
        <span style="font-size:1.5rem; line-height:1.2;">❌</span>
        <div>
          <strong>Invalid JSON Format</strong>
          <span style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-top:4px;">Your code failed to parse. Details: <code>${parseError}</code></span>
        </div>
      </div>
    `;
    validatorRulesLogs.innerHTML = `
      <div class="validation-rule fail">
        <span class="rule-icon">❌</span>
        <div class="rule-details">
          <span class="rule-title">Syntax Check Failed</span>
          <span class="rule-desc">Make sure all double quotes, brackets, and commas match exactly. Trailing commas inside arrays/objects are invalid in JSON.</span>
        </div>
      </div>
    `;
    return;
  }

  // Audited checklist list
  const rules = [];

  // Rule 1: Check top-level mcpServers key
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.mcpServers) {
    rules.push({
      status: "pass",
      title: "Top-level 'mcpServers' object found",
      desc: "Configuration is correctly wrapped inside the required mcpServers parent object."
    });
    
    const servers = parsed.mcpServers;
    if (typeof servers !== "object" || Array.isArray(servers)) {
      rules.push({
        status: "fail",
        title: "'mcpServers' must be a JSON object",
        desc: "Found mcpServers, but its value is not a valid map of server definitions."
      });
    } else {
      const serverKeys = Object.keys(servers);
      if (serverKeys.length === 0) {
        rules.push({
          status: "warn",
          title: "No server configurations declared",
          desc: "Your config file works, but mcpServers is currently empty. Add at least one server definition."
        });
      } else {
        serverKeys.forEach(key => {
          const config = servers[key];
          if (!config || typeof config !== "object" || Array.isArray(config)) {
            rules.push({
              status: "fail",
              title: `Server '${key}' definition is invalid`,
              desc: `Expected a configuration object for server '${key}', but received a primitive or array.`
            });
            return;
          }

          // Rule 2: Command declared
          if (config.command) {
            rules.push({
              status: "pass",
              title: `Server '${key}': command specified`,
              desc: `Executes with command binary: '${config.command}'.`
            });
            
            // Rule 3: check npx -y
            if (config.command === "npx") {
              const hasY = config.args && Array.isArray(config.args) && config.args.includes("-y");
              if (hasY) {
                rules.push({
                  status: "pass",
                  title: `Server '${key}': NPX runs in non-interactive mode`,
                  desc: "Includes the '-y' flag to bypass package installer prompts."
                });
              } else {
                rules.push({
                  status: "warn",
                  title: `Server '${key}': NPX runs without '-y' flag`,
                  desc: "Tip: Running npx without '-y' might cause your AI agent client (like Claude Desktop) to hang indefinitely waiting for approval prompts."
                });
              }
            }
          } else {
            rules.push({
              status: "fail",
              title: `Server '${key}': missing command parameter`,
              desc: "Every active server configuration block must specify a 'command' string."
            });
          }

          // Rule 4: Args must be array
          if (config.args && !Array.isArray(config.args)) {
            rules.push({
              status: "fail",
              title: `Server '${key}': 'args' parameter is not an array`,
              desc: "The 'args' field must be an array of strings. Received type: " + (typeof config.args)
            });
          }

          // Rule 5: Env must be object
          if (config.env && (typeof config.env !== "object" || Array.isArray(config.env))) {
            rules.push({
              status: "fail",
              title: `Server '${key}': 'env' parameter is not an object`,
              desc: "The 'env' environment block must be a standard JSON key-value map."
            });
          }

          // Rule 6: Specific server variable warnings
          const normKey = key.toLowerCase();
          if (normKey.includes("github")) {
            const hasToken = config.env && config.env.GITHUB_PERSONAL_ACCESS_TOKEN;
            if (hasToken) {
              rules.push({
                status: "pass",
                title: `Server '${key}': GITHUB_PERSONAL_ACCESS_TOKEN env var detected`,
                desc: "GitHub credential check passed."
              });
            } else {
              rules.push({
                status: "warn",
                title: `Server '${key}': Missing GITHUB_PERSONAL_ACCESS_TOKEN env var`,
                desc: "Recommendation: The official GitHub MCP server requires GITHUB_PERSONAL_ACCESS_TOKEN to access API endpoints."
              });
            }
          } else if (normKey.includes("slack")) {
            const hasToken = config.env && config.env.SLACK_BOT_TOKEN;
            if (hasToken) {
              rules.push({
                status: "pass",
                title: `Server '${key}': SLACK_BOT_TOKEN env var detected`,
                desc: "Slack credential check passed."
              });
            } else {
              rules.push({
                status: "warn",
                title: `Server '${key}': Missing SLACK_BOT_TOKEN env var`,
                desc: "Recommendation: The official Slack MCP server requires SLACK_BOT_TOKEN to post messages."
              });
            }
          } else if (normKey.includes("postgres")) {
            const hasUri = config.args && config.args.some(a => typeof a === "string" && a.startsWith("postgresql://"));
            if (hasUri) {
              rules.push({
                status: "pass",
                title: `Server '${key}': postgresql:// URI argument detected`,
                desc: "PostgreSQL connection string audit passed."
              });
            } else {
              rules.push({
                status: "warn",
                title: `Server '${key}': No postgresql:// URI found in arguments`,
                desc: "Recommendation: Ensure you pass your DB connection string (postgresql://user:pass@host:5432/db) inside the args list."
              });
            }
          } else if (normKey.includes("filesystem")) {
            const hasPaths = config.args && config.args.length > 0;
            if (hasPaths) {
              rules.push({
                status: "pass",
                title: `Server '${key}': folders argument declared`,
                desc: "Checked directory permissions list."
              });
            } else {
              rules.push({
                status: "warn",
                title: `Server '${key}': no directory paths declared in arguments`,
                desc: "Recommendation: Expose folders by passing one or more absolute paths inside the args array."
              });
            }
          }
        });
      }
    }
  } else {
    rules.push({
      status: "fail",
      title: "Missing 'mcpServers' top-level key",
      desc: "A valid configuration must contain a root 'mcpServers' object containing your server definitions."
    });
  }

  // Determine overall status
  const hasFail = rules.some(r => r.status === "fail");
  const hasWarn = rules.some(r => r.status === "warn");

  if (hasFail) {
    validatorStatusContainer.innerHTML = `
      <div class="validation-alert error">
        <span style="font-size:1.5rem; line-height:1.2;">❌</span>
        <div>
          <strong>Audit Failed: Breaking Issues Found</strong>
          <span style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-top:4px;">Fix the red issues in your configuration JSON to make it valid for MCP clients.</span>
        </div>
      </div>
    `;
  } else if (hasWarn) {
    validatorStatusContainer.innerHTML = `
      <div class="validation-alert warning">
        <span style="font-size:1.5rem; line-height:1.2;">⚠️</span>
        <div>
          <strong>Configuration Valid, with Warnings</strong>
          <span style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-top:4px;">The JSON structure is valid, but we identified parameters or flags that could cause issues.</span>
        </div>
      </div>
    `;
  } else {
    validatorStatusContainer.innerHTML = `
      <div class="validation-alert success">
        <span style="font-size:1.5rem; line-height:1.2;">✅</span>
        <div>
          <strong>Configuration is Perfect!</strong>
          <span style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-top:4px;">Excellent. All checks passed. Your mcp_config.json file is fully optimized and ready to deploy.</span>
        </div>
      </div>
    `;
  }

  // Render logs
  validatorRulesLogs.innerHTML = rules.map(rule => {
    const icon = rule.status === "pass" ? "✅" : rule.status === "warn" ? "⚠️" : "❌";
    return `
      <div class="validation-rule ${rule.status === "pass" ? "pass" : rule.status === "warn" ? "warn" : "fail"}">
        <span class="rule-icon">${icon}</span>
        <div class="rule-details">
          <span class="rule-title">${rule.title}</span>
          <span class="rule-desc">${rule.desc}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render the configuration generator interactive elements
function renderConfigGenerator() {
  if (!controlsList) return;
  controlsList.innerHTML = "";
  
  mcpRegistry.forEach(server => {
    const isSelected = !!selectedServers[server.id];
    
    const item = document.createElement("div");
    item.className = `config-item ${isSelected ? 'selected' : ''}`;
    item.id = `config-item-${server.id}`;
    
    // Config parameters setup
    let paramsHtml = "";
    if (server.id === "github") {
      paramsHtml = `
        <div class="config-inputs-panel">
          <div class="config-field">
            <label for="input-github-token">GitHub Personal Access Token (Env Var)</label>
            <input type="password" id="input-github-token" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" data-server="github" data-param="GITHUB_PERSONAL_ACCESS_TOKEN" oninput="onParamChange(this)">
            <span style="font-size:0.7rem; color:var(--text-muted);">Token requires repo scope.</span>
          </div>
        </div>
      `;
    } else if (server.id === "postgres") {
      paramsHtml = `
        <div class="config-inputs-panel">
          <div class="config-field">
            <label for="input-postgres-uri">Database Connection URI (Argument)</label>
            <input type="text" id="input-postgres-uri" placeholder="postgresql://localhost:5432/mydb" data-server="postgres" data-param="connectionString" oninput="onParamChange(this)">
            <span style="font-size:0.7rem; color:var(--text-muted);">Standard connection URL.</span>
          </div>
        </div>
      `;
    } else if (server.id === "slack") {
      paramsHtml = `
        <div class="config-inputs-panel">
          <div class="config-field">
            <label for="input-slack-token">Slack Bot Token (Env Var)</label>
            <input type="password" id="input-slack-token" placeholder="xoxb-xxxxxxxxx" data-server="slack" data-param="SLACK_BOT_TOKEN" oninput="onParamChange(this)">
            <span style="font-size:0.7rem; color:var(--text-muted);">Bot User OAuth token.</span>
          </div>
        </div>
      `;
    } else if (server.id === "brave-search") {
      paramsHtml = `
        <div class="config-inputs-panel">
          <div class="config-field">
            <label for="input-brave-key">Brave API Key (Env Var)</label>
            <input type="password" id="input-brave-key" placeholder="BSxxxxxxxxxxxx" data-server="brave-search" data-param="BRAVE_API_KEY" oninput="onParamChange(this)">
            <span style="font-size:0.7rem; color:var(--text-muted);">Get a search API key from Brave.</span>
          </div>
        </div>
      `;
    } else if (server.id === "filesystem") {
      paramsHtml = `
        <div class="config-inputs-panel">
          <div class="config-field">
            <label for="input-filesystem-dirs">Allowed Directories (Comma separated)</label>
            <input type="text" id="input-filesystem-dirs" placeholder="/Users/username/projects" data-server="filesystem" data-param="allowedDirectories" oninput="onParamChange(this)">
            <span style="font-size:0.7rem; color:var(--text-muted);">Folders permitted for read/write.</span>
          </div>
        </div>
      `;
    }

    item.innerHTML = `
      <label class="config-checkbox-label">
        <input 
          type="checkbox" 
          ${isSelected ? 'checked' : ''} 
          data-server-id="${server.id}"
          onchange="toggleServerSelection(this)"
        >
        <span>${server.icon} ${server.name}</span>
      </label>
      ${paramsHtml}
    `;
    
    controlsList.appendChild(item);
  });
}

// Handle checkbox changes in config generator
window.toggleServerSelection = function(checkbox) {
  const serverId = checkbox.dataset.serverId;
  const isChecked = checkbox.checked;
  
  selectedServers[serverId] = isChecked;
  
  const parentItem = document.getElementById(`config-item-${serverId}`);
  if (parentItem) {
    if (isChecked) {
      parentItem.classList.add("selected");
    } else {
      parentItem.classList.remove("selected");
    }
  }
  
  updateConfigJSON();
};

// Handle parameter changes in inputs
window.onParamChange = function(input) {
  const serverId = input.dataset.server;
  const paramKey = input.dataset.param;
  const val = input.value;
  
  serverParamValues[`${serverId}_${paramKey}`] = val;
  updateConfigJSON();
};

// Rebuild and output the config JSON preview (with syntax highlighting)
function updateConfigJSON() {
  if (!jsonPreview) return;
  const config = {
    mcpServers: {}
  };
  
  let hasAny = false;
  
  mcpRegistry.forEach(server => {
    if (selectedServers[server.id]) {
      hasAny = true;
      const vals = {};
      if (server.id === "github") {
        vals.GITHUB_PERSONAL_ACCESS_TOKEN = serverParamValues["github_GITHUB_PERSONAL_ACCESS_TOKEN"] || "YOUR_GITHUB_TOKEN";
        config.mcpServers.github = {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: vals.GITHUB_PERSONAL_ACCESS_TOKEN }
        };
      } else if (server.id === "postgres") {
        vals.connectionString = serverParamValues["postgres_connectionString"] || "postgresql://localhost:5432/mydb";
        config.mcpServers.postgres = {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres", vals.connectionString]
        };
      } else if (server.id === "slack") {
        vals.SLACK_BOT_TOKEN = serverParamValues["slack_SLACK_BOT_TOKEN"] || "YOUR_SLACK_BOT_TOKEN";
        config.mcpServers.slack = {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-slack"],
          env: { SLACK_BOT_TOKEN: vals.SLACK_BOT_TOKEN }
        };
      } else if (server.id === "brave-search") {
        vals.BRAVE_API_KEY = serverParamValues["brave-search_BRAVE_API_KEY"] || "YOUR_BRAVE_API_KEY";
        config.mcpServers["brave-search"] = {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-brave-search"],
          env: { BRAVE_API_KEY: vals.BRAVE_API_KEY }
        };
      } else if (server.id === "filesystem") {
        vals.allowedDirectories = serverParamValues["filesystem_allowedDirectories"] || "";
        const dirs = vals.allowedDirectories ? vals.allowedDirectories.split(",") : [];
        config.mcpServers.filesystem = {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", ...dirs]
        };
      } else if (server.id === "kite") {
        config.mcpServers.kite = {
          command: "npx",
          args: ["-y", "mcp-remote", "https://mcp.kite.trade/mcp"]
        };
      } else {
        config.mcpServers[server.id] = {
          command: "npx",
          args: ["-y", `@modelcontextprotocol/server-${server.id}`]
        };
      }
    }
  });
  
  if (!hasAny) {
    jsonPreview.textContent = `{\n  "mcpServers": {}\n}`;
    return;
  }
  
  const rawString = JSON.stringify(config, null, 2);
  jsonPreview.innerHTML = highlightJSON(rawString);
}

// Show active Toast alerts
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("active");
  setTimeout(() => {
    toast.classList.remove("active");
  }, 2500);
}

// Copy utilities
window.copyText = function(elementId, successMessage) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const text = element.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMessage);
  }).catch(() => {
    alert("Failed to copy text. Please select and copy manually.");
  });
};

// Switch page view between tabs
function switchTab(tabName) {
  activeTab = tabName;
  
  // Update switcher button classes
  pageTabs.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  
  // Show active view container, hide others
  tabViews.forEach(view => {
    if (view.id === `view-${tabName}`) {
      view.classList.add("active");
    } else {
      view.classList.remove("active");
    }
  });
  
  // Set search placeholder dynamically / manage visible filters
  if (tabName === "servers") {
    searchInput.placeholder = "Search servers (e.g. Postgres, Slack, Kite...)";
    searchInput.style.display = "block";
    document.querySelector(".search-icon").style.display = "block";
  } else if (tabName === "learning") {
    searchInput.placeholder = "Search learning paths, courses, videos...";
    searchInput.style.display = "block";
    document.querySelector(".search-icon").style.display = "block";
  } else {
    // Hide search input inside Validator tab as it has its own input textarea
    searchInput.style.display = "none";
    document.querySelector(".search-icon").style.display = "none";
  }

  // Clear search input on tab switch
  searchInput.value = "";
  searchQuery = "";
  
  // Render
  renderServers();
  renderResources();
}

// Setup DOM event listeners
function setupEventListeners() {
  // Page tab switching
  pageTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Nav link mappings to switch tabs
  tabLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      switchTab("servers");
    });
  });

  // Search filtering (delegates to the active tab view)
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    if (activeTab === "servers") {
      renderServers();
    } else if (activeTab === "learning") {
      renderResources();
    }
  });
  
  // Category tabs filtering (Servers only)
  if (categoryFilters) {
    categoryFilters.addEventListener("click", (e) => {
      if (e.target.classList.contains("filter-btn")) {
        document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
        e.target.classList.add("active");
        
        currentCategory = e.target.dataset.category;
        renderServers();
      }
    });
  }

  // Cost toggles (Resources only)
  costBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      costBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      costFilter = btn.dataset.cost;
      renderResources();
    });
  });

  // Sorting selection (Resources only)
  if (resourceSort) {
    resourceSort.addEventListener("change", (e) => {
      sortBy = e.target.value;
      renderResources();
    });
  }

  // Topic category filtering (Resources only)
  if (resourceCategorySelect) {
    resourceCategorySelect.addEventListener("change", (e) => {
      resourceCategoryFilter = e.target.value;
      renderResources();
    });
  }

  // Level filtering (Resources only)
  if (resourceLevelSelect) {
    resourceLevelSelect.addEventListener("change", (e) => {
      resourceLevelFilter = e.target.value;
      renderResources();
    });
  }

  // Validator interactive triggers
  if (validatorTextarea) {
    validatorTextarea.addEventListener("input", (e) => {
      validateConfigJSON(e.target.value);
    });
  }

  if (btnLoadSample) {
    btnLoadSample.addEventListener("click", () => {
      const sampleCode = `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": ""
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"]
    }
  }
}`;
      validatorTextarea.value = sampleCode;
      validateConfigJSON(sampleCode);
    });
  }

  // Copy config file action
  if (copyConfigBtn) {
    copyConfigBtn.addEventListener("click", () => {
      const tempElement = document.createElement("div");
      tempElement.innerHTML = jsonPreview.innerHTML;
      const cleanText = tempElement.textContent;
      navigator.clipboard.writeText(cleanText).then(() => {
        showToast("Config JSON copied to clipboard!");
      });
    });
  }

  // Modal show/hide actions
  if (submitBtn) {
    submitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      submitModal.classList.add("active");
    });
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
      submitModal.classList.remove("active");
    });
  }

  if (submitModal) {
    submitModal.addEventListener("click", (e) => {
      if (e.target === submitModal) {
        submitModal.classList.remove("active");
      }
    });
  }

  // Copy Node Quickstart code
  const btnCopyCode = document.querySelector(".btn-copy-code");
  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", () => {
      const targetId = btnCopyCode.dataset.copyTarget;
      const codeText = document.getElementById(targetId).textContent;
      navigator.clipboard.writeText(codeText).then(() => {
        showToast("Code snippet copied!");
      });
    });
  }
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", init);
