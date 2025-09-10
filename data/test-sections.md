# VitePress Configuration Guide

This guide covers the configuration of VitePress for documentation sites.

## Installation

To install VitePress, you need to have Node.js version 18 or higher.

```bash
npm install -D vitepress
```

You can also use pnpm or yarn:

```bash
pnpm add -D vitepress
# or
yarn add -D vitepress
```

## Basic Configuration

VitePress uses a configuration file located at `.vitepress/config.js` or `.vitepress/config.ts`.

### Site Configuration

The most basic configuration includes the site title and description:

```javascript
export default {
  title: 'My Documentation',
  description: 'A VitePress Site'
}
```

### Theme Configuration

You can customize the theme with various options:

```javascript
export default {
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Configuration', link: '/configuration' }
        ]
      }
    ]
  }
}
```

## Advanced Features

VitePress provides many advanced features for documentation sites.

### Search

You can enable local search with minimal configuration:

```javascript
export default {
  themeConfig: {
    search: {
      provider: 'local'
    }
  }
}
```

### Internationalization

VitePress supports multiple languages out of the box:

```javascript
export default {
  locales: {
    root: {
      label: 'English',
      lang: 'en'
    },
    fr: {
      label: 'Français',
      lang: 'fr'
    }
  }
}
```

## Deployment

VitePress sites can be deployed to various platforms.

### GitHub Pages

To deploy to GitHub Pages, create a workflow file:

```yaml
name: Deploy VitePress site to Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run docs:build
      - uses: actions/upload-pages-artifact@v2
        with:
          path: docs/.vitepress/dist
      - uses: actions/deploy-pages@v2
```

### Netlify

For Netlify deployment, add a `netlify.toml` file:

```toml
[build]
  command = "npm run docs:build"
  publish = "docs/.vitepress/dist"
```

## Troubleshooting

Common issues and their solutions.

### Build Errors

If you encounter build errors, try clearing the cache:

```bash
rm -rf .vitepress/cache
rm -rf .vitepress/dist
```

### Development Server Issues

For development server problems, check your Node.js version:

```bash
node --version
```

Make sure it's version 18 or higher.