# Searching

Gistdex uses semantic search to find content based on meaning.

## Basic Search

```bash
npx @ushironoko/gistdex query "how to handle errors"
```

Returns top 5 results by default.

## Search Options

### Number of Results (-k)

```bash
# Get 10 results
npx @ushironoko/gistdex query -k 10 "authentication"

# Get just 1 result
npx @ushironoko/gistdex query -k 1 "database config"
```

### Full Content (-f, --full)

Show complete original content instead of snippets:

```bash
npx @ushironoko/gistdex query --full "react hooks"
```

### Section Content (-s, --section)

For markdown files, retrieve the complete section containing the match:

```bash
npx @ushironoko/gistdex query --section "installation guide"
```

This option:
- Returns the entire markdown section (heading and all content under it)
- Preserves document structure and context
- Cannot be used together with `--full`

### Filter by Type (-t, --type)

Filter by source type (gist, github, file, text):

```bash
npx @ushironoko/gistdex query --type gist "utility functions"
npx @ushironoko/gistdex query --type file "TODO"
```

### Hybrid Search (-y, --hybrid)

Combine semantic search with simple word matching:

```bash
npx @ushironoko/gistdex query --hybrid "useState React"
```

Note: Hybrid search does basic word matching (no stemming or phrase search).

### Disable Re-ranking (-n, --no-rerank)

Skip re-ranking for faster results:

```bash
npx @ushironoko/gistdex query --no-rerank "quick search"
```

## How Search Works

### Semantic Search
- Converts your query to a vector
- Finds similar vectors in the database
- Returns results based on meaning, not just keywords

### Hybrid Mode
- Performs semantic search first
- Counts how many query words appear in results
- Combines scores: 70% semantic, 30% word matching

### Scoring
- Range: 0.0 to 1.0+ (higher is better)
- Scores above 0.7 are generally good matches
- Re-ranking may boost relevant results

## Output Format

### Default Output
```
1. /path/to/file.ts
   Score: 0.865
   Type: file
   | function handleError(error) {
   |   console.error(error);
   | }
```

### With --full Flag
Shows complete original content instead of chunks.

### With --section Flag
Shows the complete markdown section, including heading information.

## Troubleshooting

### No Results
- Check if content is indexed: `npx @ushironoko/gistdex list`
- Try broader search terms
- Remove type filters

### Poor Results
- Add more context to your query
- Try `--hybrid` for specific terms
- Consider re-indexing with different chunk sizes

### Slow Search
- Use `--no-rerank` for faster results
- Reduce result count with `-k`

## Examples

```bash
# Find code examples
npx @ushironoko/gistdex query "async await error handling"

# Get specific implementation
npx @ushironoko/gistdex query -k 1 --full "database connection"

# Search only in files
npx @ushironoko/gistdex query --type file "configuration"

# Fast search without re-ranking
npx @ushironoko/gistdex query -k 20 --no-rerank "common patterns"
```

## See Also

- [Indexing Content](./indexing.md)
- [CLI Reference](../reference/cli.md)