import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { JSDOM } from 'jsdom';
import { SourceType } from '../dto/analyze-link.dto';

export interface RawContent {
  url: string;
  sourceType: SourceType;
  title: string;
  description: string;
  images: string[];
  rawHtml: string;
  links: string[];
  metadata: Record<string, any>;
}

@Injectable()
export class ContentFetcherService {
  private readonly logger = new Logger(ContentFetcherService.name);

  constructor(private readonly httpService: HttpService) {}

  async fetchContent(url: string): Promise<RawContent> {
    try {
      this.logger.log(`Fetching content from: ${url}`);

      // Validate and normalize URL
      const normalizedUrl = this.normalizeUrl(url);
      const sourceType = this.detectSourceType(normalizedUrl);

      // Fetch with appropriate headers and size limits
      const response = await firstValueFrom(
        this.httpService.get(normalizedUrl, {
          headers: {
            'User-Agent': 'Cotiza Studio-Bot/1.0 (Maker Quote Analysis)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            DNT: '1',
            Connection: 'keep-alive',
          },
          timeout: 30000, // 30 second timeout
          maxRedirects: 5,
          maxContentLength: 10 * 1024 * 1024, // 10MB limit
          maxBodyLength: 10 * 1024 * 1024, // 10MB limit
        }),
      );

      const html = response.data;

      // Validate content size before DOM parsing
      if (typeof html === 'string' && html.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Content too large to process');
      }

      // Create DOM with resource limits
      const dom = new JSDOM(html, {
        resources: 'usable',
        runScripts: 'outside-only',
        pretendToBeVisual: false,
        virtualConsole: new JSDOM().window.console, // Suppress JSDOM warnings
      });
      const document = dom.window.document;

      // Extract basic metadata
      const title = this.extractTitle(document);
      const description = this.extractDescription(document);
      const images = this.extractImages(document, normalizedUrl);
      const links = this.extractLinks(document, normalizedUrl);

      // Extract additional metadata based on source type
      const metadata = await this.extractSourceSpecificMetadata(
        document,
        sourceType,
        normalizedUrl,
      );

      return {
        url: normalizedUrl,
        sourceType,
        title,
        description,
        images,
        rawHtml: html,
        links,
        metadata,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch content from ${url}:`, error);
      throw new BadRequestException(
        `Unable to fetch content from the provided URL: ${error.message}`,
      );
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Validate protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }

      // Remove tracking parameters
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'ref',
        'source',
      ];
      trackingParams.forEach((param) => urlObj.searchParams.delete(param));

      return urlObj.toString();
    } catch (error) {
      throw new BadRequestException('Invalid URL format');
    }
  }

  private detectSourceType(url: string): SourceType {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('instructables.com')) return SourceType.INSTRUCTABLES;
    if (hostname.includes('thingiverse.com')) return SourceType.THINGIVERSE;
    if (hostname.includes('github.com')) return SourceType.GITHUB;
    if (hostname.includes('hackster.io')) return SourceType.HACKSTER;
    if (hostname.includes('makezine.com') || hostname.includes('make.co'))
      return SourceType.MAKE_MAGAZINE;

    return SourceType.CUSTOM_BLOG;
  }

  private extractTitle(document: Document): string {
    // Try multiple selectors in order of preference
    const selectors = [
      'h1.header-title', // Instructables
      'h1[data-testid="thing-title"]', // Thingiverse
      '.js-repo-name', // GitHub
      'h1.project-name', // Hackster
      'h1',
      'title',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return 'Untitled Project';
  }

  private extractDescription(document: Document): string {
    // Try meta description first
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content');
    if (metaDesc?.trim()) {
      return metaDesc.trim();
    }

    // Try source-specific selectors
    const selectors = [
      '.step-intro p', // Instructables intro
      '.thing-summary', // Thingiverse
      '.repository-content .markdown-body p', // GitHub README
      '.project-description', // Hackster
      'article p:first-child',
      '.content p:first-child',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim().substring(0, 500);
      }
    }

    return '';
  }

  private extractImages(document: Document, baseUrl: string): string[] {
    const images: string[] = [];
    const imageSelectors = [
      '.step-img img', // Instructables
      '.thing-image img', // Thingiverse
      '.readme img', // GitHub
      '.project-gallery img', // Hackster
      'article img',
      '.content img',
    ];

    for (const selector of imageSelectors) {
      const imgElements = document.querySelectorAll(selector);
      imgElements.forEach((img) => {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        if (src) {
          try {
            const fullUrl = new URL(src, baseUrl).toString();
            if (!images.includes(fullUrl)) {
              images.push(fullUrl);
            }
          } catch (error) {
            // Skip invalid URLs
          }
        }
      });
    }

    return images.slice(0, 10); // Limit to first 10 images
  }

  private extractLinks(document: Document, baseUrl: string): string[] {
    const links: string[] = [];
    const linkElements = document.querySelectorAll('a[href]');

    linkElements.forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        try {
          const fullUrl = new URL(href, baseUrl).toString();
          // Only include relevant file links
          if (this.isRelevantFileLink(fullUrl)) {
            links.push(fullUrl);
          }
        } catch (error) {
          // Skip invalid URLs
        }
      }
    });

    return links;
  }

  private isRelevantFileLink(url: string): boolean {
    const relevantExtensions = [
      '.stl',
      '.obj',
      '.ply',
      '.3mf', // 3D files
      '.step',
      '.stp',
      '.iges',
      '.igs', // CAD files
      '.dwg',
      '.dxf', // 2D CAD files
      '.zip',
      '.rar',
      '.7z', // Archives
      '.pdf', // Documentation
      '.csv',
      '.xlsx', // BOM files
      '.ino',
      '.py',
      '.cpp',
      '.c',
      '.h', // Code files
    ];

    const urlLower = url.toLowerCase();
    return relevantExtensions.some((ext) => urlLower.includes(ext));
  }

  private async extractSourceSpecificMetadata(
    document: Document,
    sourceType: SourceType,
    url: string,
  ): Promise<Record<string, any>> {
    const metadata: Record<string, any> = {};

    switch (sourceType) {
      case SourceType.INSTRUCTABLES:
        metadata.supplies = this.extractInstructablesSupplies(document);
        metadata.tools = this.extractInstructablesTools(document);
        metadata.steps = this.extractInstructablesSteps(document);
        metadata.difficulty = this.extractInstructablesDifficulty(document);
        metadata.estimatedTime = this.extractInstructablesTime(document);
        break;

      case SourceType.THINGIVERSE:
        metadata.printSettings = this.extractThingiverseSettings(document);
        metadata.files = this.extractThingiverseFiles(document);
        metadata.category = this.extractThingiverseCategory(document);
        metadata.license = this.extractThingiverseLicense(document);
        break;

      case SourceType.GITHUB:
        metadata.files = await this.extractGitHubFiles(document, url);
        metadata.readme = this.extractGitHubReadme(document);
        metadata.language = this.extractGitHubLanguage(document);
        metadata.releases = this.extractGitHubReleases(document);
        break;

      case SourceType.HACKSTER:
        metadata.components = this.extractHacksterComponents(document);
        metadata.difficulty = this.extractHacksterDifficulty(document);
        metadata.platforms = this.extractHacksterPlatforms(document);
        break;
    }

    return metadata;
  }

  private extractInstructablesSupplies(
    document: Document,
  ): Array<{ name: string; quantity?: string; notes?: string }> {
    const supplies: Array<{ name: string; quantity?: string; notes?: string }> = [];

    // Look for supplies section
    const suppliesSection = document.querySelector(
      '.supplies-section, .step-supplies, [data-macro="supplies"]',
    );
    if (suppliesSection) {
      const items = suppliesSection.querySelectorAll('li, .supply-item');
      items.forEach((item) => {
        const text = item.textContent?.trim();
        if (text) {
          // Try to parse quantity from text like "2x Arduino Uno"
          const quantityMatch = text.match(/^(\d+)x?\s*(.+)$/i);
          if (quantityMatch) {
            supplies.push({
              name: quantityMatch[2].trim(),
              quantity: quantityMatch[1],
            });
          } else {
            supplies.push({ name: text });
          }
        }
      });
    }

    return supplies;
  }

  private extractInstructablesTools(document: Document): string[] {
    const tools: string[] = [];
    const toolsSection = document.querySelector('.tools-section, .step-tools');

    if (toolsSection) {
      const items = toolsSection.querySelectorAll('li');
      items.forEach((item) => {
        const text = item.textContent?.trim();
        if (text) tools.push(text);
      });
    }

    return tools;
  }

  private extractInstructablesSteps(
    document: Document,
  ): Array<{ title: string; content: string; images: string[] }> {
    const steps: Array<{ title: string; content: string; images: string[] }> = [];
    const stepElements = document.querySelectorAll('.step, .step-item');

    stepElements.forEach((step, index) => {
      const title =
        step.querySelector('.step-title, .step-header h2, h3')?.textContent?.trim() ||
        `Step ${index + 1}`;
      const content = step.querySelector('.step-body, .step-content p')?.textContent?.trim() || '';

      const images: string[] = [];
      step.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src');
        if (src) images.push(src);
      });

      steps.push({ title, content, images });
    });

    return steps;
  }

  private extractInstructablesDifficulty(document: Document): string {
    const difficultyEl = document.querySelector('.difficulty, [data-difficulty]');
    return difficultyEl?.textContent?.trim() || 'intermediate';
  }

  private extractInstructablesTime(document: Document): number {
    const timeEl = document.querySelector('.time-required, .duration');
    const timeText = timeEl?.textContent?.trim();

    if (timeText) {
      const hourMatch = timeText.match(/(\d+)\s*hours?/i);
      const minMatch = timeText.match(/(\d+)\s*minutes?/i);

      let hours = hourMatch ? parseInt(hourMatch[1]) : 0;
      const minutes = minMatch ? parseInt(minMatch[1]) : 0;

      hours += minutes / 60;
      return hours;
    }

    return 2; // Default 2 hours
  }

  private extractThingiverseSettings(document: Document): Record<string, any> {
    const settings: Record<string, any> = {};

    const settingsSection = document.querySelector('.thing-print-settings, .print-settings');
    if (settingsSection) {
      const items = settingsSection.querySelectorAll('li, .setting-item');
      items.forEach((item) => {
        const text = item.textContent?.trim();
        if (text && text.includes(':')) {
          const [key, value] = text.split(':');
          settings[key.trim().toLowerCase()] = value.trim();
        }
      });
    }

    return settings;
  }

  private extractThingiverseFiles(
    document: Document,
  ): Array<{ name: string; url: string; size?: string }> {
    const files: Array<{ name: string; url: string; size?: string }> = [];

    const fileElements = document.querySelectorAll('.thing-file, .file-item');
    fileElements.forEach((fileEl) => {
      const nameEl = fileEl.querySelector('.file-name');
      const linkEl = fileEl.querySelector('a[href*="download"]');
      const sizeEl = fileEl.querySelector('.file-size');

      if (nameEl && linkEl) {
        files.push({
          name: nameEl.textContent?.trim() || '',
          url: linkEl.getAttribute('href') || '',
          size: sizeEl?.textContent?.trim(),
        });
      }
    });

    return files;
  }

  private extractThingiverseCategory(document: Document): string {
    const categoryEl = document.querySelector('.thing-category, .category-tag');
    return categoryEl?.textContent?.trim() || 'uncategorized';
  }

  private extractThingiverseLicense(document: Document): string {
    const licenseEl = document.querySelector('.license, [data-license]');
    return licenseEl?.textContent?.trim() || 'Creative Commons';
  }

  private async extractGitHubFiles(
    document: Document,
    _url: string,
  ): Promise<Array<{ name: string; path: string; type: string }>> {
    const files: Array<{ name: string; path: string; type: string }> = [];

    // Extract files from repository file list
    const fileElements = document.querySelectorAll('.js-navigation-item');
    fileElements.forEach((fileEl) => {
      const nameEl = fileEl.querySelector('.js-navigation-open');
      const typeEl = fileEl.querySelector('.octicon-file, .octicon-file-directory');

      if (nameEl) {
        const name = nameEl.textContent?.trim() || '';
        const href = nameEl.getAttribute('href') || '';
        const isDirectory = typeEl?.classList.contains('octicon-file-directory');

        files.push({
          name,
          path: href,
          type: isDirectory ? 'directory' : 'file',
        });
      }
    });

    return files;
  }

  private extractGitHubReadme(document: Document): string {
    const readmeEl = document.querySelector('#readme .markdown-body');
    return readmeEl?.textContent?.trim() || '';
  }

  private extractGitHubLanguage(document: Document): string {
    const langEl = document.querySelector(
      '.BorderGrid-cell [data-testid="repository-language-stats"] span',
    );
    return langEl?.textContent?.trim() || '';
  }

  private extractGitHubReleases(
    document: Document,
  ): Array<{ tag: string; name: string; url: string }> {
    const releases: Array<{ tag: string; name: string; url: string }> = [];

    const releaseElements = document.querySelectorAll('.release-entry');
    releaseElements.forEach((releaseEl) => {
      const tagEl = releaseEl.querySelector('.release-header a');
      const nameEl = releaseEl.querySelector('.release-title');

      if (tagEl) {
        releases.push({
          tag: tagEl.textContent?.trim() || '',
          name: nameEl?.textContent?.trim() || '',
          url: tagEl.getAttribute('href') || '',
        });
      }
    });

    return releases;
  }

  private extractHacksterComponents(
    document: Document,
  ): Array<{ name: string; quantity?: string }> {
    const components: Array<{ name: string; quantity?: string }> = [];

    const componentsSection = document.querySelector('.components-section, .project-components');
    if (componentsSection) {
      const items = componentsSection.querySelectorAll('li, .component-item');
      items.forEach((item) => {
        const text = item.textContent?.trim();
        if (text) {
          const quantityMatch = text.match(/^(\d+)x?\s*(.+)$/i);
          if (quantityMatch) {
            components.push({
              name: quantityMatch[2].trim(),
              quantity: quantityMatch[1],
            });
          } else {
            components.push({ name: text });
          }
        }
      });
    }

    return components;
  }

  private extractHacksterDifficulty(document: Document): string {
    const difficultyEl = document.querySelector('.difficulty-badge, [data-difficulty]');
    return difficultyEl?.textContent?.trim() || 'intermediate';
  }

  private extractHacksterPlatforms(document: Document): string[] {
    const platforms: string[] = [];
    const platformElements = document.querySelectorAll('.platform-tag, .used-platform');

    platformElements.forEach((el) => {
      const platform = el.textContent?.trim();
      if (platform) platforms.push(platform);
    });

    return platforms;
  }
}
