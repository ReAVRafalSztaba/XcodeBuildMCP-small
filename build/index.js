#!/usr/bin/env node
import { createRequire } from 'module';
import { execSync, spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import * as os from 'os';
import { tmpdir } from 'os';
import * as path3 from 'path';
import path3__default from 'path';
import * as fs from 'fs/promises';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { McpServer } from '@camsoft/mcp-sdk/server/mcp.js';
import { StdioServerTransport } from '@camsoft/mcp-sdk/server/stdio.js';
import { SetLevelRequestSchema } from '@camsoft/mcp-sdk/types.js';
import process2 from 'process';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
function isTestEnv() {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test" || process.env.XCODEBUILDMCP_SILENCE_LOGS === "true";
}
function loadSentrySync() {
  if (!SENTRY_ENABLED || isTestEnv()) return null;
  if (cachedSentry) return cachedSentry;
  try {
    cachedSentry = require2("@sentry/node");
    return cachedSentry;
  } catch {
    return null;
  }
}
function withSentry(cb) {
  const s = loadSentrySync();
  if (!s) return;
  try {
    cb(s);
  } catch {
  }
}
function setLogLevel(level) {
  clientLogLevel = level;
  log("debug", `Log level set to: ${level}`);
}
function shouldLog(level) {
  if (isTestEnv()) {
    return false;
  }
  if (clientLogLevel === null) {
    return true;
  }
  const levelKey = level.toLowerCase();
  if (!(levelKey in LOG_LEVELS)) {
    return true;
  }
  return LOG_LEVELS[levelKey] <= LOG_LEVELS[clientLogLevel];
}
function log(level, message, context) {
  if (!shouldLog(level)) {
    return;
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  const captureToSentry = SENTRY_ENABLED && (context?.sentry ?? level === "error");
  if (captureToSentry) {
    withSentry((s) => s.captureMessage(logMessage));
  }
  console.error(logMessage);
}
var SENTRY_ENABLED, LOG_LEVELS, clientLogLevel, require2, cachedSentry;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    SENTRY_ENABLED = process.env.SENTRY_DISABLED !== "true" && process.env.XCODEBUILDMCP_SENTRY_DISABLED !== "true";
    LOG_LEVELS = {
      emergency: 0,
      alert: 1,
      critical: 2,
      error: 3,
      warning: 4,
      notice: 5,
      info: 6,
      debug: 7
    };
    clientLogLevel = null;
    require2 = createRequire(import.meta.url);
    cachedSentry = null;
    if (!SENTRY_ENABLED) {
      if (process.env.SENTRY_DISABLED === "true") {
        log("info", "Sentry disabled due to SENTRY_DISABLED environment variable");
      } else if (process.env.XCODEBUILDMCP_SENTRY_DISABLED === "true") {
        log("info", "Sentry disabled due to XCODEBUILDMCP_SENTRY_DISABLED environment variable");
      }
    }
  }
});
async function defaultExecutor(command, logPrefix, useShell = true, opts, detached = false) {
  let escapedCommand = command;
  if (useShell) {
    const commandString = command.map((arg) => {
      if (/[\s,"'=$`;&|<>(){}[\]\\*?~]/.test(arg) && !/^".*"$/.test(arg)) {
        return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
      }
      return arg;
    }).join(" ");
    escapedCommand = ["sh", "-c", commandString];
  }
  const displayCommand = useShell && escapedCommand.length === 3 ? escapedCommand[2] : escapedCommand.join(" ");
  log("info", `Executing ${logPrefix ?? ""} command: ${displayCommand}`);
  return new Promise((resolve2, reject) => {
    const executable = escapedCommand[0];
    const args = escapedCommand.slice(1);
    const spawnOpts = {
      stdio: ["ignore", "pipe", "pipe"],
      // ignore stdin, pipe stdout/stderr
      env: { ...process.env, ...opts?.env ?? {} },
      cwd: opts?.cwd
    };
    const childProcess = spawn(executable, args, spawnOpts);
    let stdout = "";
    let stderr = "";
    childProcess.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    childProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    if (detached) {
      let resolved = false;
      childProcess.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (childProcess.pid) {
            resolve2({
              success: true,
              output: "",
              // No output for detached processes
              process: childProcess
            });
          } else {
            resolve2({
              success: false,
              output: "",
              error: "Failed to start detached process",
              process: childProcess
            });
          }
        }
      }, 100);
    } else {
      childProcess.on("close", (code) => {
        const success = code === 0;
        const response = {
          success,
          output: stdout,
          error: success ? void 0 : stderr,
          process: childProcess,
          exitCode: code ?? void 0
        };
        resolve2(response);
      });
      childProcess.on("error", (err) => {
        reject(err);
      });
    }
  });
}
function getDefaultCommandExecutor() {
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    throw new Error(
      `\u{1F6A8} REAL SYSTEM EXECUTOR DETECTED IN TEST! \u{1F6A8}
This test is trying to use the default command executor instead of a mock.
Fix: Pass createMockExecutor() as the commandExecutor parameter in your test.
Example: await plugin.handler(args, createMockExecutor({success: true}), mockFileSystem)
See docs/TESTING.md for proper testing patterns.`
    );
  }
  return defaultExecutor;
}
function getDefaultFileSystemExecutor() {
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    throw new Error(
      `\u{1F6A8} REAL FILESYSTEM EXECUTOR DETECTED IN TEST! \u{1F6A8}
This test is trying to use the default filesystem executor instead of a mock.
Fix: Pass createMockFileSystemExecutor() as the fileSystemExecutor parameter in your test.
Example: await plugin.handler(args, mockCmd, createMockFileSystemExecutor())
See docs/TESTING.md for proper testing patterns.`
    );
  }
  return defaultFileSystemExecutor;
}
var defaultFileSystemExecutor;
var init_command = __esm({
  "src/utils/command.ts"() {
    init_logger();
    defaultFileSystemExecutor = {
      async mkdir(path4, options) {
        const fs2 = await import('fs/promises');
        await fs2.mkdir(path4, options);
      },
      async readFile(path4, encoding = "utf8") {
        const fs2 = await import('fs/promises');
        const content = await fs2.readFile(path4, encoding);
        return content;
      },
      async writeFile(path4, content, encoding = "utf8") {
        const fs2 = await import('fs/promises');
        await fs2.writeFile(path4, content, encoding);
      },
      async cp(source, destination, options) {
        const fs2 = await import('fs/promises');
        await fs2.cp(source, destination, options);
      },
      async readdir(path4, options) {
        const fs2 = await import('fs/promises');
        return await fs2.readdir(path4, options);
      },
      async rm(path4, options) {
        const fs2 = await import('fs/promises');
        await fs2.rm(path4, options);
      },
      existsSync(path4) {
        return existsSync(path4);
      },
      async stat(path4) {
        const fs2 = await import('fs/promises');
        return await fs2.stat(path4);
      },
      async mkdtemp(prefix) {
        const fs2 = await import('fs/promises');
        return await fs2.mkdtemp(prefix);
      },
      tmpdir() {
        return tmpdir();
      }
    };
  }
});
function isXcodemakeEnabled() {
  const envValue = process.env[XCODEMAKE_ENV_VAR];
  return envValue === "1" || envValue === "true" || envValue === "yes";
}
function getXcodemakeCommand() {
  return overriddenXcodemakePath ?? "xcodemake";
}
function overrideXcodemakeCommand(path4) {
  overriddenXcodemakePath = path4;
  log("info", `Using overridden xcodemake path: ${path4}`);
}
async function installXcodemake() {
  const tempDir = os.tmpdir();
  const xcodemakeDir = path3.join(tempDir, "xcodebuildmcp");
  const xcodemakePath = path3.join(xcodemakeDir, "xcodemake");
  log("info", `Attempting to install xcodemake to ${xcodemakePath}`);
  try {
    await fs.mkdir(xcodemakeDir, { recursive: true });
    log("info", "Downloading xcodemake from GitHub...");
    const response = await fetch(
      "https://raw.githubusercontent.com/cameroncooke/xcodemake/main/xcodemake"
    );
    if (!response.ok) {
      throw new Error(`Failed to download xcodemake: ${response.status} ${response.statusText}`);
    }
    const scriptContent = await response.text();
    await fs.writeFile(xcodemakePath, scriptContent, "utf8");
    await fs.chmod(xcodemakePath, 493);
    log("info", "Made xcodemake executable");
    overrideXcodemakeCommand(xcodemakePath);
    return true;
  } catch (error) {
    log(
      "error",
      `Error installing xcodemake: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
async function isXcodemakeAvailable() {
  if (!isXcodemakeEnabled()) {
    log("debug", "xcodemake is not enabled, skipping availability check");
    return false;
  }
  try {
    if (overriddenXcodemakePath && existsSync(overriddenXcodemakePath)) {
      log("debug", `xcodemake found at overridden path: ${overriddenXcodemakePath}`);
      return true;
    }
    const result = await getDefaultCommandExecutor()(["which", "xcodemake"]);
    if (result.success) {
      log("debug", "xcodemake found in PATH");
      return true;
    }
    log("info", "xcodemake not found in PATH, attempting to download...");
    const installed = await installXcodemake();
    if (installed) {
      log("info", "xcodemake installed successfully");
      return true;
    } else {
      log("warn", "xcodemake installation failed");
      return false;
    }
  } catch (error) {
    log(
      "error",
      `Error checking for xcodemake: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
function doesMakefileExist(projectDir) {
  return existsSync(`${projectDir}/Makefile`);
}
function doesMakeLogFileExist(projectDir, command) {
  const originalDir = process.cwd();
  try {
    process.chdir(projectDir);
    const xcodemakeCommand = ["xcodemake", ...command.slice(1)];
    const escapedCommand = xcodemakeCommand.map((arg) => {
      const prefix = projectDir + "/";
      if (arg.startsWith(prefix)) {
        return arg.substring(prefix.length);
      }
      return arg;
    });
    const commandString = escapedCommand.join(" ");
    const logFileName = `${commandString}.log`;
    log("debug", `Checking for Makefile log: ${logFileName} in directory: ${process.cwd()}`);
    const files = readdirSync(".");
    const exists = files.includes(logFileName);
    log("debug", `Makefile log ${exists ? "exists" : "does not exist"}: ${logFileName}`);
    return exists;
  } catch (error) {
    log(
      "error",
      `Error checking for Makefile log: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  } finally {
    process.chdir(originalDir);
  }
}
async function executeXcodemakeCommand(projectDir, buildArgs, logPrefix) {
  process.chdir(projectDir);
  const xcodemakeCommand = [getXcodemakeCommand(), ...buildArgs];
  const command = xcodemakeCommand.map((arg) => arg.replace(projectDir + "/", ""));
  return getDefaultCommandExecutor()(command, logPrefix);
}
async function executeMakeCommand(projectDir, logPrefix) {
  const command = ["cd", projectDir, "&&", "make"];
  return getDefaultCommandExecutor()(command, logPrefix);
}
var XCODEMAKE_ENV_VAR, overriddenXcodemakePath;
var init_xcodemake = __esm({
  "src/utils/xcodemake.ts"() {
    init_logger();
    init_command();
    XCODEMAKE_ENV_VAR = "INCREMENTAL_BUILDS_ENABLED";
    overriddenXcodemakePath = null;
  }
});

// src/utils/logging/index.ts
var init_logging = __esm({
  "src/utils/logging/index.ts"() {
    init_logger();
  }
});

// src/mcp/tools/discovery/index.ts
var discovery_exports = {};
__export(discovery_exports, {
  workflow: () => workflow
});
var workflow;
var init_discovery = __esm({
  "src/mcp/tools/discovery/index.ts"() {
    workflow = {
      name: "Dynamic Tool Discovery",
      description: "Intelligent discovery and recommendation of appropriate development workflows based on project structure and requirements",
      platforms: ["iOS", "macOS", "watchOS", "tvOS", "visionOS"],
      targets: ["simulator", "device"],
      projectTypes: ["project", "workspace", "package"],
      capabilities: ["discovery", "recommendation", "workflow-analysis"]
    };
  }
});

// src/types/common.ts
function createTextContent(text) {
  return { type: "text", text };
}
var init_common = __esm({
  "src/types/common.ts"() {
  }
});
function getDefaultEnvironmentDetector() {
  return defaultEnvironmentDetector;
}
var ProductionEnvironmentDetector, defaultEnvironmentDetector;
var init_environment = __esm({
  "src/utils/environment.ts"() {
    init_logger();
    ProductionEnvironmentDetector = class {
      isRunningUnderClaudeCode() {
        if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
          return false;
        }
        if (process.env.CLAUDECODE === "1" || process.env.CLAUDE_CODE_ENTRYPOINT === "cli") {
          return true;
        }
        try {
          const parentPid = process.ppid;
          if (parentPid) {
            const parentCommand = execSync(`ps -o command= -p ${parentPid}`, {
              encoding: "utf8",
              timeout: 1e3
            }).trim();
            if (parentCommand.includes("claude")) {
              return true;
            }
          }
        } catch (error) {
          log("debug", `Failed to detect parent process: ${error}`);
        }
        return false;
      }
    };
    defaultEnvironmentDetector = new ProductionEnvironmentDetector();
  }
});

// src/utils/validation.ts
function createTextResponse(message, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError
  };
}
function consolidateContentForClaudeCode(response) {
  const shouldConsolidate = getDefaultEnvironmentDetector().isRunningUnderClaudeCode();
  if (!shouldConsolidate || !response.content || response.content.length <= 1) {
    return response;
  }
  const textParts = [];
  response.content.forEach((item, index) => {
    if (item.type === "text") {
      if (index > 0 && textParts.length > 0) {
        textParts.push("\n---\n");
      }
      textParts.push(item.text);
    }
  });
  if (textParts.length === 0) {
    return response;
  }
  const consolidatedText = textParts.join("");
  return {
    ...response,
    content: [
      {
        type: "text",
        text: consolidatedText
      }
    ]
  };
}
var init_validation = __esm({
  "src/utils/validation.ts"() {
    init_logger();
    init_common();
    init_environment();
  }
});

// src/utils/errors.ts
function createErrorResponse(message, details) {
  const detailText = details ? `
Details: ${details}` : "";
  return {
    content: [
      {
        type: "text",
        text: `Error: ${message}${detailText}`
      }
    ],
    isError: true
  };
}
var init_errors = __esm({
  "src/utils/errors.ts"() {
  }
});

// src/utils/responses/index.ts
var init_responses = __esm({
  "src/utils/responses/index.ts"() {
    init_validation();
    init_errors();
  }
});

// src/core/dynamic-tools.ts
function wrapHandlerWithExecutor(handler) {
  return async (args) => {
    return handler(args, getDefaultCommandExecutor());
  };
}
function clearEnabledWorkflows() {
  if (enabledTools.size === 0) {
    log("debug", "No tools to clear");
    return;
  }
  const clearedWorkflows = Array.from(enabledWorkflows);
  const toolNamesToRemove = Array.from(enabledTools.keys());
  const clearedToolCount = toolNamesToRemove.length;
  log("info", `Removing ${clearedToolCount} tools from workflows: ${clearedWorkflows.join(", ")}`);
  const removedTools = removeTrackedTools(toolNamesToRemove);
  enabledWorkflows.clear();
  enabledTools.clear();
  log("info", `\u2705 Removed ${removedTools.length} tools successfully`);
}
async function enableWorkflows(server, workflowNames, additive = false) {
  if (!server) {
    throw new Error("Server instance not available for dynamic tool registration");
  }
  if (!additive && enabledWorkflows.size > 0) {
    log("info", `Replacing existing workflows: ${Array.from(enabledWorkflows).join(", ")}`);
    clearEnabledWorkflows();
  }
  let totalToolsAdded = 0;
  for (const workflowName of workflowNames) {
    const loader = WORKFLOW_LOADERS[workflowName];
    if (!loader) {
      log("warn", `Workflow '${workflowName}' not found in available workflows`);
      continue;
    }
    try {
      log("info", `Loading workflow '${workflowName}' with code-splitting...`);
      const workflowModule = await loader();
      const toolKeys = Object.keys(workflowModule).filter((key) => key !== "workflow");
      log("info", `Enabling ${toolKeys.length} tools from '${workflowName}' workflow`);
      const toolsToRegister = [];
      for (const toolKey of toolKeys) {
        const tool = workflowModule[toolKey];
        if (tool?.name && typeof tool.handler === "function") {
          if (isToolRegistered(tool.name)) {
            log("debug", `Skipping already registered tool: ${tool.name}`);
            continue;
          }
          toolsToRegister.push({
            name: tool.name,
            config: {
              description: tool.description ?? "",
              inputSchema: tool.schema
            },
            callback: wrapHandlerWithExecutor(tool.handler)
          });
          enabledTools.set(tool.name, workflowName);
          totalToolsAdded++;
        } else {
          log("warn", `Invalid tool definition for '${toolKey}' in workflow '${workflowName}'`);
        }
      }
      if (toolsToRegister.length > 0) {
        log(
          "info",
          `\u{1F680} Registering ${toolsToRegister.length} tools from '${workflowName}' workflow`
        );
        const toolRegistrations = toolsToRegister.map((tool) => ({
          name: tool.name,
          config: {
            description: tool.config.description,
            inputSchema: tool.config.inputSchema
          },
          callback: (args) => tool.callback(args)
        }));
        const registeredTools = registerAndTrackTools(server, toolRegistrations);
        log("info", `\u2705 Registered ${registeredTools.length} tools from '${workflowName}'`);
      } else {
        log("info", `No new tools to register from '${workflowName}' (all already registered)`);
      }
      enabledWorkflows.add(workflowName);
    } catch (error) {
      log(
        "error",
        `Failed to load workflow '${workflowName}': ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
  log(
    "info",
    `\u2705 Successfully enabled ${totalToolsAdded} tools from ${workflowNames.length} workflows`
  );
}
function getAvailableWorkflows() {
  return Object.keys(WORKFLOW_LOADERS);
}
function generateWorkflowDescriptions() {
  return Object.entries(WORKFLOW_METADATA).map(([name, metadata]) => `- **${name.toUpperCase()}**: ${metadata.description}`).join("\n");
}
var enabledWorkflows, enabledTools;
var init_dynamic_tools = __esm({
  "src/core/dynamic-tools.ts"() {
    init_logger();
    init_command();
    init_generated_plugins();
    init_tool_registry();
    enabledWorkflows = /* @__PURE__ */ new Set();
    enabledTools = /* @__PURE__ */ new Map();
  }
});

// src/utils/session-store.ts
var SessionStore, sessionStore;
var init_session_store = __esm({
  "src/utils/session-store.ts"() {
    init_logger();
    SessionStore = class {
      defaults = {};
      setDefaults(partial) {
        this.defaults = { ...this.defaults, ...partial };
        log("info", `[Session] Defaults updated: ${Object.keys(partial).join(", ")}`);
      }
      clear(keys2) {
        if (keys2 == null) {
          this.defaults = {};
          log("info", "[Session] All defaults cleared");
          return;
        }
        if (keys2.length === 0) {
          log("info", "[Session] No keys provided to clear; no changes made");
          return;
        }
        for (const k of keys2) delete this.defaults[k];
        log("info", `[Session] Defaults cleared: ${keys2.join(", ")}`);
      }
      get(key) {
        return this.defaults[key];
      }
      getAll() {
        return { ...this.defaults };
      }
    };
    sessionStore = new SessionStore();
  }
});
function createTypedTool(schema, logicFunction, getExecutor) {
  return async (args) => {
    try {
      const validatedParams = schema.parse(args);
      return await logicFunction(validatedParams, getExecutor());
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((e) => {
          const path4 = e.path.length > 0 ? `${e.path.join(".")}` : "root";
          return `${path4}: ${e.message}`;
        });
        return createErrorResponse(
          "Parameter validation failed",
          `Invalid parameters:
${errorMessages.join("\n")}`
        );
      }
      throw error;
    }
  };
}
function missingFromMerged(keys2, merged) {
  return keys2.filter((k) => merged[k] == null);
}
function createSessionAwareTool(opts) {
  const {
    internalSchema,
    logicFunction,
    getExecutor,
    requirements = [],
    exclusivePairs = []
  } = opts;
  return async (rawArgs) => {
    try {
      const sanitizedArgs = {};
      for (const [k, v] of Object.entries(rawArgs)) {
        if (v === null || v === void 0) continue;
        if (typeof v === "string" && v.trim() === "") continue;
        sanitizedArgs[k] = v;
      }
      for (const pair of exclusivePairs) {
        const provided = pair.filter((k) => Object.prototype.hasOwnProperty.call(sanitizedArgs, k));
        if (provided.length >= 2) {
          return createErrorResponse(
            "Parameter validation failed",
            `Invalid parameters:
Mutually exclusive parameters provided: ${provided.join(
              ", "
            )}. Provide only one.`
          );
        }
      }
      const merged = { ...sessionStore.getAll(), ...sanitizedArgs };
      for (const pair of exclusivePairs) {
        const userProvidedConcrete = pair.some(
          (k) => Object.prototype.hasOwnProperty.call(sanitizedArgs, k)
        );
        if (!userProvidedConcrete) continue;
        for (const k of pair) {
          if (!Object.prototype.hasOwnProperty.call(sanitizedArgs, k) && k in merged) {
            delete merged[k];
          }
        }
      }
      for (const req of requirements) {
        if ("allOf" in req) {
          const missing = missingFromMerged(req.allOf, merged);
          if (missing.length > 0) {
            return createErrorResponse(
              "Missing required session defaults",
              `${req.message ?? `Required: ${req.allOf.join(", ")}`}
Set with: session-set-defaults { ${missing.map((k) => `"${k}": "..."`).join(", ")} }`
            );
          }
        } else if ("oneOf" in req) {
          const satisfied = req.oneOf.some((k) => merged[k] != null);
          if (!satisfied) {
            const options = req.oneOf.join(", ");
            const setHints = req.oneOf.map((k) => `session-set-defaults { "${k}": "..." }`).join(" OR ");
            return createErrorResponse(
              "Missing required session defaults",
              `${req.message ?? `Provide one of: ${options}`}
Set with: ${setHints}`
            );
          }
        }
      }
      const validated = internalSchema.parse(merged);
      return await logicFunction(validated, getExecutor());
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((e) => {
          const path4 = e.path.length > 0 ? `${e.path.join(".")}` : "root";
          return `${path4}: ${e.message}`;
        });
        return createErrorResponse(
          "Parameter validation failed",
          `Invalid parameters:
${errorMessages.join("\n")}
Tip: set session defaults via session-set-defaults`
        );
      }
      throw error;
    }
  };
}
var init_typed_tool_factory = __esm({
  "src/utils/typed-tool-factory.ts"() {
    init_responses();
    init_session_store();
  }
});

// src/utils/execution/index.ts
var init_execution = __esm({
  "src/utils/execution/index.ts"() {
    init_command();
  }
});

// src/mcp/tools/discovery/discover_tools.ts
var discover_tools_exports = {};
__export(discover_tools_exports, {
  default: () => discover_tools_default,
  discover_toolsLogic: () => discover_toolsLogic
});
function sanitizeTaskDescription(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Task description must be a non-empty string");
  }
  let sanitized = input.replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\s+/g, " ").trim();
  if (sanitized.length === 0) {
    throw new Error("Task description cannot be empty after sanitization");
  }
  if (sanitized.length > 2e3) {
    sanitized = sanitized.substring(0, 2e3);
    log("warn", "Task description truncated to 2000 characters for safety");
  }
  const suspiciousPatterns = [
    /ignore\s+previous\s+instructions/gi,
    /forget\s+everything/gi,
    /system\s*:/gi,
    /assistant\s*:/gi,
    /you\s+are\s+now/gi,
    /act\s+as/gi
  ];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      log("warn", "Potentially suspicious pattern detected in task description");
      sanitized = sanitized.replace(pattern, "[filtered]");
    }
  }
  return sanitized;
}
async function discover_toolsLogic(args, _executor, deps) {
  if (!args || typeof args !== "object") {
    return createTextResponse("Invalid arguments provided to discover_tools", true);
  }
  const { task_description, additive } = args;
  let sanitizedTaskDescription;
  try {
    sanitizedTaskDescription = sanitizeTaskDescription(task_description);
    log("info", `Discovering tools for task: ${sanitizedTaskDescription}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Invalid task description";
    log("error", `Task description sanitization failed: ${errorMessage}`);
    return createTextResponse(`Invalid task description: ${errorMessage}`, true);
  }
  try {
    const server = globalThis.mcpServer;
    if (!server) {
      throw new Error("Server instance not available");
    }
    const clientCapabilities = server.server?.getClientCapabilities?.();
    if (!clientCapabilities?.sampling) {
      log("warn", "Client does not support sampling capability");
      return createTextResponse(
        "Your client does not support the sampling feature required for dynamic tool discovery. Please use XCODEBUILDMCP_DYNAMIC_TOOLS=false to use the standard tool set.",
        true
      );
    }
    const workflowNames = (deps?.getAvailableWorkflows ?? getAvailableWorkflows)();
    const workflowDescriptions = (deps?.generateWorkflowDescriptions ?? generateWorkflowDescriptions)();
    const userPrompt = `You are an expert assistant for the XcodeBuildMCP server. Your task is to select the most relevant workflow for a user's Apple development request.

The user wants to perform the following task: "${sanitizedTaskDescription}"

IMPORTANT: Select EXACTLY ONE workflow that best matches the user's task. In most cases, users are working with a project or workspace. Use this selection guide:

Primary (project/workspace-based) workflows:
- iOS simulator (supports both .xcworkspace and .xcodeproj): choose "simulator"
- iOS physical device (supports both .xcworkspace and .xcodeproj): choose "device"
- macOS (supports both .xcworkspace and .xcodeproj): choose "macos"
- Swift Package Manager (no Xcode project): choose "swift-package"

Secondary (task-based, no project/workspace needed):
- Simulator management (boot, list, open, status bar, appearance, GPS/location): choose "simulator-management"
- Logging or log capture (simulator or device): choose "logging"
- UI automation/gestures/screenshots on a simulator app: choose "ui-testing"
- System/environment diagnostics or validation: choose "doctor"
- Create new iOS/macOS projects from templates: choose "project-scaffolding"
- Project discovery and analysis: choose "project-discovery"
- General utilities: choose "utilities"

All available workflows:
${workflowDescriptions}

Respond with ONLY a JSON array containing ONE workflow name that best matches the task (e.g., ["simulator"]).`;
    const llmConfig = getLLMConfig();
    log("debug", `Sending sampling request to client LLM with maxTokens: ${llmConfig.maxTokens}`);
    if (!server.server?.createMessage) {
      throw new Error("Server does not support message creation");
    }
    const samplingOptions = {
      messages: [{ role: "user", content: { type: "text", text: userPrompt } }],
      maxTokens: llmConfig.maxTokens
    };
    if (llmConfig.temperature !== void 0) {
      samplingOptions.temperature = llmConfig.temperature;
    }
    const samplingResult = await server.server.createMessage(samplingOptions);
    let selectedWorkflows = [];
    try {
      if (!samplingResult || typeof samplingResult !== "object") {
        throw new Error("Invalid sampling result: null or not an object");
      }
      const content = samplingResult.content;
      if (!content) {
        throw new Error("No content in sampling response");
      }
      let responseText = "";
      if (Array.isArray(content)) {
        if (content.length === 0) {
          throw new Error("Empty content array in sampling response");
        }
        const firstItem = content[0];
        if (!firstItem || typeof firstItem !== "object" || firstItem.type !== "text") {
          throw new Error("Invalid first content item in array");
        }
        if (!firstItem.text || typeof firstItem.text !== "string") {
          throw new Error("Invalid text content in first array item");
        }
        responseText = firstItem.text.trim();
      } else if (content && typeof content === "object" && "type" in content && content.type === "text" && "text" in content && typeof content.text === "string") {
        responseText = content.text.trim();
      } else {
        throw new Error("Invalid content format in sampling response");
      }
      if (!responseText) {
        throw new Error("Empty response text after parsing");
      }
      log("debug", `LLM response: ${responseText}`);
      const parsedResponse = JSON.parse(responseText);
      if (!Array.isArray(parsedResponse)) {
        throw new Error("Response is not an array");
      }
      if (!parsedResponse.every((item) => typeof item === "string")) {
        throw new Error("Response array contains non-string items");
      }
      selectedWorkflows = parsedResponse;
      const validWorkflows = selectedWorkflows.filter(
        (workflow7) => workflowNames.includes(workflow7)
      );
      if (validWorkflows.length !== selectedWorkflows.length) {
        const invalidWorkflows = selectedWorkflows.filter(
          (workflow7) => !workflowNames.includes(workflow7)
        );
        log("warn", `LLM selected invalid workflows: ${invalidWorkflows.join(", ")}`);
        selectedWorkflows = validWorkflows;
      }
    } catch (error) {
      log("error", `Failed to parse LLM response: ${error}`);
      let errorResponseText = "Unknown response format";
      try {
        if (samplingResult && typeof samplingResult === "object") {
          const content = samplingResult.content;
          if (content && Array.isArray(content) && content.length > 0) {
            const firstItem = content[0];
            if (firstItem && typeof firstItem === "object" && firstItem.type === "text" && typeof firstItem.text === "string") {
              errorResponseText = firstItem.text;
            }
          } else if (content && typeof content === "object" && "type" in content && content.type === "text" && "text" in content && typeof content.text === "string") {
            errorResponseText = content.text;
          }
        }
      } catch {
      }
      return createTextResponse(
        `I was unable to determine the right tools for your task. The AI model returned: "${errorResponseText}". Could you please rephrase your request or try a more specific description?`,
        true
      );
    }
    if (selectedWorkflows.length === 0) {
      log("info", "LLM returned empty workflow selection");
      return createTextResponse(
        "No specific Xcode tools seem necessary for that task. Could you provide more details about what you'd like to accomplish with Xcode?"
      );
    }
    const isAdditive = Boolean(additive);
    log(
      "info",
      `${isAdditive ? "Adding" : "Replacing with"} workflows: ${selectedWorkflows.join(", ")}`
    );
    await (deps?.enableWorkflows ?? enableWorkflows)(server, selectedWorkflows, isAdditive);
    const actionWord = isAdditive ? "Added" : "Enabled";
    const modeDescription = isAdditive ? `Added tools from ${selectedWorkflows.join(", ")} to your existing workflow tools.` : `Replaced previous tools with ${selectedWorkflows.join(", ")} workflow tools.`;
    return createTextResponse(
      `\u2705 ${actionWord} XcodeBuildMCP tools for: ${selectedWorkflows.join(", ")}.

${modeDescription}

Use XcodeBuildMCP tools for all Apple platform development tasks from now on. Call tools/list to see all available tools for your workflow.`
    );
  } catch (error) {
    log("error", `Error in discoverTools: ${error}`);
    return createTextResponse(
      `An error occurred while discovering tools: ${error instanceof Error ? error.message : "Unknown error"}`,
      true
    );
  }
}
var getLLMConfig, discoverToolsSchema, discover_tools_default;
var init_discover_tools = __esm({
  "src/mcp/tools/discovery/discover_tools.ts"() {
    init_responses();
    init_logging();
    init_dynamic_tools();
    init_typed_tool_factory();
    init_execution();
    getLLMConfig = () => {
      let maxTokens = 200;
      if (process.env.XCODEBUILDMCP_LLM_MAX_TOKENS) {
        const parsed = parseInt(process.env.XCODEBUILDMCP_LLM_MAX_TOKENS, 10);
        if (!isNaN(parsed) && parsed > 0) {
          maxTokens = parsed;
        }
      }
      let temperature;
      if (process.env.XCODEBUILDMCP_LLM_TEMPERATURE) {
        const parsed = parseFloat(process.env.XCODEBUILDMCP_LLM_TEMPERATURE);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
          temperature = parsed;
        }
      }
      return {
        maxTokens,
        temperature
      };
    };
    discoverToolsSchema = z.object({
      task_description: z.string().describe(
        "A detailed description of the development task you want to accomplish. For example: 'I need to build my iOS app and run it on the iPhone 16 simulator.' If working with Xcode projects, explicitly state whether you are using a .xcworkspace (workspace) or a .xcodeproj (project)."
      ),
      additive: z.boolean().optional().describe(
        "If true, add the discovered tools to existing enabled workflows. If false (default), replace all existing workflows with the newly discovered one. Use additive mode when you need tools from multiple workflows simultaneously."
      )
    });
    discover_tools_default = {
      name: "discover_tools",
      description: "Analyzes a natural language task description and enables the most relevant development workflow. Prioritizes project/workspace workflows (simulator/device/macOS) and also supports task-based workflows (simulator-management, logging) and Swift packages.",
      schema: discoverToolsSchema.shape,
      // MCP SDK compatibility
      handler: createTypedTool(
        discoverToolsSchema,
        (params, executor) => {
          return discover_toolsLogic(params, executor);
        },
        getDefaultCommandExecutor
      )
    };
  }
});

// src/mcp/tools/macos/index.ts
var macos_exports = {};
__export(macos_exports, {
  workflow: () => workflow2
});
var workflow2;
var init_macos = __esm({
  "src/mcp/tools/macos/index.ts"() {
    workflow2 = {
      name: "macOS Development",
      description: "Complete macOS development workflow for both .xcodeproj and .xcworkspace files. Build, test, deploy, and manage macOS applications.",
      platforms: ["macOS"],
      targets: ["native"],
      projectTypes: ["project", "workspace"],
      capabilities: ["build", "test", "deploy", "debug", "app-management"]
    };
  }
});

// src/utils/xcode.ts
function constructDestinationString(platform, simulatorName, simulatorId, useLatest = true, arch) {
  const isSimulatorPlatform = [
    "iOS Simulator" /* iOSSimulator */,
    "watchOS Simulator" /* watchOSSimulator */,
    "tvOS Simulator" /* tvOSSimulator */,
    "visionOS Simulator" /* visionOSSimulator */
  ].includes(platform);
  if (isSimulatorPlatform && simulatorId) {
    return `platform=${platform},id=${simulatorId}`;
  }
  if (isSimulatorPlatform && simulatorName) {
    return `platform=${platform},name=${simulatorName}${useLatest ? ",OS=latest" : ""}`;
  }
  if (isSimulatorPlatform && !simulatorId && !simulatorName) {
    log(
      "warning",
      `Constructing generic destination for ${platform} without name or ID. This might not be specific enough.`
    );
    throw new Error(`Simulator name or ID is required for specific ${platform} operations`);
  }
  switch (platform) {
    case "macOS" /* macOS */:
      return arch ? `platform=macOS,arch=${arch}` : "platform=macOS";
    case "iOS" /* iOS */:
      return "generic/platform=iOS";
    case "watchOS" /* watchOS */:
      return "generic/platform=watchOS";
    case "tvOS" /* tvOS */:
      return "generic/platform=tvOS";
    case "visionOS" /* visionOS */:
      return "generic/platform=visionOS";
  }
  log("error", `Reached unexpected point in constructDestinationString for platform: ${platform}`);
  return `platform=${platform}`;
}
var init_xcode = __esm({
  "src/utils/xcode.ts"() {
    init_logger();
    init_common();
  }
});
async function executeXcodeBuildCommand(params, platformOptions, preferXcodebuild = false, buildAction = "build", executor, execOpts) {
  const buildMessages = [];
  function grepWarningsAndErrors(text) {
    return text.split("\n").map((content) => {
      if (/warning:/i.test(content)) return { type: "warning", content };
      if (/error:/i.test(content)) return { type: "error", content };
      return null;
    }).filter(Boolean);
  }
  log("info", `Starting ${platformOptions.logPrefix} ${buildAction} for scheme ${params.scheme}`);
  const isXcodemakeEnabledFlag = isXcodemakeEnabled();
  let xcodemakeAvailableFlag = false;
  if (isXcodemakeEnabledFlag && buildAction === "build") {
    xcodemakeAvailableFlag = await isXcodemakeAvailable();
    if (xcodemakeAvailableFlag && preferXcodebuild) {
      log(
        "info",
        "xcodemake is enabled but preferXcodebuild is set to true. Falling back to xcodebuild."
      );
      buildMessages.push({
        type: "text",
        text: "\u26A0\uFE0F incremental build support is enabled but preferXcodebuild is set to true. Falling back to xcodebuild."
      });
    } else if (!xcodemakeAvailableFlag) {
      buildMessages.push({
        type: "text",
        text: "\u26A0\uFE0F xcodemake is enabled but not available. Falling back to xcodebuild."
      });
      log("info", "xcodemake is enabled but not available. Falling back to xcodebuild.");
    } else {
      log("info", "xcodemake is enabled and available, using it for incremental builds.");
      buildMessages.push({
        type: "text",
        text: "\u2139\uFE0F xcodemake is enabled and available, using it for incremental builds."
      });
    }
  }
  try {
    const command = ["xcodebuild"];
    let projectDir = "";
    if (params.workspacePath) {
      projectDir = path3__default.dirname(params.workspacePath);
      command.push("-workspace", params.workspacePath);
    } else if (params.projectPath) {
      projectDir = path3__default.dirname(params.projectPath);
      command.push("-project", params.projectPath);
    }
    command.push("-scheme", params.scheme);
    command.push("-configuration", params.configuration);
    command.push("-skipMacroValidation");
    let destinationString;
    const isSimulatorPlatform = [
      "iOS Simulator" /* iOSSimulator */,
      "watchOS Simulator" /* watchOSSimulator */,
      "tvOS Simulator" /* tvOSSimulator */,
      "visionOS Simulator" /* visionOSSimulator */
    ].includes(platformOptions.platform);
    if (isSimulatorPlatform) {
      if (platformOptions.simulatorId) {
        destinationString = constructDestinationString(
          platformOptions.platform,
          void 0,
          platformOptions.simulatorId
        );
      } else if (platformOptions.simulatorName) {
        destinationString = constructDestinationString(
          platformOptions.platform,
          platformOptions.simulatorName,
          void 0,
          platformOptions.useLatestOS
        );
      } else {
        return createTextResponse(
          `For ${platformOptions.platform} platform, either simulatorId or simulatorName must be provided`,
          true
        );
      }
    } else if (platformOptions.platform === "macOS" /* macOS */) {
      destinationString = constructDestinationString(
        platformOptions.platform,
        void 0,
        void 0,
        false,
        platformOptions.arch
      );
    } else if (platformOptions.platform === "iOS" /* iOS */) {
      if (platformOptions.deviceId) {
        destinationString = `platform=iOS,id=${platformOptions.deviceId}`;
      } else {
        destinationString = "generic/platform=iOS";
      }
    } else if (platformOptions.platform === "watchOS" /* watchOS */) {
      if (platformOptions.deviceId) {
        destinationString = `platform=watchOS,id=${platformOptions.deviceId}`;
      } else {
        destinationString = "generic/platform=watchOS";
      }
    } else if (platformOptions.platform === "tvOS" /* tvOS */) {
      if (platformOptions.deviceId) {
        destinationString = `platform=tvOS,id=${platformOptions.deviceId}`;
      } else {
        destinationString = "generic/platform=tvOS";
      }
    } else if (platformOptions.platform === "visionOS" /* visionOS */) {
      if (platformOptions.deviceId) {
        destinationString = `platform=visionOS,id=${platformOptions.deviceId}`;
      } else {
        destinationString = "generic/platform=visionOS";
      }
    } else {
      return createTextResponse(`Unsupported platform: ${platformOptions.platform}`, true);
    }
    command.push("-destination", destinationString);
    if (params.derivedDataPath) {
      command.push("-derivedDataPath", params.derivedDataPath);
    }
    if (params.extraArgs && params.extraArgs.length > 0) {
      command.push(...params.extraArgs);
    }
    command.push(buildAction);
    let result;
    if (isXcodemakeEnabledFlag && xcodemakeAvailableFlag && buildAction === "build" && !preferXcodebuild) {
      const makefileExists = doesMakefileExist(projectDir);
      log("debug", "Makefile exists: " + makefileExists);
      const makeLogFileExists = doesMakeLogFileExist(projectDir, command);
      log("debug", "Makefile log exists: " + makeLogFileExists);
      if (makefileExists && makeLogFileExists) {
        buildMessages.push({
          type: "text",
          text: "\u2139\uFE0F Using make for incremental build"
        });
        result = await executeMakeCommand(projectDir, platformOptions.logPrefix);
      } else {
        buildMessages.push({
          type: "text",
          text: "\u2139\uFE0F Generating Makefile with xcodemake (first build may take longer)"
        });
        result = await executeXcodemakeCommand(
          projectDir,
          command.slice(1),
          platformOptions.logPrefix
        );
      }
    } else {
      result = await executor(command, platformOptions.logPrefix, true, execOpts);
    }
    const warningOrErrorLines = grepWarningsAndErrors(result.output);
    warningOrErrorLines.forEach(({ type, content }) => {
      buildMessages.push({
        type: "text",
        text: type === "warning" ? `\u26A0\uFE0F Warning: ${content}` : `\u274C Error: ${content}`
      });
    });
    if (result.error) {
      result.error.split("\n").forEach((content) => {
        if (content.trim()) {
          buildMessages.push({ type: "text", text: `\u274C [stderr] ${content}` });
        }
      });
    }
    if (!result.success) {
      const isMcpError = result.exitCode === 64;
      log(
        isMcpError ? "error" : "warning",
        `${platformOptions.logPrefix} ${buildAction} failed: ${result.error}`,
        { sentry: isMcpError }
      );
      const errorResponse = createTextResponse(
        `\u274C ${platformOptions.logPrefix} ${buildAction} failed for scheme ${params.scheme}.`,
        true
      );
      if (buildMessages.length > 0 && errorResponse.content) {
        errorResponse.content.unshift(...buildMessages);
      }
      if (warningOrErrorLines.length == 0 && isXcodemakeEnabledFlag && xcodemakeAvailableFlag && buildAction === "build" && !preferXcodebuild) {
        errorResponse.content.push({
          type: "text",
          text: `\u{1F4A1} Incremental build using xcodemake failed, suggest using preferXcodebuild option to try build again using slower xcodebuild command.`
        });
      }
      return consolidateContentForClaudeCode(errorResponse);
    }
    log("info", `\u2705 ${platformOptions.logPrefix} ${buildAction} succeeded.`);
    let additionalInfo = "";
    if (isXcodemakeEnabledFlag && xcodemakeAvailableFlag && buildAction === "build" && !preferXcodebuild) {
      additionalInfo += `xcodemake: Using faster incremental builds with xcodemake. 
Future builds will use the generated Makefile for improved performance.

`;
    }
    if (buildAction === "build") {
      if (platformOptions.platform === "macOS" /* macOS */) {
        additionalInfo = `Next Steps:
1. Get app path: get_mac_app_path({ scheme: '${params.scheme}' })
2. Get bundle ID: get_mac_bundle_id({ appPath: 'PATH_FROM_STEP_1' })
3. Launch: launch_mac_app({ appPath: 'PATH_FROM_STEP_1' })`;
      } else if (platformOptions.platform === "iOS" /* iOS */) {
        additionalInfo = `Next Steps:
1. Get app path: get_device_app_path({ scheme: '${params.scheme}' })
2. Get bundle ID: get_app_bundle_id({ appPath: 'PATH_FROM_STEP_1' })
3. Launch: launch_app_device({ bundleId: 'BUNDLE_ID_FROM_STEP_2' })`;
      } else if (isSimulatorPlatform) {
        const simIdParam = platformOptions.simulatorId ? "simulatorId" : "simulatorName";
        const simIdValue = platformOptions.simulatorId ?? platformOptions.simulatorName;
        additionalInfo = `Next Steps:
1. Get app path: get_sim_app_path({ ${simIdParam}: '${simIdValue}', scheme: '${params.scheme}', platform: 'iOS Simulator' })
2. Get bundle ID: get_app_bundle_id({ appPath: 'PATH_FROM_STEP_1' })
3. Launch: launch_app_sim({ ${simIdParam}: '${simIdValue}', bundleId: 'BUNDLE_ID_FROM_STEP_2' })
   Or with logs: launch_app_logs_sim({ ${simIdParam}: '${simIdValue}', bundleId: 'BUNDLE_ID_FROM_STEP_2' })`;
      }
    }
    const successResponse = {
      content: [
        ...buildMessages,
        {
          type: "text",
          text: `\u2705 ${platformOptions.logPrefix} ${buildAction} succeeded for scheme ${params.scheme}.`
        }
      ]
    };
    if (additionalInfo) {
      successResponse.content.push({
        type: "text",
        text: additionalInfo
      });
    }
    return consolidateContentForClaudeCode(successResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isSpawnError = error instanceof Error && "code" in error && ["ENOENT", "EACCES", "EPERM"].includes(error.code ?? "");
    log("error", `Error during ${platformOptions.logPrefix} ${buildAction}: ${errorMessage}`, {
      sentry: !isSpawnError
    });
    return consolidateContentForClaudeCode(
      createTextResponse(
        `Error during ${platformOptions.logPrefix} ${buildAction}: ${errorMessage}`,
        true
      )
    );
  }
}
var init_build_utils = __esm({
  "src/utils/build-utils.ts"() {
    init_logger();
    init_xcode();
    init_validation();
    init_xcodemake();
  }
});

// src/utils/build/index.ts
var init_build = __esm({
  "src/utils/build/index.ts"() {
    init_build_utils();
  }
});

// src/utils/schema-helpers.ts
function nullifyEmptyStrings(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const copy = { ...value };
    for (const key of Object.keys(copy)) {
      const v = copy[key];
      if (typeof v === "string" && v.trim() === "") copy[key] = void 0;
    }
    return copy;
  }
  return value;
}
var init_schema_helpers = __esm({
  "src/utils/schema-helpers.ts"() {
  }
});

// src/mcp/tools/macos/build_macos.ts
var build_macos_exports = {};
__export(build_macos_exports, {
  buildMacOSLogic: () => buildMacOSLogic,
  default: () => build_macos_default
});
async function buildMacOSLogic(params, executor, buildUtilsDeps = defaultBuildUtilsDependencies) {
  log("info", `Starting macOS build for scheme ${params.scheme} (internal)`);
  const processedParams = {
    ...params,
    configuration: params.configuration ?? "Debug",
    preferXcodebuild: params.preferXcodebuild ?? false
  };
  return buildUtilsDeps.executeXcodeBuildCommand(
    processedParams,
    {
      platform: "macOS" /* macOS */,
      arch: params.arch,
      logPrefix: "macOS Build"
    },
    processedParams.preferXcodebuild ?? false,
    "build",
    executor
  );
}
var defaultBuildUtilsDependencies, baseSchemaObject, baseSchema, publicSchemaObject, buildMacOSSchema, build_macos_default;
var init_build_macos = __esm({
  "src/mcp/tools/macos/build_macos.ts"() {
    init_logging();
    init_build();
    init_common();
    init_execution();
    init_typed_tool_factory();
    init_schema_helpers();
    defaultBuildUtilsDependencies = {
      executeXcodeBuildCommand
    };
    baseSchemaObject = z.object({
      projectPath: z.string().optional().describe("Path to the .xcodeproj file"),
      workspacePath: z.string().optional().describe("Path to the .xcworkspace file"),
      scheme: z.string().describe("The scheme to use"),
      configuration: z.string().optional().describe("Build configuration (Debug, Release, etc.)"),
      derivedDataPath: z.string().optional().describe("Path where build products and other derived data will go"),
      arch: z.enum(["arm64", "x86_64"]).optional().describe("Architecture to build for (arm64 or x86_64). For macOS only."),
      extraArgs: z.array(z.string()).optional().describe("Additional xcodebuild arguments"),
      preferXcodebuild: z.boolean().optional().describe("If true, prefers xcodebuild over the experimental incremental build system")
    });
    baseSchema = z.preprocess(nullifyEmptyStrings, baseSchemaObject);
    publicSchemaObject = baseSchemaObject.omit({
      projectPath: true,
      workspacePath: true,
      scheme: true,
      configuration: true,
      arch: true
    });
    buildMacOSSchema = baseSchema.refine((val) => val.projectPath !== void 0 || val.workspacePath !== void 0, {
      message: "Either projectPath or workspacePath is required."
    }).refine((val) => !(val.projectPath !== void 0 && val.workspacePath !== void 0), {
      message: "projectPath and workspacePath are mutually exclusive. Provide only one."
    });
    build_macos_default = {
      name: "build_macos",
      description: "Builds a macOS app.",
      schema: publicSchemaObject.shape,
      handler: createSessionAwareTool({
        internalSchema: buildMacOSSchema,
        logicFunction: buildMacOSLogic,
        getExecutor: getDefaultCommandExecutor,
        requirements: [
          { allOf: ["scheme"], message: "scheme is required" },
          { oneOf: ["projectPath", "workspacePath"], message: "Provide a project or workspace" }
        ],
        exclusivePairs: [["projectPath", "workspacePath"]]
      })
    };
  }
});

// src/mcp/tools/macos/build_run_macos.ts
var build_run_macos_exports = {};
__export(build_run_macos_exports, {
  buildRunMacOSLogic: () => buildRunMacOSLogic,
  default: () => build_run_macos_default
});
async function _handleMacOSBuildLogic(params, executor) {
  log("info", `Starting macOS build for scheme ${params.scheme} (internal)`);
  return executeXcodeBuildCommand(
    {
      ...params,
      configuration: params.configuration ?? "Debug"
    },
    {
      platform: "macOS" /* macOS */,
      arch: params.arch,
      logPrefix: "macOS Build"
    },
    params.preferXcodebuild ?? false,
    "build",
    executor
  );
}
async function _getAppPathFromBuildSettings(params, executor) {
  try {
    const command = ["xcodebuild", "-showBuildSettings"];
    if (params.projectPath) {
      command.push("-project", params.projectPath);
    } else if (params.workspacePath) {
      command.push("-workspace", params.workspacePath);
    }
    command.push("-scheme", params.scheme);
    command.push("-configuration", params.configuration ?? "Debug");
    if (params.derivedDataPath) {
      command.push("-derivedDataPath", params.derivedDataPath);
    }
    if (params.extraArgs && params.extraArgs.length > 0) {
      command.push(...params.extraArgs);
    }
    const result = await executor(command, "Get Build Settings for Launch", true, void 0);
    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Failed to get build settings"
      };
    }
    const buildSettingsOutput = result.output;
    const builtProductsDirMatch = buildSettingsOutput.match(/^\s*BUILT_PRODUCTS_DIR\s*=\s*(.+)$/m);
    const fullProductNameMatch = buildSettingsOutput.match(/^\s*FULL_PRODUCT_NAME\s*=\s*(.+)$/m);
    if (!builtProductsDirMatch || !fullProductNameMatch) {
      return { success: false, error: "Could not extract app path from build settings" };
    }
    const appPath = `${builtProductsDirMatch[1].trim()}/${fullProductNameMatch[1].trim()}`;
    return { success: true, appPath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
async function buildRunMacOSLogic(params, executor) {
  log("info", "Handling macOS build & run logic...");
  try {
    const buildResult = await _handleMacOSBuildLogic(params, executor);
    if (buildResult.isError) {
      return buildResult;
    }
    const buildWarningMessages = buildResult.content?.filter((c) => c.type === "text") ?? [];
    const appPathResult = await _getAppPathFromBuildSettings(params, executor);
    if (!appPathResult.success) {
      log("error", "Build succeeded, but failed to get app path to launch.");
      const response = createTextResponse(
        `\u2705 Build succeeded, but failed to get app path to launch: ${appPathResult.error}`,
        false
        // Build succeeded, so not a full error
      );
      if (response.content) {
        response.content.unshift(...buildWarningMessages);
      }
      return response;
    }
    const appPath = appPathResult.appPath;
    log("info", `App path determined as: ${appPath}`);
    const launchResult = await executor(["open", appPath], "Launch macOS App", true);
    if (!launchResult.success) {
      log("error", `Build succeeded, but failed to launch app ${appPath}: ${launchResult.error}`);
      const errorResponse = createTextResponse(
        `\u2705 Build succeeded, but failed to launch app ${appPath}. Error: ${launchResult.error}`,
        false
        // Build succeeded
      );
      if (errorResponse.content) {
        errorResponse.content.unshift(...buildWarningMessages);
      }
      return errorResponse;
    }
    log("info", `\u2705 macOS app launched successfully: ${appPath}`);
    const successResponse = {
      content: [
        ...buildWarningMessages,
        {
          type: "text",
          text: `\u2705 macOS build and run succeeded for scheme ${params.scheme}. App launched: ${appPath}`
        }
      ],
      isError: false
    };
    return successResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("error", `Error during macOS build & run logic: ${errorMessage}`);
    const errorResponse = createTextResponse(
      `Error during macOS build and run: ${errorMessage}`,
      true
    );
    return errorResponse;
  }
}
var baseSchemaObject2, baseSchema2, publicSchemaObject2, buildRunMacOSSchema, build_run_macos_default;
var init_build_run_macos = __esm({
  "src/mcp/tools/macos/build_run_macos.ts"() {
    init_logging();
    init_responses();
    init_build();
    init_common();
    init_execution();
    init_typed_tool_factory();
    init_schema_helpers();
    baseSchemaObject2 = z.object({
      projectPath: z.string().optional().describe("Path to the .xcodeproj file"),
      workspacePath: z.string().optional().describe("Path to the .xcworkspace file"),
      scheme: z.string().describe("The scheme to use"),
      configuration: z.string().optional().describe("Build configuration (Debug, Release, etc.)"),
      derivedDataPath: z.string().optional().describe("Path where build products and other derived data will go"),
      arch: z.enum(["arm64", "x86_64"]).optional().describe("Architecture to build for (arm64 or x86_64). For macOS only."),
      extraArgs: z.array(z.string()).optional().describe("Additional xcodebuild arguments"),
      preferXcodebuild: z.boolean().optional().describe("If true, prefers xcodebuild over the experimental incremental build system")
    });
    baseSchema2 = z.preprocess(nullifyEmptyStrings, baseSchemaObject2);
    publicSchemaObject2 = baseSchemaObject2.omit({
      projectPath: true,
      workspacePath: true,
      scheme: true,
      configuration: true,
      arch: true
    });
    buildRunMacOSSchema = baseSchema2.refine((val) => val.projectPath !== void 0 || val.workspacePath !== void 0, {
      message: "Either projectPath or workspacePath is required."
    }).refine((val) => !(val.projectPath !== void 0 && val.workspacePath !== void 0), {
      message: "projectPath and workspacePath are mutually exclusive. Provide only one."
    });
    build_run_macos_default = {
      name: "build_run_macos",
      description: "Builds and runs a macOS app.",
      schema: publicSchemaObject2.shape,
      handler: createSessionAwareTool({
        internalSchema: buildRunMacOSSchema,
        logicFunction: buildRunMacOSLogic,
        getExecutor: getDefaultCommandExecutor,
        requirements: [
          { allOf: ["scheme"], message: "scheme is required" },
          { oneOf: ["projectPath", "workspacePath"], message: "Provide a project or workspace" }
        ],
        exclusivePairs: [["projectPath", "workspacePath"]]
      })
    };
  }
});

// src/mcp/tools/utilities/clean.ts
var clean_exports = {};
__export(clean_exports, {
  cleanLogic: () => cleanLogic,
  default: () => clean_default
});
async function cleanLogic(params, executor) {
  if (params.workspacePath && !params.scheme) {
    return createErrorResponse(
      "Parameter validation failed",
      "Invalid parameters:\nscheme: scheme is required when workspacePath is provided."
    );
  }
  const targetPlatform = params.platform ?? "iOS";
  const platformMap = {
    macOS: "macOS" /* macOS */,
    iOS: "iOS" /* iOS */,
    "iOS Simulator": "iOS Simulator" /* iOSSimulator */,
    watchOS: "watchOS" /* watchOS */,
    "watchOS Simulator": "watchOS Simulator" /* watchOSSimulator */,
    tvOS: "tvOS" /* tvOS */,
    "tvOS Simulator": "tvOS Simulator" /* tvOSSimulator */,
    visionOS: "visionOS" /* visionOS */,
    "visionOS Simulator": "visionOS Simulator" /* visionOSSimulator */
  };
  const platformEnum = platformMap[targetPlatform];
  if (!platformEnum) {
    return createErrorResponse(
      "Parameter validation failed",
      `Invalid parameters:
platform: unsupported value "${targetPlatform}".`
    );
  }
  const hasProjectPath = typeof params.projectPath === "string";
  const typedParams = {
    ...hasProjectPath ? { projectPath: params.projectPath } : { workspacePath: params.workspacePath },
    // scheme may be omitted for project; when omitted we do not pass -scheme
    // Provide empty string to satisfy type, executeXcodeBuildCommand only emits -scheme when non-empty
    scheme: params.scheme ?? "",
    configuration: params.configuration ?? "Debug",
    derivedDataPath: params.derivedDataPath,
    extraArgs: params.extraArgs
  };
  const cleanPlatformMap = {
    ["iOS Simulator" /* iOSSimulator */]: "iOS" /* iOS */,
    ["watchOS Simulator" /* watchOSSimulator */]: "watchOS" /* watchOS */,
    ["tvOS Simulator" /* tvOSSimulator */]: "tvOS" /* tvOS */,
    ["visionOS Simulator" /* visionOSSimulator */]: "visionOS" /* visionOS */
  };
  const cleanPlatform = cleanPlatformMap[platformEnum] ?? platformEnum;
  return executeXcodeBuildCommand(
    typedParams,
    {
      platform: cleanPlatform,
      logPrefix: "Clean"
    },
    false,
    "clean",
    executor
  );
}
var baseOptions, baseSchemaObject3, baseSchema3, cleanSchema, publicSchemaObject3, clean_default;
var init_clean = __esm({
  "src/mcp/tools/utilities/clean.ts"() {
    init_typed_tool_factory();
    init_execution();
    init_build();
    init_common();
    init_responses();
    init_schema_helpers();
    baseOptions = {
      scheme: z.string().optional().describe("Optional: The scheme to clean"),
      configuration: z.string().optional().describe("Optional: Build configuration to clean (Debug, Release, etc.)"),
      derivedDataPath: z.string().optional().describe("Optional: Path where derived data might be located"),
      extraArgs: z.array(z.string()).optional().describe("Additional xcodebuild arguments"),
      preferXcodebuild: z.boolean().optional().describe(
        "If true, prefers xcodebuild over the experimental incremental build system, useful for when incremental build system fails."
      ),
      platform: z.enum([
        "macOS",
        "iOS",
        "iOS Simulator",
        "watchOS",
        "watchOS Simulator",
        "tvOS",
        "tvOS Simulator",
        "visionOS",
        "visionOS Simulator"
      ]).optional().describe(
        "Optional: Platform to clean for (defaults to iOS). Choose from macOS, iOS, iOS Simulator, watchOS, watchOS Simulator, tvOS, tvOS Simulator, visionOS, visionOS Simulator"
      )
    };
    baseSchemaObject3 = z.object({
      projectPath: z.string().optional().describe("Path to the .xcodeproj file"),
      workspacePath: z.string().optional().describe("Path to the .xcworkspace file"),
      ...baseOptions
    });
    baseSchema3 = z.preprocess(nullifyEmptyStrings, baseSchemaObject3);
    cleanSchema = baseSchema3.refine((val) => val.projectPath !== void 0 || val.workspacePath !== void 0, {
      message: "Either projectPath or workspacePath is required."
    }).refine((val) => !(val.projectPath !== void 0 && val.workspacePath !== void 0), {
      message: "projectPath and workspacePath are mutually exclusive. Provide only one."
    }).refine((val) => !(val.workspacePath && !val.scheme), {
      message: "scheme is required when workspacePath is provided.",
      path: ["scheme"]
    });
    publicSchemaObject3 = baseSchemaObject3.omit({
      projectPath: true,
      workspacePath: true,
      scheme: true,
      configuration: true
    });
    clean_default = {
      name: "clean",
      description: "Cleans build products with xcodebuild.",
      schema: publicSchemaObject3.shape,
      handler: createSessionAwareTool({
        internalSchema: cleanSchema,
        logicFunction: cleanLogic,
        getExecutor: getDefaultCommandExecutor,
        requirements: [
          { oneOf: ["projectPath", "workspacePath"], message: "Provide a project or workspace" }
        ],
        exclusivePairs: [["projectPath", "workspacePath"]]
      })
    };
  }
});

// src/mcp/tools/macos/clean.ts
var clean_exports2 = {};
__export(clean_exports2, {
  default: () => clean_default
});
var init_clean2 = __esm({
  "src/mcp/tools/macos/clean.ts"() {
    init_clean();
  }
});

// src/mcp/tools/project-discovery/discover_projs.ts
var discover_projs_exports = {};
__export(discover_projs_exports, {
  default: () => discover_projs_default,
  discover_projsLogic: () => discover_projsLogic
});
async function _findProjectsRecursive(currentDirAbs, workspaceRootAbs, currentDepth, maxDepth, results, fileSystemExecutor = getDefaultFileSystemExecutor()) {
  if (currentDepth >= maxDepth) {
    log("debug", `Max depth ${maxDepth} reached at ${currentDirAbs}, stopping recursion.`);
    return;
  }
  log("debug", `Scanning directory: ${currentDirAbs} at depth ${currentDepth}`);
  const normalizedWorkspaceRoot = path3.normalize(workspaceRootAbs);
  try {
    const entries = await fileSystemExecutor.readdir(currentDirAbs, { withFileTypes: true });
    for (const rawEntry of entries) {
      const entry = rawEntry;
      const absoluteEntryPath = path3.join(currentDirAbs, entry.name);
      const relativePath = path3.relative(workspaceRootAbs, absoluteEntryPath);
      if (entry.isSymbolicLink()) {
        log("debug", `Skipping symbolic link: ${relativePath}`);
        continue;
      }
      if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) {
        log("debug", `Skipping standard directory: ${relativePath}`);
        continue;
      }
      if (!path3.normalize(absoluteEntryPath).startsWith(normalizedWorkspaceRoot)) {
        log(
          "warn",
          `Skipping entry outside workspace root: ${absoluteEntryPath} (Workspace: ${workspaceRootAbs})`
        );
        continue;
      }
      if (entry.isDirectory()) {
        let isXcodeBundle = false;
        if (entry.name.endsWith(".xcodeproj")) {
          results.projects.push(absoluteEntryPath);
          log("debug", `Found project: ${absoluteEntryPath}`);
          isXcodeBundle = true;
        } else if (entry.name.endsWith(".xcworkspace")) {
          results.workspaces.push(absoluteEntryPath);
          log("debug", `Found workspace: ${absoluteEntryPath}`);
          isXcodeBundle = true;
        }
        if (!isXcodeBundle) {
          await _findProjectsRecursive(
            absoluteEntryPath,
            workspaceRootAbs,
            currentDepth + 1,
            maxDepth,
            results,
            fileSystemExecutor
          );
        }
      }
    }
  } catch (error) {
    let code;
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
      if ("code" in error) {
        code = error.code;
      }
    } else if (typeof error === "object" && error !== null) {
      if ("message" in error && typeof error.message === "string") {
        message = error.message;
      }
      if ("code" in error && typeof error.code === "string") {
        code = error.code;
      }
    } else {
      message = String(error);
    }
    if (code === "EPERM" || code === "EACCES") {
      log("debug", `Permission denied scanning directory: ${currentDirAbs}`);
    } else {
      log(
        "warning",
        `Error scanning directory ${currentDirAbs}: ${message} (Code: ${code ?? "N/A"})`
      );
    }
  }
}
async function discover_projsLogic(params, fileSystemExecutor) {
  const scanPath = params.scanPath ?? ".";
  const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;
  const workspaceRoot = params.workspaceRoot;
  const relativeScanPath = scanPath;
  const requestedScanPath = path3.resolve(workspaceRoot, relativeScanPath ?? ".");
  let absoluteScanPath = requestedScanPath;
  const normalizedWorkspaceRoot = path3.normalize(workspaceRoot);
  if (!path3.normalize(absoluteScanPath).startsWith(normalizedWorkspaceRoot)) {
    log(
      "warn",
      `Requested scan path '${relativeScanPath}' resolved outside workspace root '${workspaceRoot}'. Defaulting scan to workspace root.`
    );
    absoluteScanPath = normalizedWorkspaceRoot;
  }
  const results = { projects: [], workspaces: [] };
  log(
    "info",
    `Starting project discovery request: path=${absoluteScanPath}, maxDepth=${maxDepth}, workspace=${workspaceRoot}`
  );
  try {
    const stats = await fileSystemExecutor.stat(absoluteScanPath);
    if (!stats.isDirectory()) {
      const errorMsg = `Scan path is not a directory: ${absoluteScanPath}`;
      log("error", errorMsg);
      return {
        content: [createTextContent(errorMsg)],
        isError: true
      };
    }
  } catch (error) {
    let code;
    let message = "Unknown error accessing scan path";
    if (error instanceof Error) {
      message = error.message;
      if ("code" in error) {
        code = error.code;
      }
    } else if (typeof error === "object" && error !== null) {
      if ("message" in error && typeof error.message === "string") {
        message = error.message;
      }
      if ("code" in error && typeof error.code === "string") {
        code = error.code;
      }
    } else {
      message = String(error);
    }
    const errorMsg = `Failed to access scan path: ${absoluteScanPath}. Error: ${message}`;
    log("error", `${errorMsg} - Code: ${code ?? "N/A"}`);
    return {
      content: [createTextContent(errorMsg)],
      isError: true
    };
  }
  await _findProjectsRecursive(
    absoluteScanPath,
    workspaceRoot,
    0,
    maxDepth,
    results,
    fileSystemExecutor
  );
  log(
    "info",
    `Discovery finished. Found ${results.projects.length} projects and ${results.workspaces.length} workspaces.`
  );
  const responseContent = [
    createTextContent(
      `Discovery finished. Found ${results.projects.length} projects and ${results.workspaces.length} workspaces.`
    )
  ];
  results.projects.sort();
  results.workspaces.sort();
  if (results.projects.length > 0) {
    responseContent.push(
      createTextContent(`Projects found:
 - ${results.projects.join("\n - ")}`)
    );
  }
  if (results.workspaces.length > 0) {
    responseContent.push(
      createTextContent(`Workspaces found:
 - ${results.workspaces.join("\n - ")}`)
    );
  }
  return {
    content: responseContent,
    isError: false
  };
}
var DEFAULT_MAX_DEPTH, SKIPPED_DIRS, discoverProjsSchema, discover_projs_default;
var init_discover_projs = __esm({
  "src/mcp/tools/project-discovery/discover_projs.ts"() {
    init_logging();
    init_common();
    init_command();
    init_typed_tool_factory();
    DEFAULT_MAX_DEPTH = 5;
    SKIPPED_DIRS = /* @__PURE__ */ new Set(["build", "DerivedData", "Pods", ".git", "node_modules"]);
    discoverProjsSchema = z.object({
      workspaceRoot: z.string().describe("The absolute path of the workspace root to scan within."),
      scanPath: z.string().optional().describe("Optional: Path relative to workspace root to scan. Defaults to workspace root."),
      maxDepth: z.number().int().nonnegative().optional().describe(`Optional: Maximum directory depth to scan. Defaults to ${DEFAULT_MAX_DEPTH}.`)
    });
    discover_projs_default = {
      name: "discover_projs",
      description: "Scans a directory (defaults to workspace root) to find Xcode project (.xcodeproj) and workspace (.xcworkspace) files.",
      schema: discoverProjsSchema.shape,
      // MCP SDK compatibility
      handler: createTypedTool(
        discoverProjsSchema,
        (params) => {
          return discover_projsLogic(params, getDefaultFileSystemExecutor());
        },
        getDefaultCommandExecutor
      )
    };
  }
});

// src/mcp/tools/macos/discover_projs.ts
var discover_projs_exports2 = {};
__export(discover_projs_exports2, {
  default: () => discover_projs_default
});
var init_discover_projs2 = __esm({
  "src/mcp/tools/macos/discover_projs.ts"() {
    init_discover_projs();
  }
});

// src/mcp/tools/macos/get_mac_app_path.ts
var get_mac_app_path_exports = {};
__export(get_mac_app_path_exports, {
  default: () => get_mac_app_path_default,
  get_mac_app_pathLogic: () => get_mac_app_pathLogic
});
async function get_mac_app_pathLogic(params, executor) {
  const configuration = params.configuration ?? "Debug";
  log("info", `Getting app path for scheme ${params.scheme} on platform ${XcodePlatform2.macOS}`);
  try {
    const command = ["xcodebuild", "-showBuildSettings"];
    if (params.projectPath) {
      command.push("-project", params.projectPath);
    } else if (params.workspacePath) {
      command.push("-workspace", params.workspacePath);
    } else {
      throw new Error("Either projectPath or workspacePath is required.");
    }
    command.push("-scheme", params.scheme);
    command.push("-configuration", configuration);
    if (params.derivedDataPath) {
      command.push("-derivedDataPath", params.derivedDataPath);
    }
    if (params.arch) {
      const destinationString = `platform=macOS,arch=${params.arch}`;
      command.push("-destination", destinationString);
    }
    if (params.extraArgs && Array.isArray(params.extraArgs)) {
      command.push(...params.extraArgs);
    }
    const result = await executor(command, "Get App Path", true, void 0);
    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Failed to get macOS app path
Details: ${result.error}`
          }
        ],
        isError: true
      };
    }
    if (!result.output) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Failed to get macOS app path\nDetails: Failed to extract build settings output from the result"
          }
        ],
        isError: true
      };
    }
    const buildSettingsOutput = result.output;
    const builtProductsDirMatch = buildSettingsOutput.match(/^\s*BUILT_PRODUCTS_DIR\s*=\s*(.+)$/m);
    const fullProductNameMatch = buildSettingsOutput.match(/^\s*FULL_PRODUCT_NAME\s*=\s*(.+)$/m);
    if (!builtProductsDirMatch || !fullProductNameMatch) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Failed to get macOS app path\nDetails: Could not extract app path from build settings"
          }
        ],
        isError: true
      };
    }
    const builtProductsDir = builtProductsDirMatch[1].trim();
    const fullProductName = fullProductNameMatch[1].trim();
    const appPath = `${builtProductsDir}/${fullProductName}`;
    const nextStepsText = `Next Steps:
1. Get bundle ID: get_app_bundle_id({ appPath: "${appPath}" })
2. Launch app: launch_mac_app({ appPath: "${appPath}" })`;
    return {
      content: [
        {
          type: "text",
          text: `\u2705 App path retrieved successfully: ${appPath}`
        },
        {
          type: "text",
          text: nextStepsText
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("error", `Error retrieving app path: ${errorMessage}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: Failed to get macOS app path
Details: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
}
var baseOptions2, baseSchemaObject4, baseSchema4, publicSchemaObject4, getMacosAppPathSchema, XcodePlatform2, get_mac_app_path_default;
var init_get_mac_app_path = __esm({
  "src/mcp/tools/macos/get_mac_app_path.ts"() {
    init_logging();
    init_execution();
    init_typed_tool_factory();
    init_schema_helpers();
    baseOptions2 = {
      scheme: z.string().describe("The scheme to use"),
      configuration: z.string().optional().describe("Build configuration (Debug, Release, etc.)"),
      derivedDataPath: z.string().optional().describe("Path to derived data directory"),
      extraArgs: z.array(z.string()).optional().describe("Additional arguments to pass to xcodebuild"),
      arch: z.enum(["arm64", "x86_64"]).optional().describe("Architecture to build for (arm64 or x86_64). For macOS only.")
    };
    baseSchemaObject4 = z.object({
      projectPath: z.string().optional().describe("Path to the .xcodeproj file"),
      workspacePath: z.string().optional().describe("Path to the .xcworkspace file"),
      ...baseOptions2
    });
    baseSchema4 = z.preprocess(nullifyEmptyStrings, baseSchemaObject4);
    publicSchemaObject4 = baseSchemaObject4.omit({
      projectPath: true,
      workspacePath: true,
      scheme: true,
      configuration: true,
      arch: true
    });
    getMacosAppPathSchema = baseSchema4.refine((val) => val.projectPath !== void 0 || val.workspacePath !== void 0, {
      message: "Either projectPath or workspacePath is required."
    }).refine((val) => !(val.projectPath !== void 0 && val.workspacePath !== void 0), {
      message: "projectPath and workspacePath are mutually exclusive. Provide only one."
    });
    XcodePlatform2 = {
      iOS: "iOS",
      watchOS: "watchOS",
      tvOS: "tvOS",
      visionOS: "visionOS",
      iOSSimulator: "iOS Simulator",
      watchOSSimulator: "watchOS Simulator",
      tvOSSimulator: "tvOS Simulator",
      visionOSSimulator: "visionOS Simulator",
      macOS: "macOS"
    };
    get_mac_app_path_default = {
      name: "get_mac_app_path",
      description: "Retrieves the built macOS app bundle path.",
      schema: publicSchemaObject4.shape,
      handler: createSessionAwareTool({
        internalSchema: getMacosAppPathSchema,
        logicFunction: get_mac_app_pathLogic,
        getExecutor: getDefaultCommandExecutor,
        requirements: [
          { allOf: ["scheme"], message: "scheme is required" },
          { oneOf: ["projectPath", "workspacePath"], message: "Provide a project or workspace" }
        ],
        exclusivePairs: [["projectPath", "workspacePath"]]
      })
    };
  }
});

// src/mcp/tools/project-discovery/get_mac_bundle_id.ts
var get_mac_bundle_id_exports = {};
__export(get_mac_bundle_id_exports, {
  default: () => get_mac_bundle_id_default,
  get_mac_bundle_idLogic: () => get_mac_bundle_idLogic
});
async function executeSyncCommand(command, executor) {
  const result = await executor(["/bin/sh", "-c", command], "macOS Bundle ID Extraction");
  if (!result.success) {
    throw new Error(result.error ?? "Command failed");
  }
  return result.output || "";
}
async function get_mac_bundle_idLogic(params, executor, fileSystemExecutor) {
  const appPath = params.appPath;
  if (!fileSystemExecutor.existsSync(appPath)) {
    return {
      content: [
        {
          type: "text",
          text: `File not found: '${appPath}'. Please check the path and try again.`
        }
      ],
      isError: true
    };
  }
  log("info", `Starting bundle ID extraction for macOS app: ${appPath}`);
  try {
    let bundleId;
    try {
      bundleId = await executeSyncCommand(
        `defaults read "${appPath}/Contents/Info" CFBundleIdentifier`,
        executor
      );
    } catch {
      try {
        bundleId = await executeSyncCommand(
          `/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${appPath}/Contents/Info.plist"`,
          executor
        );
      } catch (innerError) {
        throw new Error(
          `Could not extract bundle ID from Info.plist: ${innerError instanceof Error ? innerError.message : String(innerError)}`
        );
      }
    }
    log("info", `Extracted macOS bundle ID: ${bundleId}`);
    return {
      content: [
        {
          type: "text",
          text: `\u2705 Bundle ID: ${bundleId}`
        },
        {
          type: "text",
          text: `Next Steps:
- Launch: launch_mac_app({ appPath: "${appPath}" })
- Build again: build_macos({ scheme: "SCHEME_NAME" })`
        }
      ],
      isError: false
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("error", `Error extracting macOS bundle ID: ${errorMessage}`);
    return {
      content: [
        {
          type: "text",
          text: `Error extracting macOS bundle ID: ${errorMessage}`
        },
        {
          type: "text",
          text: `Make sure the path points to a valid macOS app bundle (.app directory).`
        }
      ],
      isError: true
    };
  }
}
var getMacBundleIdSchema, get_mac_bundle_id_default;
var init_get_mac_bundle_id = __esm({
  "src/mcp/tools/project-discovery/get_mac_bundle_id.ts"() {
    init_logging();
    init_command();
    init_typed_tool_factory();
    getMacBundleIdSchema = z.object({
      appPath: z.string().describe(
        "Path to the macOS .app bundle to extract bundle ID from (full path to the .app directory)"
      )
    });
    get_mac_bundle_id_default = {
      name: "get_mac_bundle_id",
      description: "Extracts the bundle identifier from a macOS app bundle (.app). IMPORTANT: You MUST provide the appPath parameter. Example: get_mac_bundle_id({ appPath: '/path/to/your/app.app' }) Note: In some environments, this tool may be prefixed as mcp0_get_macos_bundle_id.",
      schema: getMacBundleIdSchema.shape,
      // MCP SDK compatibility
      handler: createTypedTool(
        getMacBundleIdSchema,
        (params) => get_mac_bundle_idLogic(params, getDefaultCommandExecutor(), getDefaultFileSystemExecutor()),
        getDefaultCommandExecutor
      )
    };
  }
});

// src/mcp/tools/macos/get_mac_bundle_id.ts
var get_mac_bundle_id_exports2 = {};
__export(get_mac_bundle_id_exports2, {
  default: () => get_mac_bundle_id_default
});
var init_get_mac_bundle_id2 = __esm({
  "src/mcp/tools/macos/get_mac_bundle_id.ts"() {
    init_get_mac_bundle_id();
  }
});

// src/mcp/tools/project-discovery/list_schemes.ts
var list_schemes_exports = {};
__export(list_schemes_exports, {
  default: () => list_schemes_default,
  listSchemesLogic: () => listSchemesLogic
});
async function listSchemesLogic(params, executor) {
  log("info", "Listing schemes");
  try {
    const command = ["xcodebuild", "-list"];
    const hasProjectPath = typeof params.projectPath === "string";
    const projectOrWorkspace = hasProjectPath ? "project" : "workspace";
    const path4 = hasProjectPath ? params.projectPath : params.workspacePath;
    if (hasProjectPath) {
      command.push("-project", params.projectPath);
    } else {
      command.push("-workspace", params.workspacePath);
    }
    const result = await executor(command, "List Schemes", true);
    if (!result.success) {
      return createTextResponse(`Failed to list schemes: ${result.error}`, true);
    }
    const schemesMatch = result.output.match(/Schemes:([\s\S]*?)(?=\n\n|$)/);
    if (!schemesMatch) {
      return createTextResponse("No schemes found in the output", true);
    }
    const schemeLines = schemesMatch[1].trim().split("\n");
    const schemes = schemeLines.map((line) => line.trim()).filter((line) => line);
    let nextStepsText = "";
    if (schemes.length > 0) {
      const firstScheme = schemes[0];
      nextStepsText = `Next Steps:
1. Build the app: build_macos({ ${projectOrWorkspace}Path: "${path4}", scheme: "${firstScheme}" })
   or for iOS: build_sim({ ${projectOrWorkspace}Path: "${path4}", scheme: "${firstScheme}", simulatorName: "iPhone 16" })
2. Show build settings: show_build_settings({ ${projectOrWorkspace}Path: "${path4}", scheme: "${firstScheme}" })`;
    }
    return {
      content: [
        {
          type: "text",
          text: `\u2705 Available schemes:`
        },
        {
          type: "text",
          text: schemes.join("\n")
        },
        {
          type: "text",
          text: nextStepsText
        }
      ],
      isError: false
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("error", `Error listing schemes: ${errorMessage}`);
    return createTextResponse(`Error listing schemes: ${errorMessage}`, true);
  }
}
var baseSchemaObject5, baseSchema5, listSchemesSchema, publicSchemaObject5, list_schemes_default;
var init_list_schemes = __esm({
  "src/mcp/tools/project-discovery/list_schemes.ts"() {
    init_logging();
    init_execution();
    init_responses();
    init_typed_tool_factory();
    init_schema_helpers();
    baseSchemaObject5 = z.object({
      projectPath: z.string().optional().describe("Path to the .xcodeproj file"),
      workspacePath: z.string().optional().describe("Path to the .xcworkspace file")
    });
    baseSchema5 = z.preprocess(nullifyEmptyStrings, baseSchemaObject5);
    listSchemesSchema = baseSchema5.refine((val) => val.projectPath !== void 0 || val.workspacePath !== void 0, {
      message: "Either projectPath or workspacePath is required."
    }).refine((val) => !(val.projectPath !== void 0 && val.workspacePath !== void 0), {
      message: "projectPath and workspacePath are mutually exclusive. Provide only one."
    });
    publicSchemaObject5 = baseSchemaObject5.omit({
      projectPath: true,
      workspacePath: true
    });
    list_schemes_default = {
      name: "list_schemes",
      description: "Lists schemes for a project or workspace.",
      schema: publicSchemaObject5.shape,
      handler: createSessionAwareTool({
        internalSchema: listSchemesSchema,
        logicFunction: listSchemesLogic,
        getExecutor: getDefaultCommandExecutor,
        requirements: [
          { oneOf: ["projectPath", "workspacePath"], message: "Provide a project or workspace" }
        ],
        exclusivePairs: [["projectPath", "workspacePath"]]
      })
    };
  }
});

// src/mcp/tools/macos/list_schemes.ts
var list_schemes_exports2 = {};
__export(list_schemes_exports2, {
  default: () => list_schemes_default
});
var init_list_schemes2 = __esm({
  "src/mcp/tools/macos/list_schemes.ts"() {
    init_list_schemes();
  }
});

// src/mcp/tools/project-discovery/show_build_settings.ts
var show_build_settings_exports = {};
__export(show_build_settings_exports, {
  default: () => show_build_settings_default,
  showBuildSettingsLogic: () => showBuildSettingsLogic
});
async function showBuildSettingsLogic(params, executor) {
  log("info", `Showing build settings for scheme ${params.scheme}`);
  try {
    const command = ["xcodebuild", "-showBuildSettings"];
    const hasProjectPath = typeof params.projectPath === "string";
    const path4 = hasProjectPath ? params.projectPath : params.workspacePath;
    if (hasProjectPath) {
      command.push("-project", params.projectPath);
    } else {
      command.push("-workspace", params.workspacePath);
    }
    command.push("-scheme", params.scheme);
    const result = await executor(command, "Show Build Settings", true);
    if (!result.success) {
      return createTextResponse(`Failed to show build settings: ${result.error}`, true);
    }
    const content = [
      {
        type: "text",
        text: hasProjectPath ? `\u2705 Build settings for scheme ${params.scheme}:` : "\u2705 Build settings retrieved successfully"
      },
      {
        type: "text",
        text: result.output || "Build settings retrieved successfully."
      }
    ];
    if (!hasProjectPath && path4) {
      content.push({
        type: "text",
        text: `Next Steps:
- Build the workspace: build_macos({ workspacePath: "${path4}", scheme: "${params.scheme}" })
- For iOS: build_sim({ workspacePath: "${path4}", scheme: "${params.scheme}", simulatorName: "iPhone 16" })
- List schemes: list_schemes({ workspacePath: "${path4}" })`
      });
    }
    return {
      content,
      isError: false
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("error", `Error showing build settings: ${errorMessage}`);
    return createTextResponse(`Error showing build settings: ${errorMessage}`, true);
  }
}
var baseSchemaObject6, baseSchema6, showBuildSettingsSchema, publicSchemaObject6, show_build_settings_default;
var init_show_build_settings = __esm({
  "src/mcp/tools/project-discovery/show_build_settings.ts"() {
    init_logging();
    init_execution();
    init_responses();
    init_typed_tool_factory();
    init_schema_helpers();
    baseSchemaObject6 = z.object({
      projectPath: z.string().optional().describe("Path to the .xcodeproj file"),
      workspacePath: z.string().optional().describe("Path to the .xcworkspace file"),
      scheme: z.string().describe("Scheme name to show build settings for (Required)")
    });
    baseSchema6 = z.preprocess(nullifyEmptyStrings, baseSchemaObject6);
    showBuildSettingsSchema = baseSchema6.refine((val) => val.projectPath !== void 0 || val.workspacePath !== void 0, {
      message: "Either projectPath or workspacePath is required."
    }).refine((val) => !(val.projectPath !== void 0 && val.workspacePath !== void 0), {
      message: "projectPath and workspacePath are mutually exclusive. Provide only one."
    });
    publicSchemaObject6 = baseSchemaObject6.omit({
      projectPath: true,
      workspacePath: true,
      scheme: true
    });
    show_build_settings_default = {
      name: "show_build_settings",
      description: "Shows xcodebuild build settings.",
      schema: publicSchemaObject6.shape,
      handler: createSessionAwareTool({
        internalSchema: showBuildSettingsSchema,
        logicFunction: showBuildSettingsLogic,
        getExecutor: getDefaultCommandExecutor,
        requirements: [
          { allOf: ["scheme"], message: "scheme is required" },
          { oneOf: ["projectPath", "workspacePath"], message: "Provide a project or workspace" }
        ],
        exclusivePairs: [["projectPath", "workspacePath"]]
      })
    };
  }
});

// src/mcp/tools/macos/show_build_settings.ts
var show_build_settings_exports2 = {};
__export(show_build_settings_exports2, {
  default: () => show_build_settings_default
});
var init_show_build_settings2 = __esm({
  "src/mcp/tools/macos/show_build_settings.ts"() {
    init_show_build_settings();
  }
});

// src/mcp/tools/project-discovery/index.ts
var project_discovery_exports = {};
__export(project_discovery_exports, {
  workflow: () => workflow3
});
var workflow3;
var init_project_discovery = __esm({
  "src/mcp/tools/project-discovery/index.ts"() {
    workflow3 = {
      name: "Project Discovery",
      description: "Discover and examine Xcode projects, workspaces, and Swift packages. Analyze project structure, schemes, build settings, and bundle information.",
      platforms: ["iOS", "macOS", "watchOS", "tvOS", "visionOS"],
      capabilities: ["project-analysis", "scheme-discovery", "build-settings", "bundle-inspection"]
    };
  }
});

// src/mcp/tools/project-scaffolding/index.ts
var project_scaffolding_exports = {};
__export(project_scaffolding_exports, {
  workflow: () => workflow4
});
var workflow4;
var init_project_scaffolding = __esm({
  "src/mcp/tools/project-scaffolding/index.ts"() {
    workflow4 = {
      name: "Project Scaffolding",
      description: "Tools for creating new iOS and macOS projects from templates. Bootstrap new applications with best practices, standard configurations, and modern project structures.",
      platforms: ["iOS", "macOS"],
      targets: ["simulator", "device", "mac"],
      projectTypes: ["project"],
      capabilities: ["project-creation", "template-generation", "project-initialization"]
    };
  }
});

// src/mcp/tools/session-management/index.ts
var session_management_exports = {};
__export(session_management_exports, {
  workflow: () => workflow5
});
var workflow5;
var init_session_management = __esm({
  "src/mcp/tools/session-management/index.ts"() {
    workflow5 = {
      name: "session-management",
      description: "Manage session defaults for projectPath/workspacePath, scheme, configuration, simulatorName/simulatorId, deviceId, useLatestOS and arch. These defaults are required by many tools and must be set before attempting to call tools that would depend on these values.",
      platforms: ["iOS", "macOS", "tvOS", "watchOS", "visionOS"],
      targets: ["simulator", "device"],
      capabilities: ["configuration", "state-management"]
    };
  }
});

// src/mcp/tools/session-management/session_clear_defaults.ts
var session_clear_defaults_exports = {};
__export(session_clear_defaults_exports, {
  default: () => session_clear_defaults_default,
  sessionClearDefaultsLogic: () => sessionClearDefaultsLogic
});
async function sessionClearDefaultsLogic(params) {
  if (params.all || !params.keys) sessionStore.clear();
  else sessionStore.clear(params.keys);
  return { content: [{ type: "text", text: "Session defaults cleared" }], isError: false };
}
var keys, schemaObj, session_clear_defaults_default;
var init_session_clear_defaults = __esm({
  "src/mcp/tools/session-management/session_clear_defaults.ts"() {
    init_session_store();
    init_typed_tool_factory();
    init_execution();
    keys = [
      "projectPath",
      "workspacePath",
      "scheme",
      "configuration",
      "simulatorName",
      "simulatorId",
      "deviceId",
      "useLatestOS",
      "arch"
    ];
    schemaObj = z.object({
      keys: z.array(z.enum(keys)).optional(),
      all: z.boolean().optional()
    });
    session_clear_defaults_default = {
      name: "session-clear-defaults",
      description: "Clear selected or all session defaults.",
      schema: schemaObj.shape,
      handler: createTypedTool(schemaObj, sessionClearDefaultsLogic, getDefaultCommandExecutor)
    };
  }
});

// src/mcp/tools/session-management/session_set_defaults.ts
var session_set_defaults_exports = {};
__export(session_set_defaults_exports, {
  default: () => session_set_defaults_default,
  sessionSetDefaultsLogic: () => sessionSetDefaultsLogic
});
async function sessionSetDefaultsLogic(params) {
  const toClear = /* @__PURE__ */ new Set();
  if (Object.prototype.hasOwnProperty.call(params, "projectPath")) toClear.add("workspacePath");
  if (Object.prototype.hasOwnProperty.call(params, "workspacePath")) toClear.add("projectPath");
  if (Object.prototype.hasOwnProperty.call(params, "simulatorId")) toClear.add("simulatorName");
  if (Object.prototype.hasOwnProperty.call(params, "simulatorName")) toClear.add("simulatorId");
  if (toClear.size > 0) {
    sessionStore.clear(Array.from(toClear));
  }
  sessionStore.setDefaults(params);
  const current = sessionStore.getAll();
  return {
    content: [{ type: "text", text: `Defaults updated:
${JSON.stringify(current, null, 2)}` }],
    isError: false
  };
}
var baseSchema7, schemaObj2, session_set_defaults_default;
var init_session_set_defaults = __esm({
  "src/mcp/tools/session-management/session_set_defaults.ts"() {
    init_session_store();
    init_typed_tool_factory();
    init_execution();
    baseSchema7 = z.object({
      projectPath: z.string().optional(),
      workspacePath: z.string().optional(),
      scheme: z.string().optional(),
      configuration: z.string().optional(),
      simulatorName: z.string().optional(),
      simulatorId: z.string().optional(),
      deviceId: z.string().optional(),
      useLatestOS: z.boolean().optional(),
      arch: z.enum(["arm64", "x86_64"]).optional()
    });
    schemaObj2 = baseSchema7.refine((v) => !(v.projectPath && v.workspacePath), {
      message: "projectPath and workspacePath are mutually exclusive",
      path: ["projectPath"]
    }).refine((v) => !(v.simulatorId && v.simulatorName), {
      message: "simulatorId and simulatorName are mutually exclusive",
      path: ["simulatorId"]
    });
    session_set_defaults_default = {
      name: "session-set-defaults",
      description: "Set the session defaults needed by many tools. Most tools require one or more session defaults to be set before they can be used. Agents should set the relevant defaults at the beginning of a session.",
      schema: baseSchema7.shape,
      handler: createTypedTool(schemaObj2, sessionSetDefaultsLogic, getDefaultCommandExecutor)
    };
  }
});

// src/mcp/tools/session-management/session_show_defaults.ts
var session_show_defaults_exports = {};
__export(session_show_defaults_exports, {
  default: () => session_show_defaults_default
});
var session_show_defaults_default;
var init_session_show_defaults = __esm({
  "src/mcp/tools/session-management/session_show_defaults.ts"() {
    init_session_store();
    session_show_defaults_default = {
      name: "session-show-defaults",
      description: "Show current session defaults.",
      schema: {},
      handler: async () => {
        const current = sessionStore.getAll();
        return { content: [{ type: "text", text: JSON.stringify(current, null, 2) }], isError: false };
      }
    };
  }
});

// src/mcp/tools/utilities/index.ts
var utilities_exports = {};
__export(utilities_exports, {
  workflow: () => workflow6
});
var workflow6;
var init_utilities = __esm({
  "src/mcp/tools/utilities/index.ts"() {
    workflow6 = {
      name: "Project Utilities",
      description: "Essential project maintenance utilities for cleaning and managing existing projects. Provides clean operations for both .xcodeproj and .xcworkspace files.",
      platforms: ["iOS", "macOS"],
      targets: ["simulator", "device", "mac"],
      projectTypes: ["project", "workspace"],
      capabilities: ["project-cleaning", "project-maintenance"]
    };
  }
});

// src/core/generated-plugins.ts
var WORKFLOW_LOADERS, WORKFLOW_METADATA;
var init_generated_plugins = __esm({
  "src/core/generated-plugins.ts"() {
    WORKFLOW_LOADERS = {
      "discovery": async () => {
        const { workflow: workflow7 } = await Promise.resolve().then(() => (init_discovery(), discovery_exports));
        const tool_0 = await Promise.resolve().then(() => (init_discover_tools(), discover_tools_exports)).then((m) => m.default);
        return {
          workflow: workflow7,
          "discover_tools": tool_0
        };
      },
      "macos": async () => {
        const { workflow: workflow7 } = await Promise.resolve().then(() => (init_macos(), macos_exports));
        const tool_0 = await Promise.resolve().then(() => (init_build_macos(), build_macos_exports)).then((m) => m.default);
        const tool_1 = await Promise.resolve().then(() => (init_build_run_macos(), build_run_macos_exports)).then((m) => m.default);
        const tool_2 = await Promise.resolve().then(() => (init_clean2(), clean_exports2)).then((m) => m.default);
        const tool_3 = await Promise.resolve().then(() => (init_discover_projs2(), discover_projs_exports2)).then((m) => m.default);
        const tool_4 = await Promise.resolve().then(() => (init_get_mac_app_path(), get_mac_app_path_exports)).then((m) => m.default);
        const tool_5 = await Promise.resolve().then(() => (init_get_mac_bundle_id2(), get_mac_bundle_id_exports2)).then((m) => m.default);
        const tool_6 = await Promise.resolve().then(() => (init_list_schemes2(), list_schemes_exports2)).then((m) => m.default);
        const tool_7 = await Promise.resolve().then(() => (init_show_build_settings2(), show_build_settings_exports2)).then((m) => m.default);
        return {
          workflow: workflow7,
          "build_macos": tool_0,
          "build_run_macos": tool_1,
          "clean": tool_2,
          "discover_projs": tool_3,
          "get_mac_app_path": tool_4,
          "get_mac_bundle_id": tool_5,
          "list_schemes": tool_6,
          "show_build_settings": tool_7
        };
      },
      "project-discovery": async () => {
        const { workflow: workflow7 } = await Promise.resolve().then(() => (init_project_discovery(), project_discovery_exports));
        const tool_0 = await Promise.resolve().then(() => (init_discover_projs(), discover_projs_exports)).then((m) => m.default);
        const tool_1 = await Promise.resolve().then(() => (init_get_mac_bundle_id(), get_mac_bundle_id_exports)).then((m) => m.default);
        const tool_2 = await Promise.resolve().then(() => (init_list_schemes(), list_schemes_exports)).then((m) => m.default);
        const tool_3 = await Promise.resolve().then(() => (init_show_build_settings(), show_build_settings_exports)).then((m) => m.default);
        return {
          workflow: workflow7,
          "discover_projs": tool_0,
          "get_mac_bundle_id": tool_1,
          "list_schemes": tool_2,
          "show_build_settings": tool_3
        };
      },
      "project-scaffolding": async () => {
        const { workflow: workflow7 } = await Promise.resolve().then(() => (init_project_scaffolding(), project_scaffolding_exports));
        return {
          workflow: workflow7
        };
      },
      "session-management": async () => {
        const { workflow: workflow7 } = await Promise.resolve().then(() => (init_session_management(), session_management_exports));
        const tool_0 = await Promise.resolve().then(() => (init_session_clear_defaults(), session_clear_defaults_exports)).then((m) => m.default);
        const tool_1 = await Promise.resolve().then(() => (init_session_set_defaults(), session_set_defaults_exports)).then((m) => m.default);
        const tool_2 = await Promise.resolve().then(() => (init_session_show_defaults(), session_show_defaults_exports)).then((m) => m.default);
        return {
          workflow: workflow7,
          "session_clear_defaults": tool_0,
          "session_set_defaults": tool_1,
          "session_show_defaults": tool_2
        };
      },
      "utilities": async () => {
        const { workflow: workflow7 } = await Promise.resolve().then(() => (init_utilities(), utilities_exports));
        const tool_0 = await Promise.resolve().then(() => (init_clean(), clean_exports)).then((m) => m.default);
        return {
          workflow: workflow7,
          "clean": tool_0
        };
      }
    };
    WORKFLOW_METADATA = {
      "discovery": {
        "name": "Dynamic Tool Discovery",
        "description": "Intelligent discovery and recommendation of appropriate development workflows based on project structure and requirements",
        "platforms": [
          "iOS",
          "macOS",
          "watchOS",
          "tvOS",
          "visionOS"
        ],
        "targets": [
          "simulator",
          "device"
        ],
        "projectTypes": [
          "project",
          "workspace",
          "package"
        ],
        "capabilities": [
          "discovery",
          "recommendation",
          "workflow-analysis"
        ]
      },
      "macos": {
        "name": "macOS Development",
        "description": "Complete macOS development workflow for both .xcodeproj and .xcworkspace files. Build, test, deploy, and manage macOS applications.",
        "platforms": [
          "macOS"
        ],
        "targets": [
          "native"
        ],
        "projectTypes": [
          "project",
          "workspace"
        ],
        "capabilities": [
          "build",
          "test",
          "deploy",
          "debug",
          "app-management"
        ]
      },
      "project-discovery": {
        "name": "Project Discovery",
        "description": "Discover and examine Xcode projects, workspaces, and Swift packages. Analyze project structure, schemes, build settings, and bundle information.",
        "platforms": [
          "iOS",
          "macOS",
          "watchOS",
          "tvOS",
          "visionOS"
        ],
        "capabilities": [
          "project-analysis",
          "scheme-discovery",
          "build-settings",
          "bundle-inspection"
        ]
      },
      "project-scaffolding": {
        "name": "Project Scaffolding",
        "description": "Tools for creating new iOS and macOS projects from templates. Bootstrap new applications with best practices, standard configurations, and modern project structures.",
        "platforms": [
          "iOS",
          "macOS"
        ],
        "targets": [
          "simulator",
          "device",
          "mac"
        ],
        "projectTypes": [
          "project"
        ],
        "capabilities": [
          "project-creation",
          "template-generation",
          "project-initialization"
        ]
      },
      "session-management": {
        "name": "session-management",
        "description": "Manage session defaults for projectPath/workspacePath, scheme, configuration, simulatorName/simulatorId, deviceId, useLatestOS and arch. These defaults are required by many tools and must be set before attempting to call tools that would depend on these values.",
        "platforms": [
          "iOS",
          "macOS",
          "tvOS",
          "watchOS",
          "visionOS"
        ],
        "targets": [
          "simulator",
          "device"
        ],
        "capabilities": [
          "configuration",
          "state-management"
        ]
      },
      "utilities": {
        "name": "Project Utilities",
        "description": "Essential project maintenance utilities for cleaning and managing existing projects. Provides clean operations for both .xcodeproj and .xcworkspace files.",
        "platforms": [
          "iOS",
          "macOS"
        ],
        "targets": [
          "simulator",
          "device",
          "mac"
        ],
        "projectTypes": [
          "project",
          "workspace"
        ],
        "capabilities": [
          "project-cleaning",
          "project-maintenance"
        ]
      }
    };
  }
});

// src/core/plugin-registry.ts
var plugin_registry_exports = {};
__export(plugin_registry_exports, {
  getWorkflowMetadata: () => getWorkflowMetadata,
  loadPlugins: () => loadPlugins,
  loadWorkflowGroups: () => loadWorkflowGroups
});
async function loadPlugins() {
  const plugins = /* @__PURE__ */ new Map();
  const workflowGroups = await loadWorkflowGroups();
  for (const [, workflow7] of workflowGroups.entries()) {
    for (const tool of workflow7.tools) {
      if (tool?.name && typeof tool.handler === "function") {
        plugins.set(tool.name, tool);
      }
    }
  }
  return plugins;
}
async function loadWorkflowGroups() {
  const workflows = /* @__PURE__ */ new Map();
  for (const [workflowName, loader] of Object.entries(WORKFLOW_LOADERS)) {
    try {
      const workflowModule = await loader();
      if (!workflowModule.workflow) {
        throw new Error(`Workflow metadata missing in ${workflowName}/index.js`);
      }
      const workflowMeta = workflowModule.workflow;
      if (!workflowMeta.name || typeof workflowMeta.name !== "string") {
        throw new Error(
          `Invalid workflow.name in ${workflowName}/index.js: must be a non-empty string`
        );
      }
      if (!workflowMeta.description || typeof workflowMeta.description !== "string") {
        throw new Error(
          `Invalid workflow.description in ${workflowName}/index.js: must be a non-empty string`
        );
      }
      workflows.set(workflowName, {
        workflow: workflowMeta,
        tools: await loadWorkflowTools(workflowModule),
        directoryName: workflowName
      });
    } catch (error) {
      throw new Error(
        `Failed to load workflow '${workflowName}': ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
  return workflows;
}
async function loadWorkflowTools(workflowModule) {
  const tools = [];
  for (const [key, value] of Object.entries(workflowModule)) {
    if (key !== "workflow" && value && typeof value === "object") {
      const tool = value;
      if (tool.name && typeof tool.handler === "function") {
        tools.push(tool);
      }
    }
  }
  return tools;
}
async function getWorkflowMetadata(directoryName) {
  try {
    const metadata = WORKFLOW_METADATA[directoryName];
    if (metadata) {
      return metadata;
    }
    const loader = WORKFLOW_LOADERS[directoryName];
    if (loader) {
      const workflowModule = await loader();
      return workflowModule.workflow ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
var init_plugin_registry = __esm({
  "src/core/plugin-registry.ts"() {
    init_generated_plugins();
  }
});

// src/utils/tool-registry.ts
function getDisabledTools() {
  const raw = (process.env.XCODEBUILDMCP_DISABLED_TOOLS || "").trim();
  if (!raw) return /* @__PURE__ */ new Set();
  return new Set(
    raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
  );
}
function getEnabledTools() {
  const raw = (process.env.XCODEBUILDMCP_ENABLED_TOOLS || "").trim();
  if (!raw) return null;
  const set = new Set(
    raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
  );
  return set.size > 0 ? set : null;
}
function isToolAllowed(name, enabled, disabled) {
  if (enabled && !enabled.has(name)) return false;
  if (disabled.has(name)) return false;
  return true;
}
function registerAndTrackTools(server, tools) {
  const registeredTools = server.registerTools(tools);
  tools.forEach((tool, index) => {
    if (registeredTools[index]) {
      toolRegistry.set(tool.name, registeredTools[index]);
    }
  });
  return registeredTools;
}
function isToolRegistered(name) {
  return toolRegistry.has(name);
}
function removeTrackedTool(name) {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return false;
  }
  try {
    tool.remove();
    toolRegistry.delete(name);
    log("debug", `\u2705 Removed tool: ${name}`);
    return true;
  } catch (error) {
    log("error", `\u274C Failed to remove tool ${name}: ${error}`);
    return false;
  }
}
function removeTrackedTools(names) {
  const removedTools = [];
  for (const name of names) {
    if (removeTrackedTool(name)) {
      removedTools.push(name);
    }
  }
  return removedTools;
}
async function registerDiscoveryTools(server) {
  const plugins = await loadPlugins();
  let registeredCount = 0;
  const discoveryTools = [];
  for (const plugin of plugins.values()) {
    if (plugin.name === "discover_tools" || plugin.name === "discover_projs") {
      discoveryTools.push({
        name: plugin.name,
        config: {
          description: plugin.description ?? "",
          inputSchema: plugin.schema
        },
        // Adapt callback to match SDK's expected signature
        callback: (args) => plugin.handler(args)
      });
      registeredCount++;
    }
  }
  if (discoveryTools.length > 0) {
    registerAndTrackTools(server, discoveryTools);
  }
  log("info", `\u2705 Registered ${registeredCount} discovery tools in dynamic mode.`);
}
async function registerSelectedWorkflows(server, workflowNames) {
  const { loadWorkflowGroups: loadWorkflowGroups2 } = await Promise.resolve().then(() => (init_plugin_registry(), plugin_registry_exports));
  const workflowGroups = await loadWorkflowGroups2();
  const selectedTools = [];
  const disabled = getDisabledTools();
  const enabled = getEnabledTools();
  for (const workflowName of workflowNames) {
    const workflow7 = workflowGroups.get(workflowName.trim());
    if (!workflow7) continue;
    for (const tool of workflow7.tools) {
      if (!isToolAllowed(tool.name, enabled, disabled)) continue;
      selectedTools.push({
        name: tool.name,
        config: {
          description: tool.description ?? "",
          inputSchema: tool.schema
        },
        callback: (args) => tool.handler(args)
      });
    }
  }
  if (selectedTools.length > 0) {
    server.registerTools(selectedTools);
  }
  log(
    "info",
    `\u2705 Registered ${selectedTools.length} tools from workflows: ${workflowNames.join(", ")}${disabled.size ? ` (disabled: ${Array.from(disabled).join(", ")})` : ""}`
  );
}
async function registerAllToolsStatic(server) {
  const plugins = await loadPlugins();
  const allTools = [];
  const disabled = getDisabledTools();
  const enabled = getEnabledTools();
  for (const plugin of plugins.values()) {
    if (plugin.name === "discover_tools") continue;
    if (!isToolAllowed(plugin.name, enabled, disabled)) continue;
    allTools.push({
      name: plugin.name,
      config: {
        description: plugin.description ?? "",
        inputSchema: plugin.schema
      },
      // Adapt callback to match SDK's expected signature
      callback: (args) => plugin.handler(args)
    });
  }
  if (allTools.length > 0) {
    server.registerTools(allTools);
  }
  log("info", `\u2705 Registered ${allTools.length} tools in static mode${disabled.size ? ` (disabled: ${Array.from(disabled).join(", ")})` : ""}.`);
}
var toolRegistry;
var init_tool_registry = __esm({
  "src/utils/tool-registry.ts"() {
    init_plugin_registry();
    init_logger();
    toolRegistry = /* @__PURE__ */ new Map();
  }
});

// src/version.ts
var version = "1.14.1";
function getXcodeInfo() {
  try {
    const xcodebuildOutput = execSync("xcodebuild -version", { encoding: "utf8" }).trim();
    const version2 = xcodebuildOutput.split("\n").slice(0, 2).join(" - ");
    const path4 = execSync("xcode-select -p", { encoding: "utf8" }).trim();
    const selectedXcode = execSync("xcrun --find xcodebuild", { encoding: "utf8" }).trim();
    return { version: version2, path: path4, selectedXcode };
  } catch (error) {
    return {
      version: "Not available",
      path: "Not available",
      selectedXcode: "Not available",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function getEnvironmentVariables() {
  const relevantVars = [
    "INCREMENTAL_BUILDS_ENABLED",
    "PATH",
    "DEVELOPER_DIR",
    "HOME",
    "USER",
    "TMPDIR",
    "NODE_ENV",
    "SENTRY_DISABLED"
  ];
  const envVars2 = {};
  relevantVars.forEach((varName) => {
    envVars2[varName] = process.env[varName] ?? "";
  });
  Object.keys(process.env).forEach((key) => {
    if (key.startsWith("XCODEBUILDMCP_")) {
      envVars2[key] = process.env[key] ?? "";
    }
  });
  return envVars2;
}
function checkBinaryAvailability(binary) {
  try {
    execSync(`which ${binary}`, { stdio: "ignore" });
  } catch {
    return { available: false };
  }
  let version2;
  const versionCommands = {
    axe: "axe --version",
    mise: "mise --version"
  };
  if (binary in versionCommands) {
    try {
      version2 = execSync(versionCommands[binary], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
    } catch {
    }
  }
  return { available: true, version: version2 };
}
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "https://798607831167c7b9fe2f2912f5d3c665@o4509258288332800.ingest.de.sentry.io/4509258293837904",
  // Setting this option to true will send default PII data to Sentry
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  // Set release version to match application version
  release: `xcodebuildmcp@${version}`,
  // Always report under production environment
  environment: "production",
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring
  // We recommend adjusting this value in production
  tracesSampleRate: 1
});
var axeAvailable = checkBinaryAvailability("axe");
var miseAvailable = checkBinaryAvailability("mise");
var envVars = getEnvironmentVariables();
var xcodeInfo = getXcodeInfo();
var tags = {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  axeAvailable: axeAvailable.available ? "true" : "false",
  axeVersion: axeAvailable.version ?? "Unknown",
  miseAvailable: miseAvailable.available ? "true" : "false",
  miseVersion: miseAvailable.version ?? "Unknown",
  ...Object.fromEntries(Object.entries(envVars).map(([k, v]) => [`env_${k}`, v ?? ""])),
  xcodeVersion: xcodeInfo.version ?? "Unknown",
  xcodePath: xcodeInfo.path ?? "Unknown"
};
Sentry.setTags(tags);

// src/server/server.ts
init_logger();
function createServer() {
  const baseServer = new McpServer(
    {
      name: "xcodebuildmcp",
      version
    },
    {
      capabilities: {
        tools: {
          listChanged: true
        },
        resources: {
          subscribe: true,
          listChanged: true
        },
        logging: {}
      }
    }
  );
  const server = Sentry.wrapMcpServerWithSentry(baseServer);
  log("info", `Server initialized with Sentry MCP instrumentation (version ${version})`);
  return server;
}
async function startServer(server) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "XcodeBuildMCP Server running on stdio");
}

// src/index.ts
init_logger();
init_xcodemake();

// src/core/resources.ts
init_logging();

// src/core/generated-resources.ts
var RESOURCE_LOADERS = {};

// src/core/resources.ts
async function loadResources() {
  const resources = /* @__PURE__ */ new Map();
  for (const [resourceName, loader] of Object.entries(RESOURCE_LOADERS)) {
    try {
      const resource = await loader();
      if (!resource.uri || !resource.handler || typeof resource.handler !== "function") {
        throw new Error(`Invalid resource structure for ${resourceName}`);
      }
      resources.set(resource.uri, resource);
      log("info", `Loaded resource: ${resourceName} (${resource.uri})`);
    } catch (error) {
      log(
        "error",
        `Failed to load resource ${resourceName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return resources;
}
async function registerResources(server) {
  const resources = await loadResources();
  for (const [uri, resource] of Array.from(resources)) {
    const readCallback = async (resourceUri) => {
      const result = await resource.handler(resourceUri);
      return {
        contents: result.contents.map((content) => ({
          uri: resourceUri.toString(),
          text: content.text,
          mimeType: resource.mimeType
        }))
      };
    };
    server.resource(
      resource.name,
      uri,
      {
        mimeType: resource.mimeType,
        title: resource.description
      },
      readCallback
    );
    log("info", `Registered resource: ${resource.name} at ${uri}`);
  }
  log("info", `Registered ${resources.size} resources`);
  return true;
}

// src/index.ts
init_tool_registry();
async function main() {
  try {
    if (isXcodemakeEnabled()) {
      log("info", "xcodemake is enabled, checking if available...");
      const available = await isXcodemakeAvailable();
      if (available) {
        log("info", "xcodemake is available and will be used for builds");
      } else {
        log(
          "warn",
          "xcodemake is enabled but could not be made available, falling back to xcodebuild"
        );
      }
    } else {
      log("debug", "xcodemake is disabled, using standard xcodebuild");
    }
    const server = createServer();
    server.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      const { level } = request.params;
      setLogLevel(level);
      log("info", `Client requested log level: ${level}`);
      return {};
    });
    globalThis.mcpServer = server;
    const isDynamicModeEnabled = process2.env.XCODEBUILDMCP_DYNAMIC_TOOLS === "true";
    if (isDynamicModeEnabled) {
      log("info", "\u{1F680} Initializing server in dynamic tools mode...");
      await registerDiscoveryTools(server);
      log("info", "\u{1F4A1} Use discover_tools to enable additional workflows based on your task.");
    } else {
      const enabledWorkflows2 = process2.env.XCODEBUILDMCP_ENABLED_WORKFLOWS;
      if (enabledWorkflows2) {
        const workflowNames = enabledWorkflows2.split(",");
        log("info", `\u{1F680} Initializing server with selected workflows: ${workflowNames.join(", ")}`);
        await registerSelectedWorkflows(server, workflowNames);
      } else {
        log("info", "\u{1F680} Initializing server in static tools mode...");
        await registerAllToolsStatic(server);
      }
    }
    await registerResources(server);
    await startServer(server);
    process2.on("SIGTERM", async () => {
      await server.close();
      process2.exit(0);
    });
    process2.on("SIGINT", async () => {
      await server.close();
      process2.exit(0);
    });
    log("info", `XcodeBuildMCP server (version ${version}) started successfully`);
  } catch (error) {
    console.error("Fatal error in main():", error);
    process2.exit(1);
  }
}
main().catch((error) => {
  console.error("Unhandled exception:", error);
  setTimeout(() => process2.exit(1), 1e3);
});
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map