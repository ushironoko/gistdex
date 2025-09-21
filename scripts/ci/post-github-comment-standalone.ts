#!/usr/bin/env tsx

/**
 * Simplified version that reads the formatted comment from stdin
 * and posts it to GitHub PR
 */

import { env, exit, stdin } from "node:process";

async function readFromStdin(): Promise<string> {
  let data = "";
  stdin.setEncoding("utf8");

  for await (const chunk of stdin) {
    data += chunk;
  }

  return data.trim();
}

async function postGitHubComment(
  comment: string,
  token: string,
  repository: string,
  issueNumber: number,
): Promise<void> {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository format: ${repository}`);
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

  // Get existing comments to check for updates
  const listResponse = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!listResponse.ok) {
    throw new Error(
      `Failed to fetch comments: ${listResponse.status} ${listResponse.statusText}`,
    );
  }

  const comments = await listResponse.json();

  // Find existing bot comment
  interface GitHubComment {
    id: number;
    user?: { type?: string };
    body?: string;
  }

  const botComment = (comments as GitHubComment[]).find(
    (c) =>
      c.user?.type === "Bot" &&
      c.body?.includes("Documentation Impact Analysis"),
  );

  if (botComment) {
    // Update existing comment
    const updateUrl = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${botComment.id}`;
    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: comment }),
    });

    if (!updateResponse.ok) {
      throw new Error(
        `Failed to update comment: ${updateResponse.status} ${updateResponse.statusText}`,
      );
    }
    console.error("Updated existing comment");
  } else {
    // Create new comment
    const createResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: comment }),
    });

    if (!createResponse.ok) {
      throw new Error(
        `Failed to create comment: ${createResponse.status} ${createResponse.statusText}`,
      );
    }
    console.error("Created new comment");
  }
}

async function main() {
  try {
    // Read comment from stdin (piped from run-doc-analysis-standalone.ts)
    const comment = await readFromStdin();

    if (!comment) {
      console.error("No comment content received from stdin");
      exit(1);
    }

    // Check if we should skip (no impact detected)
    if (comment.includes("No documentation impact detected")) {
      console.error("No documentation impact detected. Skipping comment.");
      exit(0);
    }

    // Get environment variables
    const token = env.GITHUB_TOKEN;
    const repository = env.GITHUB_REPOSITORY;
    const issueNumber = env.GITHUB_ISSUE_NUMBER;

    if (!token || !repository || !issueNumber) {
      console.error(
        "Missing required environment variables: GITHUB_TOKEN, GITHUB_REPOSITORY, or GITHUB_ISSUE_NUMBER",
      );
      exit(1);
    }

    // Post the comment to GitHub
    await postGitHubComment(
      comment,
      token,
      repository,
      parseInt(issueNumber, 10),
    );

    console.error(`Successfully posted comment to PR #${issueNumber}`);
    exit(0);
  } catch (error) {
    console.error("Error posting GitHub comment:", error);
    exit(1);
  }
}

main();
