# next-llms-generator

> Generate LLM-friendly text files from Next.js applications

[![npm version](https://badge.fury.io/js/next-llms-generator.svg)](https://badge.fury.io/js/next-llms-generator)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Automatically generates LLM-friendly content from Next.js applications by crawling sitemaps and extracting clean content using Mozilla Readability.

**Features**: Zero config setup, route handlers, static generation, TypeScript support, concurrent processing, flexible filtering, caching, and robust error handling.

## Installation

```bash
npm install next-llms-generator
# or
yarn add next-llms-generator
# or
pnpm add next-llms-generator
```

## Quick Start

### Option 1: Route Handler (Recommended)

Create a route handler that serves your LLM content dynamically:

```typescript
// app/llms.txt/route.ts
export { GET } from "next-llms-generator/route";
```

That's it! Your LLM content will be available at `/llms.txt`.

> **Note**: The package automatically configures the route for dynamic rendering (`dynamic = 'force-dynamic'` and `revalidate = 0`) to ensure the content is generated fresh on each request. This is essential for the sitemap crawling to work properly at runtime.

**Optional**: Set your site URL in environment variables:

```env
NEXT_PUBLIC_SITE_URL=https://example.com
```

### Option 2: Static File Generation

Generate a static file during build:

```json
// package.json
{
  "scripts": {
    "build": "next build",
    "postbuild": "next-llms-generator"
  }
}
```

This creates `public/llms.txt` after each build.

## Dynamic Rendering

The package automatically configures routes for dynamic rendering to ensure sitemap crawling works at runtime (not during build when the server isn't available).

```typescript
// Automatic configuration
export { GET } from "next-llms-generator/route";
```

## Advanced Usage

### Custom Route Configuration

```typescript
// app/llms.txt/route.ts
import { createGET } from "next-llms-generator/route";

export const GET = createGET({
  generatorOptions: {
    maxPages: 2000,
    excludePatterns: [/\/admin\//i, /\/api\//i],
    includePatterns: [/\/blog\//i, /\/docs\//i],
    stripSelectors: ['header', 'footer', 'nav', '.sidebar'],
    concurrency: 10,
    headerTitle: 'My Amazing Site',
    headerSummary: 'Complete documentation and blog content'
  },
  enableCache: true,
  cacheTtl: 120, // 2 hours
  enableRevalidation: true,
  revalidationSecret: process.env.REVALIDATION_SECRET
});
```

### Programmatic Usage

```typescript
import { LLMSGenerator } from "next-llms-generator/generate";

const generator = new LLMSGenerator({
  siteUrl: 'https://example.com',
  maxPages: 1000
});

const content = await generator.generate();
```

### CLI Usage

```bash
next-llms-generator
next-llms-generator --output dist/content.txt
next-llms-generator --config llms.config.js
```

### Configuration File

```javascript
// llms.config.js
export default {
  siteUrl: 'https://example.com',
  maxPages: 1000,
  excludePatterns: [/\/admin\//i, /\/api\//i],
  includePatterns: [/\/blog\//i, /\/docs\//i],
  stripSelectors: ['header', 'footer', 'nav']
};
```

## Configuration Options

### GeneratorOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `siteUrl` | `string` | `NEXT_PUBLIC_SITE_URL` | Base URL of the site to crawl |
| `sitemapUrl` | `string` | `${siteUrl}/sitemap.xml` | URL to the sitemap.xml file |
| `maxPages` | `number` | `5000` | Maximum number of pages to crawl |
| `concurrency` | `number` | `5` | Number of concurrent requests |
| `includePatterns` | `(string\|RegExp)[]` | `[]` | Patterns to include (allow-list) |
| `excludePatterns` | `(string\|RegExp)[]` | `[]` | Patterns to exclude (block-list) |
| `stripSelectors` | `string[]` | `['header', 'footer', 'nav', ...]` | CSS selectors to remove |
| `headerTitle` | `string` | `package.json name` | Title for the generated document |
| `headerSummary` | `string` | `package.json description` | Summary for the generated document |
| `userAgent` | `string` | `next-llms-generator/0.1.0` | Custom user agent for requests |
| `timeout` | `number` | `10000` | Request timeout in milliseconds |
| `respectRobots` | `boolean` | `false` | Whether to respect robots.txt |
| `customHeaders` | `Record<string, string>` | `{}` | Custom headers for requests |



### Route Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCache` | `boolean` | `true` | Enable response caching |
| `cacheTtl` | `number` | `60` | Cache TTL in minutes |
| `enableRevalidation` | `boolean` | `false` | Enable cache revalidation |
| `revalidationSecret` | `string` | `undefined` | Secret for revalidation |
| `responseHeaders` | `Record<string, string>` | `{}` | Custom response headers |

## Environment Variables

| Variable | Description | Example |
|----------|-------------|----------|
| `NEXT_PUBLIC_SITE_URL` | Site URL to crawl | `https://example.com` |
| `LLMS_MAX_PAGES` | Maximum pages to process | `1000` |
| `LLMS_CONCURRENCY` | Concurrent requests | `8` |

## API Reference

### Classes

#### `LLMSGenerator`

Main class for generating LLM content.

```typescript
const generator = new LLMSGenerator(options);
const content = await generator.generate();
```

#### `ConsoleLogger`

Built-in logger with configurable levels.

```typescript
const logger = new ConsoleLogger('debug'); // 'debug' | 'info' | 'warn' | 'error'
```

### Functions

#### `generateFullLLMS(options)`

Convenience function for one-off generation.

```typescript
import { generateFullLLMS } from "next-llms-generator/generate";

const content = await generateFullLLMS({
  siteUrl: 'https://example.com',
  maxPages: 500
});
```

#### `createGET(config)`

Create a custom Next.js route handler.

```typescript
import { createGET } from "next-llms-generator/route";

export const GET = createGET({
  generatorOptions: { maxPages: 1000 },
  enableCache: true
});
```

## Examples

```typescript
// Blog site
export const GET = createGET({
  generatorOptions: {
    includePatterns: [/\/blog\//i],
    stripSelectors: ['.author-bio', '.comments']
  }
});

// Documentation site
export const GET = createGET({
  generatorOptions: {
    includePatterns: [/\/docs\//i],
    stripSelectors: ['.toc', '.edit-page']
  }
});
```

## Best Practices

- Use specific include/exclude patterns
- Remove navigation and UI elements with stripSelectors
- Always exclude admin and API routes
- Enable caching for better performance

## Troubleshooting

- **"siteUrl not set"**: Set `NEXT_PUBLIC_SITE_URL` environment variable
- **Empty content**: Check sitemap.xml accessibility and patterns
- **Large files**: Reduce maxPages or add exclude patterns

Built with Love by [Coldran](https://coldran.com)