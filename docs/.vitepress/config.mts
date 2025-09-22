import { defineConfig } from 'vitepress'
import { groupIconMdPlugin, groupIconVitePlugin, localIconLoader } from 'vitepress-plugin-group-icons'
import llmstxt from 'vitepress-plugin-llms'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Gistdex",
  description: "A semantic search and indexing tool for developers",
  base: '/',
  lastUpdated: true,
  cleanUrls: true,
  
  head: [
    ['meta', { name: 'theme-color', content: '#3c8772' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'Gistdex | Semantic Search Tool' }],
    ['meta', { property: 'og:site_name', content: 'Gistdex' }],
    ['meta', { property: 'og:description', content: 'A powerful CLI tool for indexing and searching content using vector databases' }]
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'CLI Reference', link: '/reference/cli' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          collapsed: false,
          items: [
            { text: 'What is Gistdex?', link: '/guide/what-is-gistdex' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' }
          ]
        },
        {
          text: 'Core Concepts',
          collapsed: false,
          items: [
            { text: 'How It Works', link: '/guide/how-it-works' }
          ]
        },
        {
          text: 'Configuration',
          collapsed: false,
          items: [
            { text: 'Configuration Overview', link: '/guide/configuration' }
          ]
        },
        {
          text: 'Usage',
          collapsed: false,
          items: [
            { text: 'Indexing Content', link: '/guide/indexing' },
            { text: 'Searching', link: '/guide/searching' }
          ]
        },
        {
          text: 'Integrations',
          collapsed: false,
          items: [
            { text: 'Claude Code (MCP)', link: '/guide/mcp' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          collapsed: false,
          items: [
            { text: 'CLI Commands', link: '/reference/cli' },
            { text: 'CI Integration', link: '/reference/ci' },
            { text: 'Troubleshooting', link: '/reference/troubleshooting' }
          ]
        }
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ushironoko/gistdex' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@ushironoko/gistdex' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present ushironoko'
    },

    editLink: {
      pattern: 'https://github.com/ushironoko/gistdex/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3],
      label: 'On this page'
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    config(md) {
      md.use(groupIconMdPlugin)
    }
  },

  vite: {
    plugins: [
      llmstxt({
        // LLMs plugin options (optional, defaults work well)
      }),
      groupIconVitePlugin({
        customIcon: {
          // Package managers
          'npm': 'vscode-icons:file-type-npm',
          'pnpm': 'vscode-icons:file-type-light-pnpm',
          'yarn': 'vscode-icons:file-type-yarn',
          
          // File types and tools
          'pdf': 'vscode-icons:file-type-pdf2',
          'office': 'vscode-icons:file-type-word',
          'web': 'vscode-icons:file-type-html',
          'api': 'vscode-icons:file-type-rest',
          'git': 'vscode-icons:file-type-git',
          'rss': 'vscode-icons:file-type-xml',
          'json': 'vscode-icons:file-type-json',
          'bash': 'vscode-icons:file-type-shell',
          'javascript': 'vscode-icons:file-type-js-official',
          'typescript': 'vscode-icons:file-type-typescript-official',
          
          // Configuration types
          'config.js': 'vscode-icons:file-type-js-official',
          'config.ts': 'vscode-icons:file-type-typescript-official',
          '.env': 'vscode-icons:file-type-dotenv',
          'minimal': 'vscode-icons:file-type-light-config',
          'full': 'vscode-icons:file-type-config',
          
          // Custom categories
          'files': 'vscode-icons:default-folder-opened',
          'github': 'vscode-icons:file-type-github',
          'gists': 'vscode-icons:file-type-light-gist',
          'text': 'vscode-icons:file-type-text',
          'search': 'vscode-icons:file-type-search-result',
          'code': 'vscode-icons:file-type-code',
          'docs': 'vscode-icons:file-type-markdown',
          'script': 'vscode-icons:file-type-shell'
        }
      })
    ]
  }
})