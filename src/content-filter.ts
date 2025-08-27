import type { ContentCategory, ContentFilterConfig, CategorizedPageResult, PageResult } from './types';

/**
 * Default content categories for common documentation types
 */
export const DEFAULT_CATEGORIES: ContentCategory[] = [
  {
    id: 'api',
    name: 'API Documentation',
    description: 'API references, endpoints, and technical specifications',
    priority: 10,
    urlPatterns: ['/api/', '/docs/api/', '/reference/', '/endpoints/'],
    contentPatterns: ['API', 'endpoint', 'REST', 'GraphQL', 'HTTP', 'request', 'response'],
    filePatterns: ['**/api/**', '**/reference/**'],
    maxPages: 50,
    enabled: true
  },
  {
    id: 'guides',
    name: 'Guides & Tutorials',
    description: 'Step-by-step guides and tutorials',
    priority: 9,
    urlPatterns: ['/guides/', '/tutorials/', '/how-to/', '/getting-started/'],
    contentPatterns: ['tutorial', 'guide', 'step', 'how to', 'getting started', 'walkthrough'],
    filePatterns: ['**/guides/**', '**/tutorials/**'],
    maxPages: 30,
    enabled: true
  },
  {
    id: 'concepts',
    name: 'Concepts & Theory',
    description: 'Conceptual documentation and theoretical explanations',
    priority: 8,
    urlPatterns: ['/concepts/', '/theory/', '/fundamentals/', '/overview/'],
    contentPatterns: ['concept', 'theory', 'fundamental', 'overview', 'introduction', 'architecture'],
    filePatterns: ['**/concepts/**', '**/fundamentals/**'],
    maxPages: 25,
    enabled: true
  },
  {
    id: 'examples',
    name: 'Examples & Code Samples',
    description: 'Code examples and sample implementations',
    priority: 7,
    urlPatterns: ['/examples/', '/samples/', '/demos/', '/playground/'],
    contentPatterns: ['example', 'sample', 'demo', 'code', 'implementation', 'snippet'],
    filePatterns: ['**/examples/**', '**/samples/**', '**/demos/**'],
    maxPages: 20,
    enabled: true
  },
  {
    id: 'configuration',
    name: 'Configuration',
    description: 'Configuration options and setup instructions',
    priority: 6,
    urlPatterns: ['/config/', '/configuration/', '/setup/', '/installation/'],
    contentPatterns: ['config', 'configuration', 'setup', 'install', 'environment', 'settings'],
    filePatterns: ['**/config/**', '**/configuration/**'],
    maxPages: 15,
    enabled: true
  },
  {
    id: 'troubleshooting',
    name: 'Troubleshooting & FAQ',
    description: 'Common issues, solutions, and frequently asked questions',
    priority: 5,
    urlPatterns: ['/troubleshooting/', '/faq/', '/issues/', '/problems/'],
    contentPatterns: ['troubleshoot', 'FAQ', 'problem', 'issue', 'error', 'fix', 'solution'],
    filePatterns: ['**/troubleshooting/**', '**/faq/**'],
    maxPages: 15,
    enabled: true
  },
  {
    id: 'changelog',
    name: 'Changelog & Release Notes',
    description: 'Version history and release information',
    priority: 4,
    urlPatterns: ['/changelog/', '/releases/', '/history/', '/versions/'],
    contentPatterns: ['changelog', 'release', 'version', 'history', 'update', 'breaking change'],
    filePatterns: ['**/CHANGELOG.md', '**/HISTORY.md', '**/releases/**'],
    maxPages: 10,
    enabled: true
  },
  {
    id: 'blog',
    name: 'Blog Posts',
    description: 'Blog posts and articles',
    priority: 3,
    urlPatterns: ['/blog/', '/articles/', '/posts/', '/news/'],
    contentPatterns: ['blog', 'article', 'post', 'news', 'announcement'],
    filePatterns: ['**/blog/**', '**/posts/**'],
    maxPages: 10,
    enabled: false // Disabled by default as blogs can be noisy
  },
  {
    id: 'general',
    name: 'General Documentation',
    description: 'General documentation that doesn\'t fit other categories',
    priority: 2,
    urlPatterns: ['/docs/', '/documentation/'],
    contentPatterns: [],
    filePatterns: ['**/docs/**', '**/documentation/**'],
    enabled: true
  }
];

/**
 * Default content filter configuration
 */
export const DEFAULT_FILTER_CONFIG: ContentFilterConfig = {
  categories: DEFAULT_CATEGORIES,
  defaultCategory: 'general',
  groupByCategory: true,
  includeCategoryMetadata: true,
  minContentLength: 100,
  maxContentLength: 50000,
  priorityKeywords: ['documentation', 'guide', 'tutorial', 'API', 'reference'],
  excludeKeywords: ['404', 'not found', 'error', 'maintenance']
};

/**
 * Content filtering and categorization utility class
 */
export class ContentFilter {
  private config: ContentFilterConfig;

  constructor(config: Partial<ContentFilterConfig> = {}) {
    this.config = { ...DEFAULT_FILTER_CONFIG, ...config };
  }

  /**
   * Categorize a page result based on URL and content patterns
   */
  categorize(page: PageResult): CategorizedPageResult {
    const category = this.findBestCategory(page);
    const relevanceScore = this.calculateRelevanceScore(page, category);
    const matchedKeywords = this.findMatchedKeywords(page);

    return {
      ...page,
      category: category.id,
      categoryPriority: category.priority,
      relevanceScore,
      matchedKeywords
    };
  }

  /**
   * Filter pages based on content criteria
   */
  filter(pages: PageResult[]): CategorizedPageResult[] {
    return pages
      .map(page => this.categorize(page))
      .filter(page => this.shouldIncludePage(page))
      .sort((a, b) => this.comparePriority(a, b));
  }

  /**
   * Group categorized pages by category
   */
  groupByCategory(pages: CategorizedPageResult[]): Record<string, CategorizedPageResult[]> {
    const grouped: Record<string, CategorizedPageResult[]> = {};
    
    for (const page of pages) {
      if (!grouped[page.category]) {
        grouped[page.category] = [];
      }
      grouped[page.category]!.push(page);
    }
    
    return grouped;
  }

  /**
   * Apply category-specific page limits
   */
  applyCategoryLimits(pages: CategorizedPageResult[]): CategorizedPageResult[] {
    const grouped = this.groupByCategory(pages);
    const result: CategorizedPageResult[] = [];
    
    for (const [categoryId, categoryPages] of Object.entries(grouped)) {
      const category = this.config.categories.find(c => c.id === categoryId);
      const maxPages = category?.maxPages ?? categoryPages.length;
      
      result.push(...categoryPages.slice(0, maxPages));
    }
    
    return result;
  }

  /**
   * Find the best matching category for a page
   */
  private findBestCategory(page: PageResult): ContentCategory {
    const defaultCategory = this.config.categories.find(c => c.id === this.config.defaultCategory);
    let bestCategory = defaultCategory || this.config.categories[0];
    if (!bestCategory) {
      throw new Error('No categories available for content filtering');
    }
    let bestScore = 0;

    for (const category of this.config.categories) {
      if (!category.enabled) continue;
      
      const score = this.calculateCategoryScore(page, category);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    return bestCategory;
  }

  /**
   * Calculate how well a page matches a category
   */
  private calculateCategoryScore(page: PageResult, category: ContentCategory): number {
    let score = 0;
    
    // URL pattern matching
    for (const pattern of category.urlPatterns) {
      if (page.url.toLowerCase().includes(pattern.toLowerCase())) {
        score += 10;
      }
    }
    
    // Content pattern matching
    const content = (page.title + ' ' + page.content).toLowerCase();
    for (const pattern of category.contentPatterns) {
      const regex = new RegExp(pattern.toLowerCase(), 'gi');
      const matches = content.match(regex);
      if (matches) {
        score += matches.length * 2;
      }
    }
    
    return score;
  }

  /**
   * Calculate relevance score for a page
   */
  private calculateRelevanceScore(page: PageResult, category: ContentCategory): number {
    let score = 0.5; // Base score
    
    // Priority keywords boost
    if (this.config.priorityKeywords) {
      const content = (page.title + ' ' + page.content).toLowerCase();
      for (const keyword of this.config.priorityKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          score += 0.1;
        }
      }
    }
    
    // Content length factor
    if (page.contentLength > 1000) {
      score += 0.1;
    }
    
    // Category priority factor
    score += (category.priority / 100);
    
    return Math.min(1, score);
  }

  /**
   * Find keywords that matched in the page content
   */
  private findMatchedKeywords(page: PageResult): string[] {
    const matched: string[] = [];
    const content = (page.title + ' ' + page.content).toLowerCase();
    
    if (this.config.priorityKeywords) {
      for (const keyword of this.config.priorityKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          matched.push(keyword);
        }
      }
    }
    
    return matched;
  }

  /**
   * Determine if a page should be included based on filters
   */
  private shouldIncludePage(page: CategorizedPageResult): boolean {
    // Content length filter
    if (this.config.minContentLength && page.contentLength < this.config.minContentLength) {
      return false;
    }
    
    if (this.config.maxContentLength && page.contentLength > this.config.maxContentLength) {
      return false;
    }
    
    // Exclude keywords filter
    if (this.config.excludeKeywords) {
      const content = (page.title + ' ' + page.content).toLowerCase();
      for (const keyword of this.config.excludeKeywords) {
        if (content.includes(keyword.toLowerCase())) {
          return false;
        }
      }
    }
    
    // Category enabled filter
    const category = this.config.categories.find(c => c.id === page.category);
    if (!category?.enabled) {
      return false;
    }
    
    return true;
  }

  /**
   * Compare pages for sorting by priority
   */
  private comparePriority(a: CategorizedPageResult, b: CategorizedPageResult): number {
    // First by category priority
    if (a.categoryPriority !== b.categoryPriority) {
      return b.categoryPriority - a.categoryPriority;
    }
    
    // Then by relevance score
    if (a.relevanceScore !== b.relevanceScore) {
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    }
    
    // Finally by content length
    return b.contentLength - a.contentLength;
  }
}