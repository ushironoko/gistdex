#!/usr/bin/env node

// Test script for MCP server with environment
import { spawn } from "node:child_process";

// Pass environment variables to the subprocess
const mcpServer = spawn("node", ["dist/mcp/server.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

// Handle server output
mcpServer.stdout.on("data", (data) => {
  console.log("Server response:", data.toString());

  // Parse and display the response
  try {
    const lines = data
      .toString()
      .split("\n")
      .filter((line) => line.trim());
    for (const line of lines) {
      if (line.startsWith("{")) {
        const response = JSON.parse(line);
        console.log("Parsed response:", JSON.stringify(response, null, 2));
      }
    }
  } catch (_e) {
    // Not JSON, just raw output
  }
});

mcpServer.stderr.on("data", (data) => {
  console.error("Server stderr:", data.toString());
});

mcpServer.on("close", (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Send test requests
async function sendRequest(request) {
  console.log("\nSending request:", JSON.stringify(request, null, 2));
  mcpServer.stdin.write(`${JSON.stringify(request)}\n`);

  // Wait a bit for response
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function test() {
  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("Environment check:");
  console.log(
    "GOOGLE_GENERATIVE_AI_API_KEY:",
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "Set" : "Not set",
  );

  // Test 1: Index Japanese text content
  await sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "gistdex_index",
      arguments: {
        type: "text",
        text: {
          content: "こんにちは、gistdexです。",
          title: "Japanese Test Document",
        },
      },
    },
  });

  // Test 2: Query the indexed content with Japanese
  await sendRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "gistdex_query",
      arguments: {
        query: "gistdex",
        k: 3,
      },
    },
  });

  // Test 3: List indexed items with stats
  await sendRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "gistdex_list",
      arguments: {
        stats: true,
      },
    },
  });

  // Close the server
  setTimeout(() => {
    console.log("\nClosing server...");
    mcpServer.stdin.end();
  }, 8000);
}

test().catch(console.error);
