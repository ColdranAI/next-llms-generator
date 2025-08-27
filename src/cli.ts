#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LLMSGenerator } from "./generate.js";
import type { ExtendedGeneratorOptions } from "./types.js";
import { ConsoleLogger } from "./types.js";

/**
 * CLI configuration interface
 */
interface CLIConfig {
  /** Output file path (default: public/llms.txt) */
  output?: string;
  
  /** Configuration file path */
  config?: string;
  
  /** Verbose logging */
  verbose?: boolean;
  
  /** Dry run mode */
  dryRun?: boolean;
  
  /** Force overwrite existing files */
  force?: boolean;
  
  /** Include generation statistics */
  stats?: boolean;
}

/**
 * CLI class for handling command-line operations
 */
class LLMSCLI {
  private readonly logger: ConsoleLogger;
  private readonly config: CLIConfig;

  constructor(config: CLIConfig = {}) {
    this.config = {
      output: 'public/llms.txt',
      verbose: false,
      dryRun: false,
      force: false,
      stats: false,
      ...config
    };
    
    this.logger = new ConsoleLogger(this.config.verbose ? 'debug' : 'info');
  }

  /**
   * Main CLI execution method
   */
  async run(): Promise<void> {
    try {
      this.logger.info('🚀 Starting next-llms-generator CLI');
      
      // Load configuration
      const generatorOptions = await this.loadConfiguration();
      
      // Generate content
      this.logger.info('📄 Generating LLMS content...');
      const generatorConfig: ExtendedGeneratorOptions = {
        ...generatorOptions,
        logger: this.logger
      };
      
      if (this.config.stats !== undefined) {
        generatorConfig.includeStats = this.config.stats;
      }
      
      const generator = new LLMSGenerator(generatorConfig);
      
      const content = await generator.generate();
      
      // Handle dry run
      if (this.config.dryRun) {
        this.logger.info('🔍 Dry run mode - content would be written to:', this.getOutputPath());
        this.logger.info(`📊 Content length: ${content.length.toLocaleString()} characters`);
        return;
      }
      
      // Write to file
      await this.writeOutput(content);
      
      this.logger.info('✅ LLMS content generated successfully!');
      this.logger.info(`📁 Output: ${this.getOutputPath()}`);
      this.logger.info(`📊 Size: ${content.length.toLocaleString()} characters`);
      
    } catch (error) {
      this.logger.error('❌ Failed to generate LLMS content:', error);
      process.exit(1);
    }
  }

  /**
   * Load configuration from file or environment
   */
  private async loadConfiguration(): Promise<ExtendedGeneratorOptions> {
    let config: ExtendedGeneratorOptions = {};
    
    // Load from config file if specified
    if (this.config.config) {
      config = await this.loadConfigFile(this.config.config);
    } else {
      // Try to load from default locations
      const defaultConfigs = [
        'llms.config.js',
        'llms.config.mjs',
        'llms.config.json',
        '.llmsrc.json',
        '.llmsrc.js'
      ];
      
      for (const configFile of defaultConfigs) {
        const configPath = path.join(process.cwd(), configFile);
        if (fs.existsSync(configPath)) {
          this.logger.debug(`📋 Loading config from: ${configFile}`);
          config = await this.loadConfigFile(configPath);
          break;
        }
      }
    }
    
    // Override with environment variables
    if (process.env.NEXT_PUBLIC_SITE_URL && !config.siteUrl) {
      config.siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    }
    
    if (process.env.LLMS_MAX_PAGES && !config.maxPages) {
      config.maxPages = parseInt(process.env.LLMS_MAX_PAGES, 10);
    }
    
    if (process.env.LLMS_CONCURRENCY && !config.concurrency) {
      config.concurrency = parseInt(process.env.LLMS_CONCURRENCY, 10);
    }
    
    return config;
  }

  /**
   * Load configuration from a file
   */
  private async loadConfigFile(configPath: string): Promise<ExtendedGeneratorOptions> {
    try {
      const absolutePath = path.resolve(configPath);
      
      if (configPath.endsWith('.json')) {
        const content = fs.readFileSync(absolutePath, 'utf8');
        return JSON.parse(content);
      } else {
        // Dynamic import for JS/MJS files
        const configUrl = `file://${absolutePath}`;
        const module = await import(configUrl);
        return module.default || module;
      }
    } catch (error) {
      throw new Error(`Failed to load config file: ${configPath}. ${error}`);
    }
  }

  /**
   * Write content to output file
   */
  private async writeOutput(content: string): Promise<void> {
    const outputPath = this.getOutputPath();
    const outputDir = path.dirname(outputPath);
    
    // Check if file exists and force flag
    if (fs.existsSync(outputPath) && !this.config.force) {
      throw new Error(`Output file already exists: ${outputPath}. Use --force to overwrite.`);
    }
    
    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Write file
    fs.writeFileSync(outputPath, content, 'utf8');
  }

  /**
   * Get the absolute output path
   */
  private getOutputPath(): string {
    const outputPath = this.config.output!;
    return path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIConfig {
  const config: CLIConfig = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    
    switch (arg) {
      case '--output':
      case '-o':
        const outputValue = args[++i];
        if (outputValue) config.output = outputValue;
        break;
        
      case '--config':
      case '-c':
        const configValue = args[++i];
        if (configValue) config.config = configValue;
        break;
        
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
        
      case '--dry-run':
      case '-d':
        config.dryRun = true;
        break;
        
      case '--force':
      case '-f':
        config.force = true;
        break;
        
      case '--stats':
      case '-s':
        config.stats = true;
        break;
        
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        
      case '--version':
        printVersion();
        process.exit(0);
        
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }
  
  return config;
}

/**
 * Print help information
 */
function printHelp(): void {
  console.log(`
next-llms-generator - Generate LLM-friendly content from Next.js applications

Usage:
  next-llms-generator [options]
  npx next-llms-generator [options]

Options:
  -o, --output <path>     Output file path (default: public/llms.txt)
  -c, --config <path>     Configuration file path
  -v, --verbose           Enable verbose logging
  -d, --dry-run           Show what would be generated without writing
  -f, --force             Force overwrite existing files
  -s, --stats             Include generation statistics in output
  -h, --help              Show this help message
  --version               Show version number

Configuration:
  You can create a configuration file (llms.config.js, llms.config.json, etc.)
  to customize generation options:

  // llms.config.js
  export default {
    siteUrl: 'https://example.com',
    maxPages: 1000,
    excludePatterns: ['/admin/', '/api/'],
    stripSelectors: ['header', 'footer', 'nav']
  };

Environment Variables:
  NEXT_PUBLIC_SITE_URL    Site URL to crawl
  LLMS_MAX_PAGES          Maximum pages to process
  LLMS_CONCURRENCY        Concurrent requests

Examples:
  next-llms-generator
  next-llms-generator --output dist/content.txt
  next-llms-generator --config custom.config.js --verbose
  next-llms-generator --dry-run --stats
`);
}

/**
 * Print version information
 */
function printVersion(): void {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(packageJson.version);
  } catch {
    console.log('0.1.0');
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const config = parseArgs(args);
  const cli = new LLMSCLI(config);
  await cli.run();
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for programmatic use
export { LLMSCLI, parseArgs, printHelp, printVersion };
export type { CLIConfig };