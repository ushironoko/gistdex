# Changelog

## [1.6.3] - 2025-09-25

- fix ducdb mcp tool


## [1.6.2] - 2025-09-24

- fix
- fix
- fix format
- fix document
- fix
- fix adapter-template
- refactor: bun-sqlite-adapter
- refactor sqlite-adapter


## [1.6.1] - 2025-09-24

- Merge pull request #137 from ushironoko/feature/refactor-adapters-and-fix-bugs
- fix: update AdapterFactory type to support async factories
- fix: resolve DuckDB adapter initialization and filter issues
- fix: properly release database connections in SQLite adapters close()
- refactor: migrate base-sqlite-adapter to use base-adapter pattern
- feat: add SQLiteStorageOperations abstraction for base adapter


## [1.6.0] - 2025-09-23

- Merge pull request #129 from ushironoko/feature/duckdb-adapter-and-benchmarks
- fix
- chore: ignore DuckDB data directory
- chore: update config to use DuckDB adapter
- feat: add automated benchmark execution scripts
- feat: add performance benchmark scripts
- test: add DuckDB support to test infrastructure
- feat: register DuckDB adapter in registry
- feat: implement DuckDB vector database adapter
- fix: prevent data loss in base adapter close method
- feat: add DuckDB dependencies
- handover
- fix ci
- fix test scripts
- fix
- fix document


## [1.5.3] - 2025-09-22

- Merge pull request #128 from ushironoko/docs/add-ci-documentation
- fix: restore main branch reference for reusable workflow
- fix: use PR branch reusable workflow temporarily
- fix: remove interactive init command from CI workflow
- fix: add required permissions for reusable workflow
- fix: use main branch reference for reusable workflow
- fix: correct Node.js minimum version requirement
- docs: add comprehensive CI integration documentation


## [1.5.2] - 2025-09-22

- Merge pull request #127 from ushironoko/feat/reusable-doc-impact-workflow
- fix README
- .
- feat: add reusable GitHub Actions workflow for documentation impact analysis


## [1.5.1] - 2025-09-22

- fix type
- remove ci doc enabled option
- fix CLAUDE.md
- refactor: chorefix
- fix readme
- Merge pull request #126 from ushironoko/feat/use-cli-in-workflow
- feat: update GitHub Actions workflow to use CLI directly (#118)
- Merge pull request #120 from ushironoko/feat/cli-stderr-output-phase1
- feat: improve CLI ci:doc command output handling
- fix CLAUDE.md


## [1.5.0] - 2025-09-21

- Merge pull request #115 from ushironoko/fix/ci-doc-analysis-improvements
- fix
- fix
- fix
- fix
- fix test
- handover
- fix!
- fix
- fix
- fix
- fix
- fix
- fix
- fix
- fix
- fix
- fix line
- fix run-doc-analysis scripts
- fix post-github-comment scripts
- handover
- refactor(ci): extract normalizeFilePath as shared function
- fix(ci): resolve NaN and path normalization issues in doc impact analysis
- fix ci
- feat(chunk): add line number tracking to chunks
- fix(ci): correct metadata path references in doc-service
- fix(ci): remove broken similarity-checker functionality
- fix CLAUDE.md
- Merge pull request #113 from ushironoko/feat/ci-doc-analysis
- refactor(security): replace all execSync with spawnSync to prevent command injection
- fix(ci): always post PR comment with analysis results
- fix(security): resolve command injection vulnerabilities in similarity-checker
- fix ci
- simplify: remove comment update logic, always create new PR comments
- refactor: simplify GitHub PR comment creation using gh pr comment
- cached
- simplify: use config defaults for CI doc analysis
- fix: redirect console output to stderr in CI doc service
- fix: use pnpm exec to run tsx in GitHub Actions
- feat: add standalone CI scripts for package separation
- feat: add public API for CI documentation impact analysis
- feat: add modular CI scripts for GitHub Actions
- refactor: simplify GitHub Actions workflow to use tsx directly
- WIP
- refactor: improve GitHub Actions workflow security and reliability
- fix: remove pnpm version conflict in GitHub Actions workflow
- add doc ci settings
- .
- test: skip failing CI doc-service tests temporarily
- add serena
- feat: add CI documentation impact analysis feature


## [1.4.3] - 2025-09-19

- Merge pull request #112 from ushironoko/feat/mcp-cache-checking
- refactor: reorder exports in package.json
- feat: register gistdx_read_cached tool in MCP server
- feat: add cache checking mechanism to gistdex_search tool
- feat: add gistdex_read_cached MCP tool for cache inspection
- chore:fix local test mcp name


## [1.4.2] - 2025-09-19

- Merge pull request #111 from ushironoko:refactor/deduplicate-list-analysis
- test: update tests to match refactored list implementations
- feat: enhance database schema for extension and source statistics
- refactor: use shared modules in CLI and MCP list implementations
- feat: add shared source and extension analysis logic
- feat: add shared type definitions for list operations


## [1.4.1] - 2025-09-18

- Merge pull request #110 from ushironoko/feature/github-glob-patterns-and-rate-limiting
- WIP
- fix test
- docs: update CLI and documentation for GitHub glob patterns
- feat: add GitHub API rate limit management and Tree API integration
- feat: add glob pattern support for GitHub repository indexing
- fix readme


## [1.4.0] - 2025-09-18

- Merge pull request #109 from ushironoko:feature/refactor-dependencies
- Merge consola migration
- Merge defu integration
- feat: migrate from chalk+ora to consola for unified console output
- feat: integrate defu library for configuration merging
- Merge pull request #108 from ushironoko/feature/testing-trophy-integration
- fix: address PR review comments
- fix: resolve CI issues after security fixes
- security: fix command injection vulnerabilities in CLI tests
- rename test dir
- fix ci
- refactor: move integration tests to weekly execution with real API
- test: fix integration test failures and improve mock embeddings
- style: fix biome linting issues
- fix: add missing embedding mocks to indexer tests
- test: separate CLI unit and integration tests
- fix: separate unit and integration tests in CI pipeline
- fix script
- security: resolve shell command injection vulnerabilities in CLI tests
- test: implement comprehensive testing improvements with TypeScript Project References
- write handover
- add gitignore
- config: split TypeScript configuration using Project References
- fix test
- test: improve test suite with Testing Trophy approach and reduce mocking by 20%
- docs: add comprehensive Testing Guidelines for Testing Trophy approach
- config: extend vitest to include tests/ directory
- test: add mock-free database service integration tests
- test: implement comprehensive integration tests for Testing Trophy
- test: add test infrastructure with helpers for Testing Trophy approach
- fix
- fix gistdex.config.ts


## [1.3.8] - 2025-09-17

- refactor:remove unused modules
- Merge pull request #107 from ushironoko:refactor/math-utils-and-mcp-improvements
- fix: resolve linter error in write-structured-tool type definition
- feat: enhance MCP tools with improved search workflow and structured knowledge
- refactor: migrate cosine similarity calculation to math-utils module
- feat: add math-utils module with cosine similarity and dot product optimizations
- fix docs
- remove doc


## [1.3.7] - 2025-09-16

- Merge pull request #106 from ushironoko/feat/improve-markdown-chunking-hierarchy
- feat: improve markdown chunking to preserve heading hierarchy


## [1.3.6] - 2025-09-15

- Merge pull request #104 from ushironoko/refactor/mcp-tools-simplification
- fix CLAUDE.md
- fix readme
- fix test
- add handover
- test(mcp): update query-chain tests and implementation
- refactor(mcp): simplify agent-query-tool implementation
- refactor(mcp): update server and utilities to use common modules
- refactor(mcp): remove complex agent-in-the-loop tools
- feat(mcp): add common utility modules for text processing and score analysis


## [1.3.5] - 2025-09-15

- Merge pull request #103 from ushironoko:feature/save-structured-knowledge
- update serena
- test(mcp): add comprehensive tests for saveStructured feature
- feat(mcp): implement saveStructured functionality in agent query tool
- feat(mcp): organize structured knowledge into subdirectories
- refactor(mcp): remove unused cache directory initialization
- feat(mcp): add saveStructured option to agent query tool


## [1.3.4] - 2025-09-15

- add pagination and summary for agent query
- fix handover


## [1.3.3] - 2025-09-14

- fix


## [1.3.2] - 2025-09-14

- fix agent_query


## [1.3.1] - 2025-09-14

- Merge pull request #97 from ushironoko:feat/agent-in-the-loop-improvements
- fix server
- add handover
- fix
- feat: add gistdex_agent_query tool for autonomous agent search
- feat: extend gistdex_query with analysis metadata (backward compatible)
- feat: add metadata generation utilities with Japanese support


## [1.3.0] - 2025-09-14

- Merge pull request #96 from ushironoko/feat/query-plan-phase2-timeout
- add readme
- remove test data
- refactor: remove legacy gistdex_query_plan tool
- feat: implement Agent in the Loop architecture for MCP tools
- fix .gistdex dir
- fix serena
- test: add MCP query plan test JSON files
- docs: update handover documentation with Phase 2 completion details
- feat: integrate gistdex_query_plan tool into MCP server
- feat: add queryPlanToolSchema with timeoutSeconds parameter
- feat: add comprehensive test coverage for query plan functionality
- feat: implement gistdex_query_plan MCP tool with timeout and DatabaseService integration
- add local mcp
- fix
- WIP
- fix


## [1.2.9] - 2025-09-12

- Merge pull request #95 from ushironoko/feature/incremental-cache-improvement
- fix test
- test: update tests for smart content merging functionality
- feat: implement incremental caching with updateStructuredKnowledge
- feat: implement smart content merging and update history tracking


## [1.2.8] - 2025-09-12

- fix


## [1.2.7] - 2025-09-12

- fix


## [1.2.6] - 2025-09-12

- fix(test): Skip query-chain tests when API key is not available
- Merge pull request #94 from ushironoko/feature/mcp-tool-enhancements
- fix
- add new handover
- chore: Serenaメモリファイルを更新
- docs(mcp): MCPサーバーのツール説明を更新
- feat(mcp): query-toolに構造化保存とチェーン機能を統合
- feat(mcp): クエリチェーン機能を追加
- feat(mcp): 構造化知識保存機能を追加
- fix
- test: update tests to reflect preserveBoundaries default change
- docs: add comprehensive MCP tool development best practices
- enhance: improve MCP tool descriptions and add initialization prompts
- feat: add query caching system for MCP tools
- feat: change preserveBoundaries default from false to true


## [1.2.5] - 2025-09-11

- Merge pull request #93 from ushironoko/feature/mcp-improvements
- fix type error
- docs: add MCP tool development best practices
- test: add comprehensive tests for section option and type coercion
- enhance(mcp): improve error handling in query tool
- improve(mcp): enhance boolean type coercion in validation schemas
- fix(mcp): add missing section option to query tool definition


## [1.2.4] - 2025-09-10

- fix
- fix
- Merge pull request #92 from ushironoko:feature/markdown-section-display
- fix
- test: add test data for markdown section functionality
- test: add comprehensive tests for markdown section display feature
- feat: add section option to MCP query tool
- feat: add --section CLI option for markdown section display
- feat: preserve boundary metadata during indexing
- feat: add markdown section display functionality to core
- Merge pull request #91 from ushironoko:fix/eliminate-any-types
- test: eliminate 'any' types from test files
- fix: replace 'any' with proper types in production code
- refactor: enable BiomeJS noExplicitAny rule


## [1.2.3] - 2025-09-09

- fix


## [1.2.2] - 2025-09-09




## [1.2.1] - 2025-09-09

- fix ci format
- remove NPM_TOKEN
- upgrade packages
- fix


## [1.2.0] - 2025-09-01

- Merge pull request #81 from ushironoko:feature/add-vue-support
- feat: add Vue SFC support for CST-based chunking


## [1.1.8] - 2025-08-31

- Merge pull request #80 from ushironoko/fix-export
- fix
- WIP


## [1.1.7] - 2025-08-31

- Merge pull request #79 from ushironoko:use-wasm-parser
- fix deps
- fix path
- fix use wasm-parser


## [1.1.6] - 2025-08-31

- Merge pull request #78 from ushironoko:fix-externals-2
- fix externals 2


## [1.1.5] - 2025-08-31

- Merge pull request #77 from ushironoko:fix-external-tree-sitter
- fix external
- fix


## [1.1.4] - 2025-08-28

- bugfic: mcp tool use


## [1.1.3] - 2025-08-28

- bugfix: p shorthand


## [1.1.2] - 2025-08-28

- bugfix: query


## [1.1.1] - 2025-08-28

- Merge pull request #76 from ushironoko:fix-help-commands-use-gunshi
- refactor: use gunshi's automatic help generation
- fix help commands
- fix document for how-it-works
- fix document in top


## [1.1.0] - 2025-08-27

- Merge pull request #75 from ushironoko:fix-init
- docs: update configuration and CLI documentation for .env file handling and API key management
- fix: update handleInit to conditionally create .env file based on API key input; add tests for API key scenarios
- Merge pull request #74 from ushironoko:fix-version-bump
- fix: reorder build step in release workflow


## [1.0.1] - 2025-08-27

- Merge pull request #73 from ushironoko:refactor-1
- fix: update import paths for database and search modules
- refactor
- fix format


## [1.0.0] - 2025-08-27

- Merge pull request #72 from ushironoko:refactor-sqlite-schemas
- fix README
- refactor: implement base SQLite adapter for unified vector database operations
- refactor: consolidate SQLite adapter utilities and schema definitions
- Merge pull request #71 from ushironoko:fix-v1-document
- Refactor configuration documentation and enhance chunking strategies
- Merge pull request #70 from ushironoko:support-define-gistdex-config
- refactor: migrate configuration to TypeScript, update related documentation
- Merge pull request #69 from ushironoko:deprecated-env-cconfig-loader
- refactor: remove environment variable support for configuration, update documentation
- Merge pull request #68 from ushironoko:remove-douto-chunk-optimize
- refactor: remove auto-chunk-optimize option and streamline chunking logic


## [0.11.0] - 2025-08-26

- Merge pull request #67 from ushironoko/auto-chunk-optimization
- fix: update imports and mock fetch in tests, improve type exports
- add tree-sitter based chunkings
- remove unused type import
- fix ext
- feat: add auto-chunk optimization and boundary preservation options
- fix
- fix documents
- fix .mcp.json
- fix docs
- fix Documents


## [0.10.1] - 2025-08-25

- fix test
- feat: Run main function immediately for compatibility with bunx, npx, and direct execution
- fix


## [0.10.0] - 2025-08-25

- Merge pull request #59 from ushironoko/support-bun-sqlite
- fix
- feat(security): Enhance file path validation to handle symbolic links consistently
- fix
- fix
- Refactor code structure for improved readability and maintainability
- fix theme for docs


## [0.9.4] - 2025-08-24

- remove engines
- remove engine-strict
- Merge pull request #57 from ushironoko/add-vitepress-docs
- fix
- Add comprehensive documentation for Gistdex


## [0.9.3] - 2025-08-23

- add .exmaple


## [0.9.2] - 2025-08-23

- fix
- fix mcp.json


## [0.9.1] - 2025-08-18

- fix: prevent process exit on MCP server start failure


## [0.9.0] - 2025-08-18

- Merge pull request #56 from ushironoko:revert-pr-55-new-bin-mcp-server
- Revert "Merge pull request #55 from ushironoko:new-bin-mcp-server"


## [0.8.0] - 2025-08-18

- Merge pull request #55 from ushironoko:new-bin-mcp-server
- feat: introduce dedicated MCP server binary and update CLI commands
- Merge pull request #54 from ushironoko:refactor-code-diet
- refactor: remove unused functions and clean up code in CLI utilities


## [0.7.5] - 2025-08-17

- fix
- fix


## [0.7.4] - 2025-08-17

- Merge pull request #53 from ushironoko:fix-mcp-server-retry
- fix format
- refactor: remove unused noop utility and improve error handling in MCP server


## [0.7.3] - 2025-08-17

- fix: disable debug output in CLI to ensure clean MCP communication
- fix: remove debug output from MCP mode to prevent stdout pollution


## [0.7.1] - 2025-08-17

- Merge pull request #52 from ushironoko:fix-mcp-server
- fix mcp server keep alive


## [0.7.0] - 2025-08-17

- Merge pull request #51 from ushironoko:restore-better-sqlite3
- Refactor CLI and MCP server handling


## [0.6.6] - 2025-08-17

- DEBUG


## [0.6.5] - 2025-08-17

- fix


## [0.6.4] - 2025-08-17

- fix


## [0.6.3] - 2025-08-17

- fix format
- fix


## [0.6.2] - 2025-08-17

- fix error


## [0.6.1] - 2025-08-17

- fix


## [0.6.0] - 2025-08-17

- Merge pull request #50 from ushironoko:migrate-better-sqlite3
- fix noop log
- fix mcp server&migrate better-sqlite3


## [0.5.4] - 2025-08-16

- fix mcp


## [0.5.3] - 2025-08-16

- fix: remove console.log from MCP server startup to prevent JSON-RPC interference
- fix: remove console.log from MCP server startup to prevent JSON-RPC interference
- fix: add dedicated gistdex-mcp binary for stable MCP server startup


## [0.5.2] - 2025-08-16

- chore: release v0.5.1
- fix: remove --no-warnings from shebang for better compatibility


## [0.5.0] - 2025-08-16

- Merge pull request #49 from ushironoko:support-mcp-for-local
- support mcp
- fix load env
- fix README


## [0.4.1] - 2025-08-15

- fix README


## [0.4.0] - 2025-08-15

- Merge pull request #48 from ushironoko:refactor-commands
- refactor commands
- Merge pull request #47 from ushironoko:support-version-command
- feat: add version command and display CLI version
- Merge pull request #46 from ushironoko:refactor-gunshi-subcommands
- refactor subcommands


## [0.3.0] - 2025-08-15

- Merge pull request #45 from ushironoko:refactor-original-contents
- fix
- fix format
- feat: enhance document metadata and original content handling in SQLite adapter


## [0.2.0] - 2025-08-15

- Merge pull request #44 from ushironoko:support-original-content
- support show original contents&full
- fix format


## [0.1.4] - 2025-08-15

- Merge pull request #43 from ushironoko:fix-gunshi-use-define
- fix:use define for gunshi


## [0.1.3] - 2025-08-14

- Merge pull request #42 from ushironoko/revert-40-add-claude-md-update-workflow
- fix format
- Revert "add workflow for CLAUDE.md update"


## [0.1.2] - 2025-08-14

- Merge pull request #41 from ushironoko/migrate-to-gunshi
- refactor
- migrate to gunshi cli
- fix format
- Merge pull request #40 from ushironoko/add-claude-md-update-workflow
- add workflow for CLAUDE.md update


## [0.1.1] - 2025-08-14

- Merge pull request #39 from ushironoko/migrate-to-tsdown
- migrate to tsdown
- Merge pull request #38 from ushironoko/claude/issue-36-20250813-0440
- fix format
- fix package
- feat: migrate from tsc to tsgo
- fix format
- fix README


## [0.1.0] - 2025-08-12

- Merge pull request #33 from ushironoko/refactor-cli-helpers
- refactor cli helpers
- Merge pull request #32 from ushironoko/support-bulk-index
- fix extensions
- add test
- support indexFiles
- Merge pull request #31 from ushironoko/fix-security-review
- fix format
- fix security review workflow


## [0.0.2] - 2025-08-12

- Merge pull request #30 from ushironoko/rename-brand
- fix format
- rename
- fix CLAUDE.md
- chore: release v2.1.1
- fix README
- chore: release v2.1.0
- Merge pull request #29 from ushironoko/fix-custom-adapter
- fix memories
- fix custom adapter
- fix
- chore: release v2.0.0
- chore: release v1.0.0
- Merge pull request #27 from ushironoko/publish-workflow
- fix
- add publish workflow
- fix embedding model
- fix readme
- Merge pull request #26 from ushironoko/refactor-remove-singleton-patterns
- refactor
- fix
- add TODO comments
- Merge pull request #25 from ushironoko/refactor-replace-singleton-to-composition
- refactor
- fix init command
- fix help
- Merge pull request #22 from ushironoko/refactor-move-functional-adapters
- fix tests
- fix DOCUMENT
- refactor functional adapter
- Merge pull request #17 from ushironoko/claude/issue-14-20250810-1131
- fix format
- fix: pnpm/action-setupのバージョン重複エラーを修正
- chore: npmからpnpmへの移行とCI最適化
- pnpm i
- Merge branch 'main' into claude/issue-14-20250810-1131
- refactor: CLIコマンドをmodular構造に分割してテストカバレッジを改善
- Add comprehensive unit tests for CLI functions
- feat: update Node.js version references to 24.2.0
- fix model
- remove
- fix sqlite-vec load
- Merge pull request #15 from ushironoko/fix-lint
- Merge branch 'main' into fix-lint
- fix env
- fix env
- fix lint
- fix class
- fix lint
- fix node version ref
- Merge pull request #13 from ushironoko/support-sqlite
- fix sqlite support
- fix
- fix node version
- fix
- Merge pull request #11 from ushironoko/refactor-similarity-ts
- Merge branch 'main' into refactor-similarity-ts
- add CLAUDE.md
- fix import
- Merge branch 'main' into refactor-similarity-ts
- Merge pull request #8 from ushironoko/dependabot/npm_and_yarn/ai-dependencies-4aa45821b7
- refactor:use similarity-ts
- upgrade node version
- chore(deps): bump the ai-dependencies group with 2 updates
- add init command
- fix type check
- fix node version
- setting workflow
- Merge pull request #6 from ushironoko/claude/issue-3-20250809-1447
- feat: add path security validation and URL whitelisting
- Merge pull request #2 from ushironoko/claude/issue-1-20250809-1132
- docs: remove v2 references from README
- Remove v1 implementation and make v2 the default
- Create claude.yml
- first commit

