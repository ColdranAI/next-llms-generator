/**
 * Configuration options for the LLMS generator (llms-full specification)
 */
export interface GeneratorOptions {
  /** Site URL (required) */
  siteUrl?: string;
  
  /** Sitemap URL (defaults to siteUrl/sitemap.xml) */
  sitemapUrl?: string;
  
  /** Whether to respect robots.txt (default: false) */
  respectRobots?: boolean;
  
  /** URL patterns to include (string or RegExp) */
  includePatterns?: (string | RegExp)[];
  
  /** URL patterns to exclude (string or RegExp) */
  excludePatterns?: (string | RegExp)[];
  
  /** CSS selectors to strip from content */
  stripSelectors?: string[];
  
  /** Maximum number of pages to process (default: 5000) */
  maxPages?: number;
  
  /** Maximum characters per page (default: 200,000) */
  maxCharsPerPage?: number;
  
  /** Maximum total characters for entire output (default: 50,000,000) */
  maxTotalChars?: number;
  
  /** Number of concurrent requests (default: 5) */
  concurrency?: number;
  
  /** Request timeout in milliseconds (default: 20000) */
  requestTimeoutMs?: number;
  
  /** Number of retries for failed requests (default: 3) */
  retries?: number;
  
  /** Header title for the generated content */
  headerTitle?: string;
  
  /** Header summary for the generated content */
  headerSummary?: string;
  
  /** Query parameters to keep during URL normalization */
  keepQueryParams?: string[];
  
  /** User agent string for requests */
  userAgent?: string;
  
  /** Custom headers for requests */
  customHeaders?: Record<string, string>;
  
  /** Custom logger implementation */
  logger?: Logger;
  
  /** Content extraction configuration */
  extractionConfig?: Partial<ExtractionConfig>;
  
  /** Whether to include generation statistics */
  includeStats?: boolean;
  
  /** Custom content transformer function */
  contentTransformer?: (content: string, url: string) => string;
  
  /** Enable recursive page discovery beyond sitemap (default: false) */
  enableRecursiveDiscovery?: boolean;
  
  /** Maximum depth for recursive discovery (default: 3) */
  maxRecursiveDepth?: number;
  
  /** Maximum number of links to follow per page (default: 50) */
  maxLinksPerPage?: number;
  
  /** Enable comprehensive content cleaning (frontmatter, JSX, imports) */
  enableContentCleaning?: boolean;
  
  /** Enable multiple extraction fallback methods */
  enableMultipleExtractionMethods?: boolean;
  
  /** Delay between requests in milliseconds (default: 100) */
  requestDelay?: number;
  
  /** Enable file system-based content discovery for local documentation */
  enableFileSystemDiscovery?: boolean;
  
  /** Base directory for file system discovery */
  fileSystemBasePath?: string;
  
  /** File patterns to include in file system discovery */
  fileIncludePatterns?: string[];
  
  /** File patterns to exclude from file system discovery */
  fileExcludePatterns?: string[];
  
  /** Maximum directory depth for file system discovery (default: 10) */
  maxFileSystemDepth?: number;
  
  /** Whether to follow symbolic links (default: false) */
  followSymlinks?: boolean;
  
  /** Output format type (default: 'full') */
  outputFormat?: 'full' | 'small' | 'minimal';
  
  /** Custom character limits for different output formats */
  formatLimits?: {
    full?: {
      maxPages?: number;
      maxCharsPerPage?: number;
      maxTotalChars?: number;
    };
    small?: {
      maxPages?: number;
      maxCharsPerPage?: number;
      maxTotalChars?: number;
    };
    minimal?: {
      maxPages?: number;
      maxCharsPerPage?: number;
      maxTotalChars?: number;
    };
  };
  
  /** Content filtering and categorization configuration */
  contentFilter?: Partial<ContentFilterConfig>;
}

/**
 * Result of crawling a single page (llms-full specification)
 */
export interface PageResult {
  /** Page URL */
  url: string;
  
  /** Page title */
  title: string;
  
  /** Extracted content in markdown */
  content: string;
  
  /** Whether the crawl was successful */
  success: boolean;
  
  /** Error message if crawl failed */
  error?: string;
  
  /** Timestamp when the page was crawled */
  timestamp: Date;
  
  /** Length of the extracted content */
  contentLength: number;
  
  /** Last modified date from sitemap or HTTP headers */
  lastmod?: string;
  
  /** Language code from HTML lang attribute */
  language?: string;
  
  /** HTTP status code */
  statusCode?: number;
  
  /** Reason for skipping (if not successful) */
  skipReason?: string;
  
  /** Whether content was truncated due to size limits */
  truncated?: boolean;
  
  /** Original content length before truncation */
  originalLength?: number;
}

/**
 * Configuration for content extraction
 */
export interface ExtractionConfig {
  /** Selectors to strip from content */
  stripSelectors: string[];
  
  /** Turndown service options */
  turndownOptions: {
    headingStyle: 'atx' | 'setext';
    codeBlockStyle: 'fenced' | 'indented';
  };
  
  /** Whether to use Mozilla Readability for content extraction */
  useReadability: boolean;
}

/**
 * Result of parsing a sitemap (llms-full specification)
 */
export interface SitemapResult {
  /** Extracted URLs with metadata */
  urls: SitemapUrl[];
  
  /** Whether this is a sitemap index */
  isIndex: boolean;
  
  /** Child sitemap URLs (if this is an index) */
  childSitemaps?: string[];
}

/**
 * URL entry from sitemap with metadata
 */
export interface SitemapUrl {
  /** The URL */
  loc: string;
  
  /** Last modification date */
  lastmod?: string;
  
  /** Change frequency */
  changefreq?: string;
  
  /** Priority */
  priority?: string;
}

/**
 * URL discovery result for recursive crawling
 */
export interface DiscoveredUrl {
  /** The URL */
  url: string;
  
  /** Discovery depth (0 = sitemap, 1+ = recursive) */
  depth: number;
  
  /** Parent URL that discovered this URL */
  parentUrl?: string;
  
  /** Discovery method (sitemap, link, etc.) */
  discoveryMethod: 'sitemap' | 'internal-link' | 'external-link';
  
  /** Last modification date if available */
  lastmod?: string;
}

/**
 * File system discovery result
 */
export interface FileSystemResult {
  /** Discovered file paths */
  files: DiscoveredFile[];
  
  /** Total number of files found */
  totalFiles: number;
  
  /** Discovery statistics */
  stats: FileDiscoveryStats;
}

/**
 * Discovered file information
 */
export interface DiscoveredFile {
  /** Absolute file path */
  filePath: string;
  
  /** Relative path from base directory */
  relativePath: string;
  
  /** File extension */
  extension: string;
  
  /** File size in bytes */
  size: number;
  
  /** Last modified timestamp */
  lastModified: Date;
  
  /** Directory depth from base path */
  depth: number;
  
  /** Whether this is a symbolic link */
  isSymlink: boolean;
}

/**
 * File discovery statistics
 */
export interface FileDiscoveryStats {
  /** Total files scanned */
  totalScanned: number;
  
  /** Files included after filtering */
  included: number;
  
  /** Files excluded by patterns */
  excluded: number;
  
  /** Directories traversed */
  directoriesTraversed: number;
  
  /** Discovery duration in milliseconds */
  durationMs: number;
}

/**
 * Content cleaning configuration
 */
export interface ContentCleaningConfig {
  /** Remove frontmatter (YAML/TOML blocks) */
  removeFrontmatter: boolean;
  
  /** Remove JSX/MDX components */
  removeJsxComponents: boolean;
  
  /** Remove import statements */
  removeImports: boolean;
  
  /** Remove HTML comments */
  removeHtmlComments: boolean;
  
  /** Remove image references */
  removeImages: boolean;
  
  /** Custom regex patterns to remove */
  customPatterns: RegExp[];
}

/**
 * Content category for filtering and organization
 */
export interface ContentCategory {
  /** Category identifier */
  id: string;
  
  /** Human-readable category name */
  name: string;
  
  /** Category description */
  description?: string;
  
  /** Priority for ordering (higher = more important) */
  priority: number;
  
  /** URL patterns that match this category */
  urlPatterns: string[];
  
  /** Content patterns that match this category */
  contentPatterns: string[];
  
  /** File path patterns for file system discovery */
  filePatterns?: string[];
  
  /** Maximum pages for this category */
  maxPages?: number;
  
  /** Whether to include this category in output */
  enabled: boolean;
}

/**
 * Content filter configuration
 */
export interface ContentFilterConfig {
  /** Available content categories */
  categories: ContentCategory[];
  
  /** Default category for uncategorized content */
  defaultCategory: string;
  
  /** Whether to group content by category in output */
  groupByCategory: boolean;
  
  /** Whether to include category metadata in output */
  includeCategoryMetadata: boolean;
  
  /** Minimum content length to include */
  minContentLength?: number;
  
  /** Maximum content length per page */
  maxContentLength?: number;
  
  /** Keywords to prioritize content */
  priorityKeywords?: string[];
  
  /** Keywords to deprioritize content */
  excludeKeywords?: string[];
}

/**
 * Categorized page result
 */
export interface CategorizedPageResult extends PageResult {
  /** Assigned category */
  category: string;
  
  /** Category priority */
  categoryPriority: number;
  
  /** Content relevance score (0-1) */
  relevanceScore?: number;
  
  /** Matched keywords */
  matchedKeywords?: string[];
}

/**
 * Table of contents entry
 */
export interface TocEntry {
  /** Page index (1-based) */
  index: number;
  
  /** Page URL */
  url: string;
  
  /** Page title */
  title: string;
}

/**
 * Content hash information for provenance
 */
export interface ContentHash {
  /** SHA-256 hash of the pages content section */
  sha256: string;
  
  /** Algorithm used */
  algorithm: 'sha256';
}

/**
 * Document metadata for llms-full header
 */
export interface DocumentMetadata {
  /** Project name */
  projectName: string;
  
  /** Site URL */
  siteUrl: string;
  
  /** Generation timestamp (ISO-8601 UTC) */
  generatedAt: string;
  
  /** Number of pages included */
  pageCount: number;
  
  /** Generator name and version */
  generator: string;
}

/**
 * Generation statistics (llms-full specification)
 */
export interface GenerationStats {
  /** Total number of pages processed */
  totalPages: number;
  
  /** Number of successfully processed pages */
  successfulPages: number;
  
  /** Number of failed pages */
  failedPages: number;
  
  /** Number of pages skipped due to size limits */
  skippedPages: number;
  
  /** Number of pages truncated due to size limits */
  truncatedPages: number;
  
  /** Total content length in characters */
  totalContentLength: number;
  
  /** Total original content length before truncation */
  totalOriginalLength: number;
  
  /** Generation start time */
  startTime: Date;
  
  /** Generation end time */
  endTime: Date;
  
  /** Total generation duration in milliseconds */
  duration: number;
  
  /** Whether global character limit was reached */
  globalLimitReached: boolean;
}

/**
 * Error types for better error handling
 */
export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  ROBOTS_BLOCKED = 'ROBOTS_BLOCKED',
  INVALID_URL = 'INVALID_URL',
  CONTENT_TOO_LARGE = 'CONTENT_TOO_LARGE'
}

/**
 * Custom error class for generator errors
 */
export class GeneratorError extends Error {
  constructor(
    message: string,
    public readonly type: ErrorType,
    public readonly url?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'GeneratorError';
  }
}

/**
 * Logger interface for customizable logging
 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Default logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly level: 'debug' | 'info' | 'warn' | 'error' = 'info') {}

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}

/**
 * Extended generator options with additional configuration
 */
export interface ExtendedGeneratorOptions extends GeneratorOptions {
  /** Custom logger instance */
  logger?: Logger;
  
  /** Custom extraction configuration */
  extractionConfig?: Partial<ExtractionConfig>;
  
  /** Whether to include generation statistics in output */
  includeStats?: boolean;
  
  /** Custom content transformer function */
  contentTransformer?: (content: string, url: string) => string;
}