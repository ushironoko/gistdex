# CI Integration (Experimental)

::: warning Experimental Feature
This feature is experimental and may undergo breaking changes in future versions.
:::

## Documentation Impact Analysis

The `ci:doc` command analyzes how code changes might affect documentation. It extracts symbols from git diffs and searches for related documentation that may need updating.

## Usage

### Basic Command

```bash
npx gistdex ci:doc
```

By default, this analyzes changes in `HEAD~1` (the last commit) and searches for documentation in `docs/**/*.md` and `README.md`.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--diff <range>` | Git diff range to analyze | `HEAD~1` |
| `--threshold <value>` | Similarity threshold (0-1) | `0.7` |
| `--paths <patterns>` | Comma-separated document glob patterns | `docs/**/*.md,README.md` |
| `--format <type>` | Output format: `json` or `github-comment` | `github-comment` |
| `--github-pr` | Post results directly to GitHub PR | `false` |
| `--verbose` | Enable detailed debug output | `false` |
| `--provider <name>` | Vector database provider | (from config) |
| `--db-path <path>` | Vector database path | (from config) |

### Examples

#### Analyze specific commit range

```bash
# Analyze changes between main and current branch
npx gistdex ci:doc --diff main..HEAD

# Analyze last 5 commits
npx gistdex ci:doc --diff HEAD~5
```

#### Custom document paths

```bash
# Check specific documentation directories
npx gistdex ci:doc --paths "docs/**/*.md,api/**/*.md,*.md"

# Only check README files
npx gistdex ci:doc --paths "**/*README.md"
```

#### Adjust similarity threshold

```bash
# Higher threshold for more precise matches
npx gistdex ci:doc --threshold 0.8

# Lower threshold for broader coverage
npx gistdex ci:doc --threshold 0.5
```

#### Output formats

```bash
# JSON output (default)
npx gistdex ci:doc --format json

# GitHub PR comment format
npx gistdex ci:doc --format github-comment
```

## GitHub Actions Integration

### Basic Setup (Recommended)

Use the reusable workflow for easy integration:

Create `.github/workflows/doc-impact.yml`:

```yaml
name: Documentation Impact Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  analyze-docs:
    uses: ushironoko/gistdex/.github/workflows/reusable-doc-impact.yml@main
    with:
      threshold: "0.7"  # Sensitivity (0-1)
      doc-paths: "docs/**/*.md,README.md"  # Document patterns
      node-version: "24"  # Node.js version
      gistdex-version: "1.5.0"  # Pin Gistdex version
      add-label: true  # Add PR label
    secrets:
      GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
```

This reusable workflow automatically:
- Analyzes code changes for documentation impact
- Posts formatted comments to the pull request
- Adds a "📚 docs-impact" label when documentation needs review
- Handles all setup and configuration

### Custom Setup (Advanced)

For custom workflows, create your own action:

```yaml
name: Documentation Impact Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for git diff

      - uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Analyze Documentation Impact
        env:
          GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          npx @ushironoko/gistdex ci:doc \
            --diff ${{ github.event.pull_request.base.sha }}..${{ github.event.pull_request.head.sha }} \
            --github-pr \
            --format github-comment
```

### Configuration with gistdex.config.ts

You can configure default settings in your `gistdex.config.ts`:

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  ci: {
    doc: {
      threshold: 0.7,
      documentPaths: ["docs/**/*.md", "README.md", "API.md"]
    }
  },
  // ... other configuration
});
```

## How It Works

### Symbol Extraction

The analysis extracts symbols from code changes using tree-sitter parsers, supporting:

- JavaScript (.js, .jsx, .mjs, .cjs)
- TypeScript (.ts, .tsx, .mts)
- Python (.py)
- Go (.go)
- Rust (.rs)
- Java (.java)
- Ruby (.rb)
- C/C++ (.c, .cpp, .h)
- HTML (.html)
- CSS (.css, .scss, .sass)
- Bash (.sh, .bash)
- Vue (.vue)

### Search Process

1. **Git Diff Analysis**: Extracts changed files and modifications
2. **Symbol Extraction**: Identifies functions, classes, and other code entities
3. **Query Generation**: Creates search queries from extracted symbols
4. **Semantic Search**: Searches indexed documentation using hybrid search
5. **Impact Assessment**: Ranks results by similarity score

### Output Formats

#### JSON Format

Returns structured data with:
- File paths
- Similarity scores
- Matched search terms
- GitHub URLs with line numbers

```json
{
  "file": "docs/guide/configuration.md",
  "similarity": 0.85,
  "matchedTerms": ["createConfig", "loadConfig"],
  "changeType": "modified",
  "startLine": 42,
  "endLine": 58,
  "githubUrl": "https://github.com/user/repo/blob/main/docs/guide/configuration.md#L42-L58"
}
```

#### GitHub Comment Format

Generates markdown formatted comments with:
- Impact levels (High/Medium/Low)
- File links with line numbers
- Summary statistics
- Matched terms for transparency

Example output:

```markdown
## 📚 Documentation Impact Analysis

### 🔴 High Impact (>80% similarity)

- 📝 [`docs/api/config.md`](https://github.com/user/repo/blob/main/docs/api/config.md#L15-L45) - 92% match
  Matched: `createConfig`, `ConfigOptions`

### 🟡 Medium Impact (50-80% similarity)

- 📝 [`README.md`](https://github.com/user/repo/blob/main/README.md#L120) - 65% match
  Matched: `configuration`

---

📊 **Summary**: 2 documentation files may need review
🎯 **Threshold**: 70%

_Generated by [Gistdex CI](https://github.com/ushironoko/gistdex)_
```

## Requirements

- Node.js 24.2.0 or later
- Git repository with history
- `GOOGLE_GENERATIVE_AI_API_KEY` environment variable
- For GitHub PR integration:
  - `GITHUB_TOKEN` with PR write permissions
  - GitHub CLI (`gh`) available in the environment

## Troubleshooting

### No changes detected

If the analysis reports no changes:
- Verify the diff range is correct
- Ensure git history is available (`fetch-depth: 0` in GitHub Actions)
- Check that the repository has the specified commits

### Documents not found

If no documentation matches are found:
- Verify document paths match your glob patterns
- Ensure documents are indexed (happens automatically)
- Consider lowering the threshold value

### GitHub PR posting fails

If posting to GitHub PR fails:
- Verify `GITHUB_TOKEN` has write permissions
- Ensure the workflow runs in pull request context
- Check that GitHub CLI is available

## Limitations

- Requires indexing documentation first (happens automatically)
- Symbol extraction quality depends on code structure
- Large diffs may take longer to analyze
- GitHub PR integration requires appropriate permissions