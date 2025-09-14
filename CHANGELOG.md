# Changelog

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

