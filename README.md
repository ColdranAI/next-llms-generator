# Next.js LLMS.TXT Generator

<img width="900" height="412" alt="image" src="https://github.com/user-attachments/assets/953d68d1-12f8-43b7-87ef-08b46fc45f6d" />


> Generate LLM-friendly text files from Next.js applications

[![npm version](https://badge.fury.io/js/next-llms-generator.svg)](https://badge.fury.io/js/next-llms-generator)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Automatically generates LLM-friendly content from Next.js applications by crawling sitemaps and extracting clean content.

## Installation

```bash
npm install next-llms-generator
```

## Basic Usage

Create a route handler:

```typescript
// app/llms.txt/route.ts
export { GET } from "next-llms-generator/route";
```

Access your content at `/llms.txt` - that's it!

## Advanced Usage

### Custom Configuration

```typescript
// app/llms.txt/route.ts
import { createGET } from "next-llms-generator/route";

export const GET = createGET({
  generatorOptions: {
    maxPages: 1000,
    excludePatterns: [/\/admin\//i, /\/api\//i],
    includePatterns: [/\/blog\//i, /\/docs\//i],
    stripSelectors: ['header', 'footer', 'nav'],
    headerTitle: 'My Site'
  },
  enableCache: true,
  cacheTtl: 60
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
```

### Environment Variables

```env
NEXT_PUBLIC_SITE_URL=https://example.com
LLMS_MAX_PAGES=1000
```

## Key Options

- `maxPages`: Maximum pages to crawl (default: 5000)
- `includePatterns`: URL patterns to include (e.g., `/\/blog\//i`)
- `excludePatterns`: URL patterns to exclude (e.g., `/\/admin\//i`)
- `stripSelectors`: CSS selectors to remove (e.g., `['header', 'footer']`)
- `enableCache`: Enable response caching (default: true)
- `cacheTtl`: Cache duration in minutes (default: 60)

## Static Generation
Add this script in `package.json`.
```json
{
  "scripts": {
    "postbuild": "next-llms-generator"
  }
}
```

Built with Love by [Coldran](https://coldran.com)
