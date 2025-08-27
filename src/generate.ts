import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { URL } from "url";
import type {
  GeneratorOptions,
  ExtendedGeneratorOptions,
  PageResult,
  SitemapResult,
  GenerationStats,
  ExtractionConfig,
  Logger,
  SitemapUrl,
  DocumentMetadata,
  DiscoveredUrl,
  ContentCleaningConfig,
  FileSystemResult,
  DiscoveredFile,
  FileDiscoveryStats
} from './types.js';
import {
  ConsoleLogger,
  ErrorType,
  GeneratorError
} from "./types.js";
import { ContentFilter } from './content-filter.js';

/**
 * Core class for generating LLM-friendly content from websites
 */
export class LLMSGenerator {
  private readonly options: Required<ExtendedGeneratorOptions>;
  private readonly logger: Logger;
  private readonly turndownService: TurndownService;
  private readonly extractionConfig: ExtractionConfig;

  constructor(userOptions: ExtendedGeneratorOptions = {}) {
    this.options = this.mergeWithDefaults(userOptions);
    this.logger = this.options.logger || new ConsoleLogger();
    this.extractionConfig = this.createExtractionConfig(userOptions.extractionConfig);
    this.turndownService = this.createTurndownService();
  }

  /**
   * Generate the complete LLMS content (llms-full specification)
   */
  async generate(): Promise<string> {
    const stats = this.createInitialStats();
    
    try {
      this.logger.info('Starting LLM content generation', { 
        siteUrl: this.options.siteUrl, 
        outputFormat: this.options.outputFormat 
      });
      
      // Apply format-specific limits
      this.applyFormatLimits();
      
      const urls = await this.extractUrls();
      const filteredUrls = this.filterUrls(urls);
      
      this.logger.info(`Processing ${filteredUrls.length} URLs with concurrency ${this.options.concurrency}`);
      
      // Discover URLs recursively if enabled
      const discoveredUrls = await this.discoverUrlsRecursively(filteredUrls);
      this.logger.info(`Discovered ${discoveredUrls.length} total URLs (including recursive discovery)`);
      
      // Discover files from file system if enabled
      const fileSystemResult = await this.discoverFilesFromFileSystem();
      if (fileSystemResult.totalFiles > 0) {
        this.logger.info(`Discovered ${fileSystemResult.totalFiles} files from file system`);
      }
      
      // Convert discovered URLs back to SitemapUrl format for compatibility
    const sortedUrls = this.sortUrls(discoveredUrls.map(url => {
      const sitemapUrl: SitemapUrl = { loc: url.url };
      if (url.lastmod) {
        sitemapUrl.lastmod = url.lastmod;
      }
      return sitemapUrl;
    }));
      
      const pageResults = await this.crawlPages(sortedUrls);
      
      // Apply content filtering and categorization
      const filteredResults = this.applyContentFiltering(pageResults);
      
      // Apply character limits and truncation
      const processedResults = this.applyCharacterLimits(filteredResults, stats);
      
      // Generate content sections
      const pagesContent = this.generatePagesContent(processedResults);
      
      const metadata = this.createDocumentMetadata(processedResults.length);
      const header = this.generateLlmsFullHeader(metadata);
      const toc = this.generateTableOfContents(processedResults);
      
      const finalContent = this.assembleLlmsFullContent(header, toc, pagesContent);
      
      stats.endTime = new Date();
      stats.duration = stats.endTime.getTime() - stats.startTime.getTime();
      stats.totalPages = pageResults.length;
      stats.successfulPages = pageResults.filter(p => p.success).length;
      stats.failedPages = pageResults.filter(p => !p.success).length;
      stats.totalContentLength = finalContent.length;
      
      this.logger.info('Generation completed', stats);
      
      return finalContent;
    } catch (error) {
      this.logger.error('Generation failed', error);
      throw error;
    }
  }

  /**
   * Extract URLs from sitemap(s)
   */
  private async extractUrls(): Promise<SitemapUrl[]> {
    this.logger.info(`Starting sitemap extraction:`, {
      sitemapUrl: this.options.sitemapUrl,
      siteUrl: this.options.siteUrl
    });
    
    const sitemapResult = await this.parseSitemap(this.options.sitemapUrl);
    
    this.logger.info(`Sitemap parsing result:`, {
      isIndex: sitemapResult.isIndex,
      urlCount: sitemapResult.urls.length,
      urls: sitemapResult.urls.map(u => u.loc),
      siteUrl: this.options.siteUrl
    });
    
    if (sitemapResult.isIndex && sitemapResult.childSitemaps) {
      this.logger.info(`Found sitemap index with ${sitemapResult.childSitemaps.length} child sitemaps`);
      const allUrls = new Map<string, SitemapUrl>();
      
      for (const childSitemap of sitemapResult.childSitemaps) {
        try {
          const childResult = await this.parseSitemap(childSitemap);
          childResult.urls.forEach(urlEntry => allUrls.set(urlEntry.loc, urlEntry));
        } catch (error) {
          this.logger.warn(`Failed to parse child sitemap: ${childSitemap}`, error);
        }
      }
      
      return Array.from(allUrls.values());
    }
    
    return sitemapResult.urls;
  }

  /**
   * Parse a single sitemap
   */
  private async parseSitemap(sitemapUrl: string): Promise<SitemapResult> {
    try {
      const response = await this.fetchWithRetry(sitemapUrl);
      const xml = await response.text();
      
      const urls = this.extractUrlsFromXml(xml);
      this.logger.info(`Extracted URLs from sitemap:`, {
        sitemapUrl,
        extractedUrls: urls,
        extractedCount: urls.length,
        siteUrl: this.options.siteUrl
      });
      
      const isIndex = urls.some(urlEntry => urlEntry.loc.endsWith('.xml'));
      
      if (isIndex) {
        const childSitemaps = urls.filter(urlEntry => urlEntry.loc.endsWith('.xml')).map(u => u.loc);
        return { urls: [], isIndex: true, childSitemaps };
      }
      
      // More flexible URL filtering - allow URLs that contain the site URL domain
      const siteUrlObj = new URL(this.options.siteUrl);
      const filteredUrls = urls.filter(urlEntry => {
        try {
          const urlObj = new URL(urlEntry.loc);
          return urlObj.hostname === siteUrlObj.hostname;
        } catch {
          return false;
        }
      });
      
      this.logger.info(`Filtered URLs:`, {
        beforeFilter: urls.length,
        afterFilter: filteredUrls.length,
        filteredUrls: filteredUrls.map(u => u.loc)
      });
      
      return { urls: filteredUrls, isIndex: false };
    } catch (error) {
      throw new GeneratorError(
        `Failed to parse sitemap: ${sitemapUrl}`,
        ErrorType.NETWORK_ERROR,
        sitemapUrl,
        error as Error
      );
    }
  }

  /**
   * Extract URLs from XML content
   */
  private extractUrlsFromXml(xml: string): SitemapUrl[] {
    const urlMatches = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);
    const sitemapUrls: SitemapUrl[] = [];
    
    for (const match of urlMatches) {
      const urlBlock = match[1];
      if (!urlBlock) continue;
      
      const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
      const lastmodMatch = urlBlock.match(/<lastmod>([^<]+)<\/lastmod>/);
      
      if (locMatch?.[1]) {
        const entry: SitemapUrl = { loc: locMatch[1].trim() };
         if (lastmodMatch?.[1]) {
           entry.lastmod = lastmodMatch[1].trim();
         }
         sitemapUrls.push(entry);
      }
    }
    
    // Fallback for simple sitemap format
    if (sitemapUrls.length === 0) {
      const simpleMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
      for (const match of simpleMatches) {
        if (match[1]) {
          sitemapUrls.push({ loc: match[1].trim() });
        }
      }
    }
    
    return sitemapUrls;
  }

  /**
   * Filter URLs based on include/exclude patterns
   */
  private filterUrls(urls: SitemapUrl[]): SitemapUrl[] {
    this.logger.info(`Starting URL filtering:`, {
      inputUrls: urls.map(u => u.loc),
      inputCount: urls.length,
      includePatterns: this.options.includePatterns,
      excludePatterns: this.options.excludePatterns,
      maxPages: this.options.maxPages
    });
    
    let filtered = urls;
    
    // Apply include patterns
    if (this.options.includePatterns.length > 0) {
      const beforeInclude = filtered.length;
      filtered = filtered.filter(urlEntry => this.matchesAnyPattern(urlEntry.loc, this.options.includePatterns));
      this.logger.info(`After include patterns: ${beforeInclude} -> ${filtered.length}`);
    }
    
    // Apply exclude patterns
    if (this.options.excludePatterns.length > 0) {
      const beforeExclude = filtered.length;
      filtered = filtered.filter(urlEntry => !this.matchesAnyPattern(urlEntry.loc, this.options.excludePatterns));
      this.logger.info(`After exclude patterns: ${beforeExclude} -> ${filtered.length}`);
    }
    
    // Apply max pages limit
    const beforeLimit = filtered.length;
    filtered = filtered.slice(0, this.options.maxPages);
    this.logger.info(`After max pages limit: ${beforeLimit} -> ${filtered.length}`);
    
    // Fallback to site URL if no URLs found
    if (filtered.length === 0) {
      this.logger.warn('No URLs found, falling back to site URL');
      filtered = [{ loc: this.options.siteUrl }];
    }
    
    this.logger.info(`Final filtered URLs:`, filtered.map(u => u.loc));
    return filtered;
  }

  /**
   * Discover URLs recursively by following internal links
   */
  private async discoverUrlsRecursively(initialUrls: SitemapUrl[]): Promise<DiscoveredUrl[]> {
    if (!this.options.enableRecursiveDiscovery) {
      return initialUrls.map(url => {
        const discovered: DiscoveredUrl = {
          url: url.loc,
          depth: 0,
          discoveryMethod: 'sitemap' as const
        };
        if (url.lastmod) {
          discovered.lastmod = url.lastmod;
        }
        return discovered;
      });
    }

    const discovered = new Map<string, DiscoveredUrl>();
    const toProcess = new Set<string>();
    
    // Add initial URLs from sitemap
    for (const url of initialUrls) {
      const normalizedUrl = this.normalizeUrl(url.loc);
      const discoveredUrl: DiscoveredUrl = {
        url: normalizedUrl,
        depth: 0,
        discoveryMethod: 'sitemap'
      };
      if (url.lastmod) {
        discoveredUrl.lastmod = url.lastmod;
      }
      discovered.set(normalizedUrl, discoveredUrl);
      toProcess.add(normalizedUrl);
    }

    // Process URLs at each depth level
    for (let depth = 0; depth < this.options.maxRecursiveDepth; depth++) {
      const currentLevelUrls = Array.from(toProcess).filter(url => 
        discovered.get(url)?.depth === depth
      );
      
      if (currentLevelUrls.length === 0) break;
      
      this.logger.info(`Discovering links at depth ${depth + 1} from ${currentLevelUrls.length} pages`);
      
      const newUrls = await this.extractLinksFromPages(currentLevelUrls, depth + 1);
      
      for (const newUrl of newUrls) {
        const normalizedUrl = this.normalizeUrl(newUrl.url);
        if (!discovered.has(normalizedUrl) && this.isInternalUrl(normalizedUrl)) {
          discovered.set(normalizedUrl, newUrl);
          toProcess.add(normalizedUrl);
        }
      }
      
      // Apply delay between depth levels
      if (depth < this.options.maxRecursiveDepth - 1) {
        await new Promise(resolve => setTimeout(resolve, this.options.requestDelay));
      }
    }

    return Array.from(discovered.values());
  }

  /**
   * Extract internal links from a set of pages
   */
  private async extractLinksFromPages(urls: string[], depth: number): Promise<DiscoveredUrl[]> {
    const discovered: DiscoveredUrl[] = [];
    const semaphore = new Array(this.options.concurrency).fill(null);
    
    await Promise.all(semaphore.map(async () => {
      while (urls.length > 0) {
        const url = urls.shift();
        if (!url) break;
        
        try {
          const links = await this.extractLinksFromPage(url, depth);
          discovered.push(...links);
        } catch (error) {
          this.logger.warn(`Failed to extract links from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, this.options.requestDelay));
      }
    }));
    
    return discovered;
  }

  /**
   * Extract internal links from a single page
   */
  private async extractLinksFromPage(url: string, depth: number): Promise<DiscoveredUrl[]> {
    try {
      const response = await this.fetchWithRetry(url);
      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const document = dom.window.document;
      
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(link => {
          const href = (link as HTMLAnchorElement).href;
          try {
            const absoluteUrl = new URL(href, url).toString();
            return this.normalizeUrl(absoluteUrl);
          } catch {
            return null;
          }
        })
        .filter((href): href is string => 
          href !== null && 
          this.isInternalUrl(href) &&
          href !== url
        )
        .slice(0, this.options.maxLinksPerPage);
      
      return links.map(link => ({
        url: link,
        depth,
        parentUrl: url,
        discoveryMethod: 'internal-link' as const
      }));
    } catch (error) {
      this.logger.warn(`Failed to extract links from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Check if URL is internal to the site
   */
  private isInternalUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const siteUrlObj = new URL(this.options.siteUrl);
      return urlObj.hostname === siteUrlObj.hostname;
    } catch {
      return false;
    }
  }

  /**
   * Normalize URL by removing fragments and unnecessary query params
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Remove fragment
      urlObj.hash = '';
      
      // Keep only specified query parameters
      if (this.options.keepQueryParams.length > 0) {
        const paramsToKeep = new URLSearchParams();
        for (const param of this.options.keepQueryParams) {
          const value = urlObj.searchParams.get(param);
          if (value !== null) {
            paramsToKeep.set(param, value);
          }
        }
        urlObj.search = paramsToKeep.toString();
      } else {
        urlObj.search = '';
      }
      
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * Check if URL matches any of the given patterns
   */
  private matchesAnyPattern(url: string, patterns: (string | RegExp)[]): boolean {
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return url.includes(pattern);
      }
      return pattern.test(url);
    });
  }

  /**
   * Discover files from the file system
   */
  private async discoverFilesFromFileSystem(): Promise<FileSystemResult> {
    if (!this.options.enableFileSystemDiscovery) {
      return {
        files: [],
        totalFiles: 0,
        stats: {
          totalScanned: 0,
          included: 0,
          excluded: 0,
          directoriesTraversed: 0,
          durationMs: 0
        }
      };
    }

    const startTime = Date.now();
     const stats: FileDiscoveryStats = {
       totalScanned: 0,
       included: 0,
       excluded: 0,
       directoriesTraversed: 0,
       durationMs: 0
     };

    const files: DiscoveredFile[] = [];
    const basePath = path.resolve(this.options.fileSystemBasePath);

    this.logger.info(`Starting file system discovery from: ${basePath}`);

    try {
      await this.scanDirectory(basePath, basePath, 0, files, stats);
    } catch (error) {
      this.logger.error(`File system discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    stats.durationMs = Date.now() - startTime;
    
    this.logger.info(`File system discovery completed`, {
      totalFiles: files.length,
      ...stats
    });

    return {
      files,
      totalFiles: files.length,
      stats
    };
  }

  /**
   * Recursively scan a directory for files
   */
  private async scanDirectory(
    dirPath: string,
    basePath: string,
    depth: number,
    files: DiscoveredFile[],
    stats: FileDiscoveryStats
  ): Promise<void> {
    if (depth > this.options.maxFileSystemDepth) {
      return;
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      stats.directoriesTraversed++;

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        // Handle symlinks
        if (entry.isSymbolicLink()) {
          if (!this.options.followSymlinks) {
            continue;
          }
          try {
            const realPath = await fs.promises.realpath(fullPath);
            const realStat = await fs.promises.stat(realPath);
            if (realStat.isDirectory()) {
              await this.scanDirectory(realPath, basePath, depth + 1, files, stats);
            } else if (realStat.isFile()) {
              await this.processFile(fullPath, relativePath, files, stats, true);
            }
          } catch {
            // Skip broken symlinks
            continue;
          }
        } else if (entry.isDirectory()) {
          // Check if directory should be excluded
          if (this.matchesFilePatterns(relativePath + '/', this.options.fileExcludePatterns)) {
             stats.excluded++;
             continue;
           }
          await this.scanDirectory(fullPath, basePath, depth + 1, files, stats);
        } else if (entry.isFile()) {
          await this.processFile(fullPath, relativePath, files, stats, false);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a single file for inclusion
   */
  private async processFile(
    fullPath: string,
    relativePath: string,
    files: DiscoveredFile[],
    stats: FileDiscoveryStats,
    isSymlink: boolean
  ): Promise<void> {
    stats.totalScanned++;

     // Check exclude patterns first
     if (this.matchesFilePatterns(relativePath, this.options.fileExcludePatterns)) {
       stats.excluded++;
       return;
     }

     // Check include patterns
     if (!this.matchesFilePatterns(relativePath, this.options.fileIncludePatterns)) {
       stats.excluded++;
       return;
     }

    try {
      const stat = await fs.promises.stat(fullPath);
      const depth = relativePath.split(path.sep).length - 1;
      
      const discoveredFile: DiscoveredFile = {
         filePath: fullPath,
         relativePath,
         extension: path.extname(fullPath),
         size: stat.size,
         lastModified: stat.mtime,
         depth,
         isSymlink
       };

       files.push(discoveredFile);
       stats.included++;
    } catch (error) {
      this.logger.warn(`Failed to stat file ${fullPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
       stats.excluded++;
    }
  }

  /**
   * Check if a file path matches any of the given glob patterns
   */
  private matchesFilePatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/\./g, '\\.');
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath) || regex.test(filePath.replace(/\\/g, '/'));
    });
  }

  /**
   * Crawl multiple pages concurrently
   */
  private async crawlPages(urls: SitemapUrl[]): Promise<PageResult[]> {
    const results: PageResult[] = [];
    let currentIndex = 0;
    
    const worker = async (): Promise<void> => {
      while (currentIndex < urls.length) {
        const index = currentIndex++;
        const urlEntry = urls[index];
        const url = urlEntry?.loc;
        
        if (!url) continue;
        
        try {
          const result = await this.crawlSinglePage(url, urlEntry.lastmod);
          results[index] = result;
        } catch (error) {
          results[index] = {
            url,
            title: 'Error',
            content: '',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
            contentLength: 0
          };
        }
      }
    };
    
    // Create worker pool
    const workers = Array.from({ length: this.options.concurrency }, () => worker());
    await Promise.all(workers);
    
    return results.filter(Boolean); // Remove any undefined entries
  }

  /**
   * Crawl a single page
   */
  private async crawlSinglePage(url: string, lastmod?: string): Promise<PageResult> {
    const startTime = new Date();
    
    try {
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        const result: PageResult = {
          url,
          title: 'Skipped',
          content: `Failed to fetch: ${response.status} ${response.statusText}`,
          success: false,
          error: `HTTP ${response.status}`,
          timestamp: startTime,
          contentLength: 0,
          statusCode: response.status,
          skipReason: `http-${response.status}`,
          truncated: false
        };
        if (lastmod) result.lastmod = lastmod;
        return result;
      }
      
      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        const result: PageResult = {
          url,
          title: 'Skipped',
          content: 'No content extracted.',
          success: false,
          error: 'Non-HTML content type',
          timestamp: startTime,
          contentLength: 0,
          statusCode: response.status,
          skipReason: 'content-type',
          truncated: false
        };
        if (lastmod) result.lastmod = lastmod;
        return result;
      }
      
      const html = await response.text();
      
      // Check for oversized content
      if (html.length > 5 * 1024 * 1024) { // 5MB
        const result: PageResult = {
          url,
          title: 'Skipped',
          content: 'No content extracted.',
          success: false,
          error: 'Content too large',
          timestamp: startTime,
          contentLength: 0,
          statusCode: response.status,
          skipReason: 'too-large',
          truncated: false
        };
        if (lastmod) result.lastmod = lastmod;
        return result;
      }
      
      const { title, content, language } = this.extractContent(url, html);
      
      const transformedContent = this.options.contentTransformer
        ? this.options.contentTransformer(content, url)
        : content;
      
      const result: PageResult = {
        url,
        title,
        content: transformedContent,
        success: true,
        timestamp: startTime,
        contentLength: transformedContent.length,
        statusCode: response.status,
        truncated: false,
        originalLength: transformedContent.length
      };
      if (lastmod) result.lastmod = lastmod;
      if (language) result.language = language;
      return result;
    } catch (error) {
      this.logger.warn(`Failed to crawl page: ${url}`, error);
      
      const result: PageResult = {
        url,
        title: 'Skipped',
        content: `(Fetch/parse error: ${error instanceof Error ? error.message : 'Unknown error'})`,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: startTime,
        contentLength: 0,
        statusCode: 0,
        skipReason: 'parse-error',
        truncated: false
      };
      if (lastmod) result.lastmod = lastmod;
      return result;
    }
  }

  /**
   * Extract content from HTML using multiple fallback methods
   */
  private extractContent(url: string, html: string): { title: string; content: string; language?: string } {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    // Extract language from html tag
    const langAttr = document.documentElement.getAttribute('lang');
    const language = langAttr ? langAttr : undefined;
    
    // Remove unwanted elements
    this.extractionConfig.stripSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach((element: Element) => element.remove());
    });
    
    // Remove script, style, and other non-content elements
    document.querySelectorAll('script, style, noscript, template').forEach((element: Element) => {
      element.remove();
    });
    
    let title: string;
    let content: string;
    
    if (this.options.enableMultipleExtractionMethods) {
      const extractionResult = this.extractContentWithFallbacks(document, url);
      title = extractionResult.title;
      content = extractionResult.content;
    } else {
      // Original single method extraction
      let contentHtml: string;
      
      if (this.extractionConfig.useReadability) {
        const reader = new Readability(document);
        const article = reader.parse();
        
        title = article?.title || document.title || url;
        contentHtml = article?.content || document.body?.innerHTML || '';
      } else {
        title = document.title || url;
        contentHtml = document.body?.innerHTML || '';
      }
      
      const markdown = this.turndownService.turndown(contentHtml).trim();
      content = markdown.length > 0 ? markdown.replace(/\n{3,}/g, '\n\n') : 
        (document.body?.textContent || '').trim();
    }
    
    // Apply content cleaning if enabled
    if (this.options.enableContentCleaning) {
      content = this.cleanMarkdownContent(content);
    }
    
    // Apply custom content transformer
    content = this.options.contentTransformer(content, url);
    
    const result: { title: string; content: string; language?: string } = { title, content };
    if (language) result.language = language;
    return result;
  }

  /**
   * Extract content using multiple fallback methods
   */
  private extractContentWithFallbacks(document: Document, url: string): { title: string; content: string } {
    const extractionMethods = [
      () => this.extractWithReadability(document, url),
      () => this.extractWithSemanticSelectors(document, url),
      () => this.extractWithContentSelectors(document, url),
      () => this.extractWithMetadata(document, url),
      () => this.extractRawText(document, url)
    ];
    
    for (const method of extractionMethods) {
      try {
        const result = method();
        if (result.content && result.content.trim().length > 50) {
          this.logger.debug(`Content extracted successfully using fallback method`);
          return result;
        }
      } catch (error) {
        this.logger.debug(`Extraction method failed:`, error);
        continue;
      }
    }
    
    // Final fallback - return basic document info
    return {
      title: document.title || url,
      content: 'No content could be extracted from this page.'
    };
  }
  
  /**
   * Extract content using Mozilla Readability
   */
  private extractWithReadability(document: Document, url: string): { title: string; content: string } {
    const reader = new Readability(document);
    const article = reader.parse();
    
    if (!article) {
      throw new Error('Readability failed to parse content');
    }
    
    const title = article.title || document.title || url;
    const contentHtml = article.content || '';
    const markdown = this.turndownService.turndown(contentHtml).trim();
    
    return {
      title,
      content: markdown.replace(/\n{3,}/g, '\n\n')
    };
  }
  
  /**
   * Extract content using semantic HTML selectors
   */
  private extractWithSemanticSelectors(document: Document, url: string): { title: string; content: string } {
    const semanticSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.page-content'
    ];
    
    for (const selector of semanticSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = document.title || url;
        const markdown = this.turndownService.turndown(element.innerHTML).trim();
        
        if (markdown.length > 50) {
          return {
            title,
            content: markdown.replace(/\n{3,}/g, '\n\n')
          };
        }
      }
    }
    
    throw new Error('No semantic content found');
  }
  
  /**
   * Extract content using common content selectors
   */
  private extractWithContentSelectors(document: Document, url: string): { title: string; content: string } {
    const contentSelectors = [
      '.markdown-body',
      '.prose',
      '.documentation',
      '.docs-content',
      '.wiki-content',
      '.readme',
      '.post-body',
      '.entry-body'
    ];
    
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = document.title || url;
        const markdown = this.turndownService.turndown(element.innerHTML).trim();
        
        if (markdown.length > 50) {
          return {
            title,
            content: markdown.replace(/\n{3,}/g, '\n\n')
          };
        }
      }
    }
    
    throw new Error('No content selectors matched');
  }
  
  /**
   * Extract content from metadata and structured data
   */
  private extractWithMetadata(document: Document, url: string): { title: string; content: string } {
    const title = document.title || url;
    let content = '';
    
    // Extract meta description
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
    if (metaDescription) {
      content += `Description: ${metaDescription}\n\n`;
    }
    
    // Extract Open Graph data
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
    
    if (ogTitle && ogTitle !== title) {
      content += `Title: ${ogTitle}\n\n`;
    }
    
    if (ogDescription && ogDescription !== metaDescription) {
      content += `Summary: ${ogDescription}\n\n`;
    }
    
    // Extract JSON-LD structured data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent || '');
        if (data.description) {
          content += `Structured Description: ${data.description}\n\n`;
        }
        if (data.text) {
          content += `Content: ${data.text}\n\n`;
        }
      } catch {
        // Ignore invalid JSON-LD
      }
    });
    
    if (content.trim().length < 50) {
      throw new Error('Insufficient metadata content');
    }
    
    return { title, content: content.trim() };
  }
  
  /**
   * Extract raw text content as final fallback
   */
  private extractRawText(document: Document, url: string): { title: string; content: string } {
    const title = document.title || url;
    
    // Remove navigation, footer, and sidebar elements
    const elementsToRemove = document.querySelectorAll(
      'nav, footer, aside, .sidebar, .navigation, .menu, .header, .footer'
    );
    elementsToRemove.forEach(el => el.remove());
    
    const textContent = document.body?.textContent || '';
    const cleanedText = textContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    if (cleanedText.length < 50) {
      throw new Error('Insufficient text content');
    }
    
    return {
      title,
      content: cleanedText
    };
  }

  /**
   * Clean markdown content by removing frontmatter, JSX components, imports, etc.
   */
  private cleanMarkdownContent(content: string): string {
    const cleaningConfig = this.getContentCleaningConfig();
    let cleaned = content;
    
    // Remove frontmatter (YAML/TOML blocks)
    if (cleaningConfig.removeFrontmatter) {
      const frontmatterRegex = /^\n*---([\n.+])*?\n---\n/;
      cleaned = cleaned.replace(frontmatterRegex, '');
    }
    
    // Remove JSX-style comments
    if (cleaningConfig.removeHtmlComments) {
      cleaned = cleaned.replace(/{\/*[\s\S]*?\*\/}/g, '');
    }
    
    // Remove <br/> tags and convert to newlines
    cleaned = cleaned.replace(/<br\s*\/?>/g, '\n');
    
    // Handle FAQ components
    cleaned = cleaned.replace(/<FAQItem\s+question="([^"]+)"\s*>([\s\S]*?)<\/FAQItem>/g, (_, question, answer) => {
      return `Question: ${question}\nAnswer: ${answer}\n`;
    });
    cleaned = cleaned.replace(/<FAQ>([\s\S]*?)<\/FAQ>/g, (_, content) => {
      return content;
    });
    
    // Process content while preserving tables
    const sections = cleaned.split(/(\|.*\|\n\|.*\|\n(\|.*\|\n)*)/);
    let processedContent = '';
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section) continue;
      
      if (section.trim().startsWith('|')) {
        // Preserve table sections
        processedContent += section;
      } else {
        let processedSection = section;
        
        // Remove JSX/MDX components
        if (cleaningConfig.removeJsxComponents) {
          const mdxComponentRegex = /<[^>]+>/g;
          processedSection = processedSection.replace(mdxComponentRegex, '');
        }
        
        // Remove image references
        if (cleaningConfig.removeImages) {
          const imageRegex = /!\[.*?\]\(.*?\)/g;
          processedSection = processedSection.replace(imageRegex, '');
        }
        
        // Remove import statements
        if (cleaningConfig.removeImports) {
          const importRegex = /^import\s+.*?from\s+['"].*?['"];?/gm;
          processedSection = processedSection.replace(importRegex, '');
        }
        
        // Apply custom patterns
        for (const pattern of cleaningConfig.customPatterns) {
          processedSection = processedSection.replace(pattern, '');
        }
        
        processedContent += processedSection;
      }
    }
    
    // Clean up excessive whitespace
    const lines = processedContent.split('\n');
    const processedLines: string[] = [];
    let lastLineWasEmpty = false;
    
    for (const line of lines) {
      if (!line) continue;
      const trimmedLine = line.trim();
      
      if (trimmedLine === '' && lastLineWasEmpty) {
        continue;
      }
      
      processedLines.push(line);
      lastLineWasEmpty = trimmedLine === '';
    }
    
    return processedLines.join('\n');
  }

  /**
   * Get content cleaning configuration
   */
  private getContentCleaningConfig(): ContentCleaningConfig {
    return {
      removeFrontmatter: true,
      removeJsxComponents: true,
      removeImports: true,
      removeHtmlComments: true,
      removeImages: false, // Keep images by default
      customPatterns: []
    };
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(url: string, retries = 3): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);
        
        const response = await fetch(url, {
          redirect: 'follow',
          headers: {
            'User-Agent': this.options.userAgent,
            ...this.options.customHeaders
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return response;
        }
        
        throw new GeneratorError(
          `HTTP ${response.status}: ${response.statusText}`,
          ErrorType.NETWORK_ERROR,
          url
        );
      } catch (error) {
        if (attempt === retries - 1) {
          throw error;
        }
        
        const delay = 250 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new GeneratorError(`Failed to fetch after ${retries} attempts`, ErrorType.NETWORK_ERROR, url);
  }

  /**
   * Sort URLs by lastmod (desc) then by URL alphabetically
   */
  private sortUrls(urls: SitemapUrl[]): SitemapUrl[] {
    return urls.sort((a, b) => {
      // Sort by lastmod descending (most recent first)
      if (a.lastmod && b.lastmod) {
        const dateA = new Date(a.lastmod);
        const dateB = new Date(b.lastmod);
        if (dateA.getTime() !== dateB.getTime()) {
          return dateB.getTime() - dateA.getTime();
        }
      } else if (a.lastmod && !b.lastmod) {
        return -1;
      } else if (!a.lastmod && b.lastmod) {
        return 1;
      }
      
      // Then sort by URL alphabetically
      return a.loc.localeCompare(b.loc);
    });
  }

  /**
   * Apply character limits and truncation
   */
  private applyCharacterLimits(pageResults: PageResult[], stats: GenerationStats): PageResult[] {
    let totalChars = 0;
    const processedResults: PageResult[] = [];
    
    for (const result of pageResults) {
      if (totalChars >= this.options.maxTotalChars) {
        stats.globalLimitReached = true;
        break;
      }
      
      let processedResult = { ...result };
      
      if (result.content.length > this.options.maxCharsPerPage) {
        processedResult.content = result.content.substring(0, this.options.maxCharsPerPage) + 
          `\n\n[TRUNCATED at ${this.options.maxCharsPerPage} chars]`;
        processedResult.truncated = true;
        processedResult.originalLength = result.content.length;
        stats.truncatedPages++;
      }
      
      totalChars += processedResult.content.length;
      processedResults.push(processedResult);
    }
    
    return processedResults;
  }

  /**
   * Generate pages content section
   */
  private generatePagesContent(pageResults: PageResult[]): string {
    const pageContents = pageResults.map((result) => {
      if (!result.success) {
        return `### BEGIN SKIPPED\n` +
               `title: ${result.title}\n` +
               `url: ${result.url}\n` +
               `reason: ${result.error || 'unknown'}\n` +
               `### END SKIPPED`;
      }
      
      // Demote headings in content
      const demotedContent = this.demoteHeadings(result.content);
      
      return `### BEGIN PAGE\n` +
             `title: ${result.title}\n` +
             `url: ${result.url}\n` +
             `### END PAGE\n\n` +
             `${demotedContent}`;
    });
    
    return pageContents.join('\n\n---\n\n');
  }

  /**
   * Demote headings by one level (H1→H2, H2→H3, etc.)
   */
  private demoteHeadings(content: string): string {
    return content.replace(/^(#{1,5})\s/gm, '#$1 ');
  }

  /**
   * Create document metadata
   */
  private createDocumentMetadata(pageCount: number): DocumentMetadata {
    const pkg = this.readPackageJson();
    return {
      projectName: this.options.headerTitle,
      siteUrl: this.options.siteUrl,
      generatedAt: new Date().toISOString(),
      pageCount,
      generator: `next-llms-generator ${pkg.version || '0.1.0'}`
    };
  }

  /**
   * Generate llms-full header
   */
  private generateLlmsFullHeader(metadata: DocumentMetadata): string {
    return `<SYSTEM>This is the full textual snapshot of ${metadata.projectName}</SYSTEM>\n\n` +
           `# llms-full v1\n` +
           `# site: ${metadata.siteUrl}\n` +
           `# generated: ${metadata.generatedAt}\n` +
           `# generator: ${metadata.generator}\n` +
           `# pages: ${metadata.pageCount}`;
  }

  /**
   * Generate table of contents
   */
  private generateTableOfContents(pageResults: PageResult[]): string {
    const tocEntries = pageResults.map((result, index) => {
      const pageIndex = index + 1;
      const title = result.success ? result.title : `(Skipped) ${result.title}`;
      return `- ${pageIndex} ${result.url} — ${title}`;
    });
    
    return `## Table of Contents\n${tocEntries.join('\n')}\n\n---`;
  }

  /**
   * Assemble final llms-full content
   */
  private assembleLlmsFullContent(header: string, toc: string, pagesContent: string): string {
    return `${header}\n\n${toc}\n\n## Pages\n${pagesContent}`;
  }



  /**
   * Apply content filtering and categorization
   */
  private applyContentFiltering(pageResults: PageResult[]): PageResult[] {
    // If no content filter configuration, return original results
    if (!this.options.contentFilter || Object.keys(this.options.contentFilter).length === 0) {
      return pageResults;
    }
    
    try {
      const contentFilter = new ContentFilter(this.options.contentFilter);
      const categorizedResults = contentFilter.filter(pageResults);
      const limitedResults = contentFilter.applyCategoryLimits(categorizedResults);
      
      this.logger.info(`Content filtering applied:`, {
        originalPages: pageResults.length,
        filteredPages: categorizedResults.length,
        finalPages: limitedResults.length
      });
      
      // Log category distribution
      if (this.options.contentFilter.groupByCategory) {
        const grouped = contentFilter.groupByCategory(limitedResults);
        const categoryStats = Object.entries(grouped).map(([category, pages]) => ({
          category,
          count: pages.length
        }));
        this.logger.info('Category distribution:', categoryStats);
      }
      
      return limitedResults;
    } catch (error) {
      this.logger.warn('Content filtering failed, using original results:', error);
      return pageResults;
    }
  }

  /**
   * Apply format-specific limits to options
   */
  private applyFormatLimits(): void {
    const formatLimits = this.options.formatLimits[this.options.outputFormat];
    if (formatLimits) {
      if (formatLimits.maxPages !== undefined) {
        this.options.maxPages = formatLimits.maxPages;
      }
      if (formatLimits.maxCharsPerPage !== undefined) {
        this.options.maxCharsPerPage = formatLimits.maxCharsPerPage;
      }
      if (formatLimits.maxTotalChars !== undefined) {
        this.options.maxTotalChars = formatLimits.maxTotalChars;
      }
    }
  }

  /**
   * Create initial generation statistics
   */
  private createInitialStats(): GenerationStats {
    return {
      totalPages: 0,
      successfulPages: 0,
      failedPages: 0,
      skippedPages: 0,
      truncatedPages: 0,
      totalContentLength: 0,
      totalOriginalLength: 0,
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      globalLimitReached: false,
    };
  }

  /**
   * Create TurndownService instance
   */
  private createTurndownService(): TurndownService {
    return new TurndownService({
      headingStyle: this.extractionConfig.turndownOptions.headingStyle,
      codeBlockStyle: this.extractionConfig.turndownOptions.codeBlockStyle
    });
  }

  /**
   * Create extraction configuration
   */
  private createExtractionConfig(userConfig?: Partial<ExtractionConfig>): ExtractionConfig {
    return {
      stripSelectors: userConfig?.stripSelectors || [
        'header', 'footer', 'nav', '.toc', '.site-header', '.site-footer',
        '.navigation', '.sidebar', '.menu', '.breadcrumb', '.pagination'
      ],
      turndownOptions: {
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        ...userConfig?.turndownOptions
      },
      useReadability: userConfig?.useReadability ?? true
    };
  }

  /**
   * Merge user options with defaults
   */
  private mergeWithDefaults(userOptions: ExtendedGeneratorOptions): Required<ExtendedGeneratorOptions> {
    const pkg = this.readPackageJson();
    const siteUrl = (userOptions.siteUrl || 
      process.env.SITE_URL || 
      process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    
    if (!siteUrl) {
      throw new GeneratorError(
        'siteUrl not set. Provide options.siteUrl or NEXT_PUBLIC_SITE_URL environment variable.',
        ErrorType.INVALID_URL
      );
    }

    return {
      siteUrl,
      sitemapUrl: userOptions.sitemapUrl || `${siteUrl}/sitemap.xml`,
      maxPages: userOptions.maxPages ?? 5000,
      concurrency: userOptions.concurrency ?? 5,
      includePatterns: userOptions.includePatterns || [],
      excludePatterns: userOptions.excludePatterns || [],
      stripSelectors: userOptions.stripSelectors || [],
      headerTitle: userOptions.headerTitle || pkg.name || 'Site',
      headerSummary: userOptions.headerSummary || pkg.description || 'Complete textual snapshot for LLM ingestion.',
      userAgent: userOptions.userAgent || 'next-llms-generator/0.1.0',
      requestTimeoutMs: userOptions.requestTimeoutMs ?? 20000,
      maxCharsPerPage: userOptions.maxCharsPerPage ?? 200000,
      maxTotalChars: userOptions.maxTotalChars ?? 50000000,
      retries: userOptions.retries ?? 3,
      keepQueryParams: userOptions.keepQueryParams || [],
      respectRobots: userOptions.respectRobots ?? false,
      customHeaders: userOptions.customHeaders || {},
      logger: userOptions.logger || new ConsoleLogger(),
      extractionConfig: userOptions.extractionConfig || {},
      includeStats: userOptions.includeStats ?? false,
      contentTransformer: userOptions.contentTransformer || ((content: string) => content),
      enableRecursiveDiscovery: userOptions.enableRecursiveDiscovery ?? false,
      maxRecursiveDepth: userOptions.maxRecursiveDepth ?? 3,
      maxLinksPerPage: userOptions.maxLinksPerPage ?? 50,
      enableContentCleaning: userOptions.enableContentCleaning ?? false,
      enableMultipleExtractionMethods: userOptions.enableMultipleExtractionMethods ?? false,
      requestDelay: userOptions.requestDelay ?? 100,
      enableFileSystemDiscovery: userOptions.enableFileSystemDiscovery ?? false,
      fileSystemBasePath: userOptions.fileSystemBasePath || process.cwd(),
      fileIncludePatterns: userOptions.fileIncludePatterns || ['**/*.md', '**/*.mdx', '**/*.txt'],
      fileExcludePatterns: userOptions.fileExcludePatterns || ['**/node_modules/**', '**/.*/**', '**/dist/**', '**/build/**'],
      maxFileSystemDepth: userOptions.maxFileSystemDepth ?? 10,
      followSymlinks: userOptions.followSymlinks ?? false,
      outputFormat: userOptions.outputFormat ?? 'full',
      formatLimits: userOptions.formatLimits ?? {
        full: {
          maxPages: 5000,
          maxCharsPerPage: 200000,
          maxTotalChars: 50000000
        },
        small: {
          maxPages: 100,
          maxCharsPerPage: 50000,
          maxTotalChars: 5000000
        },
        minimal: {
          maxPages: 20,
          maxCharsPerPage: 10000,
          maxTotalChars: 200000
        }
      },
      contentFilter: userOptions.contentFilter || {}
    };
  }

  /**
   * Read package.json file
   */
  private readPackageJson(): { name?: string; description?: string; version?: string } {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageContent = fs.readFileSync(packagePath, 'utf8');
      return JSON.parse(packageContent);
    } catch {
      return {};
    }
  }
}

/**
 * Convenience function for generating LLMS content
 */
export async function generateFullLLMS(options: GeneratorOptions = {}): Promise<string> {
  const generator = new LLMSGenerator(options);
  return generator.generate();
}

// Export utility functions
export { ErrorType, GeneratorError } from './types.js';