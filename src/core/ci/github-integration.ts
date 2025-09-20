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
    // Check if we should edit or create
    const existingCommentId = await findExistingComment(context);

    if (existingCommentId) {
      // Update existing comment using API (gh pr comment doesn't support update)
      await updateComment(context, existingCommentId, content);
      console.log(`Updated existing comment: #${existingCommentId}`);
    } else {
      // Create new comment using simpler gh pr comment
      await createComment(context, content);
      console.log("Created new comment");
    }
  } catch (error) {
    throw new Error(
      `Failed to post to GitHub PR: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

/**
 * Find existing Gistdex comment on the PR
 */
const findExistingComment = async (
  context: GitHubContext,
): Promise<number | null> => {
  try {
    // Directly use API to get issue comments (simpler than PR comments)
    const response = executeGHCommand(
      [
        "api",
        `repos/${context.owner}/${context.repo}/issues/${context.prNumber}/comments`,
      ],
      {
        env: { GH_TOKEN: context.token },
      },
    );

    const comments = JSON.parse(response) as Array<{
      id: number;
      body: string;
    }>;

    // Find comment with Gistdex marker
    const gistdexComment = comments.find((comment) =>
      comment.body.includes("Documentation Impact Analysis"),
    );

    return gistdexComment?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Create new comment on PR
 */
const createComment = async (
  context: GitHubContext,
  content: string,
): Promise<void> => {
  // Use gh pr comment for simpler interface
  executeGHCommand(
    ["pr", "comment", String(context.prNumber), "--body", content],
    {
      env: { GH_TOKEN: context.token },
    },
  );
};

/**
 * Update existing comment
 */
const updateComment = async (
  context: GitHubContext,
  commentId: number,
  content: string,
): Promise<void> => {
  const body = JSON.stringify({ body: content });

  executeGHCommand(
    [
      "api",
      `repos/${context.owner}/${context.repo}/issues/comments/${commentId}`,
      "--method",
      "PATCH",
      "--input",
      "-",
    ],
    {
      input: body,
      env: { GH_TOKEN: context.token },
    },
  );
};
