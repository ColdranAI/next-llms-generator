import { NextResponse } from "next/server";
import { LLMSGenerator } from "./generate.js";
import type { GeneratorOptions, ExtendedGeneratorOptions } from "./types.js";

/**
 * Cache for generated content to avoid regenerating on every request
 */
class ContentCache {
  private cache = new Map<string, { content: string; timestamp: number }>();
  private readonly ttl: number;

  constructor(ttlMinutes = 60) {
    this.ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > this.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.content;
  }

  set(key: string, content: string): void {
    this.cache.set(key, {
      content,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Global cache instance
 */
const globalCache = new ContentCache();

/**
 * Route handler configuration
 */
export interface RouteConfig {
  /** Generator options */
  generatorOptions?: ExtendedGeneratorOptions;
  
  /** Cache TTL in minutes (default: 60) */
  cacheTtl?: number;
  
  /** Whether to enable caching (default: true) */
  enableCache?: boolean;
  
  /** Custom cache key generator */
  cacheKeyGenerator?: (options: ExtendedGeneratorOptions) => string;
  
  /** Custom response headers */
  responseHeaders?: Record<string, string>;
  
  /** Whether to enable revalidation via query parameter (default: false) */
  enableRevalidation?: boolean;
  
  /** Revalidation secret for security (required if enableRevalidation is true) */
  revalidationSecret?: string;
}

/**
 * Create a GET handler with custom configuration
 */
export function createGET(config: RouteConfig = {}): () => Promise<NextResponse> {
  const {
    generatorOptions = {},
    cacheTtl = 60,
    enableCache = true,
    cacheKeyGenerator = defaultCacheKeyGenerator,
    responseHeaders = {},
    enableRevalidation = false,
    revalidationSecret
  } = config;

  // Validate revalidation configuration
  if (enableRevalidation && !revalidationSecret) {
    throw new Error('revalidationSecret is required when enableRevalidation is true');
  }

  const cache = enableCache ? new ContentCache(cacheTtl) : null;

  return async function GET(request?: Request): Promise<NextResponse> {
    try {
      // Handle revalidation
      if (enableRevalidation && request) {
        const url = new URL(request.url);
        const revalidate = url.searchParams.get('revalidate');
        const secret = url.searchParams.get('secret');
        
        if (revalidate === 'true') {
          if (secret !== revalidationSecret) {
            return new NextResponse('Unauthorized', { status: 401 });
          }
          cache?.clear();
        }
      }

      // Generate cache key
      const cacheKey = enableCache ? cacheKeyGenerator(generatorOptions) : '';
      
      // Try to get from cache
      let content: string | null = null;
      if (cache && cacheKey) {
        content = cache.get(cacheKey);
      }

      // Generate content if not cached
      if (!content) {
        const generator = new LLMSGenerator(generatorOptions);
        content = await generator.generate();
        
        // Cache the result
        if (cache && cacheKey) {
          cache.set(cacheKey, content);
        }
      }

      // Prepare response headers
      const headers = {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': enableCache ? `public, max-age=${cacheTtl * 60}` : 'no-cache',
        'X-Generated-At': new Date().toISOString(),
        'X-Content-Length': content.length.toString(),
        ...responseHeaders
      };

      return new NextResponse(content, { headers });
    } catch (error) {
      console.error('Error generating LLMS content:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorResponse = `# Error\n\nFailed to generate LLMS content: ${errorMessage}\n\nPlease check your configuration and try again.`;
      
      return new NextResponse(errorResponse, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Error': 'true'
        }
      });
    }
  };
}

/**
 * Default cache key generator
 */
function defaultCacheKeyGenerator(options: ExtendedGeneratorOptions): string {
  const key = {
    siteUrl: options.siteUrl,
    sitemapUrl: options.sitemapUrl,
    maxPages: options.maxPages,
    includePatterns: options.includePatterns,
    excludePatterns: options.excludePatterns
  };
  
  return JSON.stringify(key);
}

/**
 * Default GET handler using environment variables and default configuration
 */
export const GET = createGET();

/**
 * Legacy function for backward compatibility
 */
export async function generateLLMSResponse(options: GeneratorOptions = {}): Promise<NextResponse> {
  const handler = createGET({ generatorOptions: options });
  return handler();
}

/**
 * Utility function to create a simple GET handler with options
 */
export function createSimpleGET(options: GeneratorOptions = {}): () => Promise<NextResponse> {
  return createGET({ generatorOptions: options });
}

/**
 * Advanced GET handler with full configuration
 */
export function createAdvancedGET(config: {
  options?: ExtendedGeneratorOptions;
  cache?: boolean;
  cacheTtl?: number;
  revalidation?: {
    enabled: boolean;
    secret: string;
  };
  headers?: Record<string, string>;
}): () => Promise<NextResponse> {
  const routeConfig: RouteConfig = {};
  
  if (config.options) routeConfig.generatorOptions = config.options;
  if (config.cache !== undefined) routeConfig.enableCache = config.cache;
  if (config.cacheTtl !== undefined) routeConfig.cacheTtl = config.cacheTtl;
  if (config.revalidation?.enabled !== undefined) routeConfig.enableRevalidation = config.revalidation.enabled;
  if (config.revalidation?.secret) routeConfig.revalidationSecret = config.revalidation.secret;
  if (config.headers) routeConfig.responseHeaders = config.headers;
  
  return createGET(routeConfig);
}

/**
 * Export the cache instance for external management
 */
export { globalCache as cache };

/**
 * Next.js Route Segment Config
 * These exports ensure the route is dynamically rendered and not statically generated
 * This is crucial for the LLMS generator to work properly as it needs to:
 * 1. Fetch the sitemap at request time (not build time)
 * 2. Crawl pages dynamically
 * 3. Generate fresh content based on current site state
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// RouteConfig is already exported above