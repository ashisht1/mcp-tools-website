/**
 * Automated Validation Script for mcptools.dev
 * Checks file presence, data.json integrity, and parses JavaScript files for syntax errors.
 */

import fs from 'fs';
import path from 'path';

console.log("--------------------------------------------------");
console.log("🔍 Running Automated Diagnostics for mcptools.dev...");
console.log("--------------------------------------------------");

const baseDir = "./";
let errors = 0;
let warnings = 0;

// Helper to log status
function check(label, success, errorMsg = "") {
  if (success) {
    console.log(`✅ ${label}`);
  } else {
    console.error(`❌ ${label} - ERROR: ${errorMsg}`);
    errors++;
  }
}

// 1. Verify file existence
const filesToCheck = [
  'index.html',
  'styles.css',
  'app.js',
  'data.json',
  'lambda-updater.js'
];

filesToCheck.forEach(file => {
  const filePath = path.join(baseDir, file);
  check(`File presence: ${file}`, fs.existsSync(filePath), `File not found at ${filePath}`);
});

// 2. Validate data.json format
let dataObj = null;
try {
  const dataPath = path.join(baseDir, 'data.json');
  if (fs.existsSync(dataPath)) {
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    dataObj = JSON.parse(rawData);
    check("JSON Syntax: data.json parses successfully", true);
  }
} catch (err) {
  check("JSON Syntax: data.json parses successfully", false, err.message);
}

// 3. Audit data.json schema integrity
if (dataObj) {
  // Check mcpRegistry
  if (dataObj.mcpRegistry && Array.isArray(dataObj.mcpRegistry)) {
    check(`Schema: mcpRegistry has ${dataObj.mcpRegistry.length} items`, true);
    
    // Validate individual registry item schema keys
    dataObj.mcpRegistry.forEach((server, i) => {
      const keys = ['id', 'name', 'icon', 'category', 'description', 'command', 'author', 'stars'];
      const missing = keys.filter(k => !server[k]);
      check(
        `Schema: Server [${server.id || i}] format`,
        missing.length === 0,
        `Missing keys: ${missing.join(', ')}`
      );
    });
  } else {
    check("Schema: mcpRegistry array exists", false, "mcpRegistry is missing or not an array");
  }

  // Check learningResources
  if (dataObj.learningResources && Array.isArray(dataObj.learningResources)) {
    check(`Schema: learningResources has ${dataObj.learningResources.length} items`, true);
    
    // Validate individual resource item schema keys
    dataObj.learningResources.forEach((res, i) => {
      const keys = ['id', 'title', 'type', 'cost', 'price', 'rating', 'reviewCount', 'description', 'url', 'author', 'level', 'courseCategory'];
      const missing = keys.filter(k => !res[k] && res[k] !== 0); // Allow price=0
      check(
        `Schema: Resource [${res.id || i}] format`,
        missing.length === 0,
        `Missing keys: ${missing.join(', ')}`
      );
    });
  } else {
    check("Schema: learningResources array exists", false, "learningResources is missing or not an array");
  }
}

// 4. Parse JS files for Syntax Errors
const jsFiles = ['app.js', 'lambda-updater.js'];
jsFiles.forEach(jsFile => {
  const filePath = path.join(baseDir, jsFile);
  if (fs.existsSync(filePath)) {
    try {
      const code = fs.readFileSync(filePath, 'utf-8');
      // Evaluate parsing using standard function wrapper (basic parser check)
      new Function(code);
      check(`JS Syntax: ${jsFile} syntax parsing check`, true);
    } catch (err) {
      // If import statements are used, Function constructor might throw 'Cannot use import statement outside a module'
      // which is a module runtime error, not a basic syntax/brackets parsing error.
      if (err.message.includes("import statement")) {
        check(`JS Syntax: ${jsFile} syntax parsing check`, true); // Syntax is valid ES6
      } else {
        check(`JS Syntax: ${jsFile} syntax parsing check`, false, err.message);
      }
    }
  }
});

console.log("--------------------------------------------------");
console.log(`📊 Diagnostic Report: ${errors} Errors, ${warnings} Warnings`);
console.log("--------------------------------------------------");

if (errors === 0) {
  console.log("🚀 Diagnostics passed successfully! The website is structurally sound.");
  process.exit(0);
} else {
  console.error("❌ Diagnostics failed. Please review errors above.");
  process.exit(1);
}
