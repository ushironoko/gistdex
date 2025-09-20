import { executeGHCommand } from "./git-command.js";

export interface GitHubContext {
  isPR: boolean;
  prNumber?: number;
  baseBranch?: string;
  repo?: string;
  owner?: string;
  token?: string;
}

/**
 * Detect GitHub Actions environment
 */
export const detectGitHubContext = (): GitHubContext => {
  const context: GitHubContext = {
    isPR: false,
  };

  // Check if running in GitHub Actions
  if (!process.env.GITHUB_ACTIONS) {
    return context;
  }

  // Check if it's a pull request
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === "pull_request" || eventName === "pull_request_target") {
    context.isPR = true;

    // Extract PR number
    const ref = process.env.GITHUB_REF;
    if (ref?.includes("pull/")) {
      const match = ref.match(/pull\/(\d+)/);
      if (match?.[1]) {
        context.prNumber = Number.parseInt(match[1], 10);
      }
    }

    // Get base branch
    context.baseBranch = process.env.GITHUB_BASE_REF;
  }

  // Get repository info
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository) {
    const [owner, repo] = repository.split("/");
    context.owner = owner;
    context.repo = repo;
  }

  // Get token
  context.token = process.env.GITHUB_TOKEN;

  return context;
};

/**
 * Post comment to GitHub PR
 */
export const postToGitHubPR = async (content: string): Promise<void> => {
  const context = detectGitHubContext();

  if (!context.isPR) {
    throw new Error("Not running in a GitHub PR context");
  }

  if (!context.prNumber) {
    throw new Error("Could not determine PR number");
  }

  if (!context.owner || !context.repo) {
    throw new Error("Could not determine repository info");
  }

  if (!context.token) {
    throw new Error(
      "GITHUB_TOKEN is not set. Please set the GITHUB_TOKEN environment variable",
    );
  }

  try {
    // Always create new comment using gh pr comment
    executeGHCommand(
      ["pr", "comment", String(context.prNumber), "--body", content],
      {
        env: { GH_TOKEN: context.token },
      },
    );
    console.log("Created new comment on PR");
  } catch (error) {
    throw new Error(
      `Failed to post to GitHub PR: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};
