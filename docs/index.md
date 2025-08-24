---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Gistdex"
  text: "Semantic Search & Indexing"
  tagline: "CLI tool for indexing and searching content using vector databases"
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/ushironoko/gistdex

features:
  - icon: 🔍
    title: Semantic Search
    details: Search indexed content using natural language queries with Google's text-embedding-004 model
  - icon: 📚
    title: Multi-Source Indexing
    details: Index content from GitHub Gists, repositories, local files, or plain text
  - icon: 🚀
    title: Local Storage
    details: Uses SQLite with sqlite-vec extension for local vector storage
  - icon: 🤖
    title: MCP Support
    details: Integrate with Claude Code through Model Context Protocol
  - icon: 🔧
    title: Extensible Design
    details: Support for custom vector database adapters through plugin system
  - icon: 💡
    title: Configurable Chunking
    details: Adjust chunk size and overlap based on your content type
---

## Quick Start

Use Gistdex without installation:

```bash
# Using npx (recommended)
npx @ushironoko/gistdex --help

# Using pnpm dlx
pnpm dlx @ushironoko/gistdex --help
```

### Claude Code Integration

Add Gistdex to Claude Code with one command:

```bash
claude mcp add gistdex -- npx @ushironoko/gistdex --mcp
```

### Basic Usage

Initialize the database:

```bash
npx @ushironoko/gistdex init
```

Index your first content:

```bash
# Index a GitHub Gist
npx @ushironoko/gistdex index --gist https://gist.github.com/username/gist-id

# Index local files
npx @ushironoko/gistdex index --files "src/**/*.ts"

# Search indexed content
npx @ushironoko/gistdex query "how to implement authentication"
```

## Why Gistdex?

Gistdex uses semantic search to find content based on meaning rather than exact keywords. It indexes your code snippets, documentation, and text files for natural language queries.

### Features

- **Local Storage**: Data stays on your machine using SQLite
- **MCP Server**: Works with Claude Code through Model Context Protocol
- **CLI Interface**: Command-line tool with standard Unix conventions
- **Multiple Backends**: SQLite by default, extensible to other databases
- **Open Source**: MIT licensed
