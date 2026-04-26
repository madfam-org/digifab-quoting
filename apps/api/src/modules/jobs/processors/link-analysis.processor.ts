import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { RedisService } from '../../redis/redis.service';
import { ContentFetcherService } from '../../link-processing/services/content-fetcher.service';
import { BOMParserService } from '../../link-processing/services/bom-parser.service';
import { PersonaQuoteGeneratorService } from '../../link-processing/services/persona-quote-generator.service';
import { AnalysisStatus, ProjectContentDto } from '../../link-processing/dto/analyze-link.dto';

@Processor('link-analysis')
export class LinkAnalysisProcessor {
  private readonly logger = new Logger(LinkAnalysisProcessor.name);

  constructor(
    private readonly redis: RedisService,
    private readonly contentFetcher: ContentFetcherService,
    private readonly bomParser: BOMParserService,
    private readonly personaQuoteGenerator: PersonaQuoteGeneratorService,
  ) {}

  @Process()
  async handleLinkAnalysis(job: Job) {
    const { analysisId, tenantId, url, persona, preferences } = job.data;

    this.logger.log(`Processing link analysis job ${job.id} for analysis ${analysisId}`);

    try {
      // Update status: Fetching
      await this.updateAnalysisStatus(
        analysisId,
        AnalysisStatus.FETCHING,
        10,
        'Fetching content from URL...',
      );

      // Step 1: Fetch content
      const rawContent = await this.contentFetcher.fetchContent(url);

      // Update analysis with source type
      await this.updateAnalysisStatus(
        analysisId,
        AnalysisStatus.PARSING,
        25,
        'Parsing content and extracting project information...',
      );

      // Step 2: Parse content into structured format
      const projectContent: ProjectContentDto = {
        title: rawContent.title,
        description: rawContent.description,
        images: rawContent.images,
        files: this.extractProjectFiles(rawContent),
        instructions: this.extractInstructions(rawContent),
        tags: this.extractTags(rawContent),
        difficulty: this.extractDifficulty(rawContent),
        estimatedTime: this.extractEstimatedTime(rawContent),
      };

      // Update status: Analyzing
      await this.updateAnalysisStatus(
        analysisId,
        AnalysisStatus.ANALYZING,
        50,
        'Analyzing BOM and components...',
      );

      // Step 3: Parse BOM
      const parsedBOM = await this.bomParser.parseBOM(rawContent);

      // Update status: Pricing
      await this.updateAnalysisStatus(
        analysisId,
        AnalysisStatus.PRICING,
        75,
        'Generating personalized quotes...',
      );

      // Step 4: Generate persona-based quotes
      const personaQuotes = await this.personaQuoteGenerator.generatePersonaQuotes(
        tenantId,
        parsedBOM,
        persona,
        preferences,
      );

      // Final update: Completed
      await this.updateAnalysis(analysisId, {
        status: AnalysisStatus.COMPLETED,
        progress: 100,
        message: 'Analysis completed successfully',
        content: projectContent,
        bom: {
          totalItems: parsedBOM.items.length,
          estimatedCost: parsedBOM.totalEstimatedCost,
          categories: parsedBOM.categories,
          items: parsedBOM.items,
        },
        quotes: personaQuotes,
      });

      this.logger.log(`Link analysis job ${job.id} completed successfully`);
      return { success: true, analysisId };
    } catch (error) {
      this.logger.error(`Link analysis job ${job.id} failed:`, error);

      await this.updateAnalysis(analysisId, {
        status: AnalysisStatus.FAILED,
        progress: 0,
        message: `Analysis failed: ${error.message}`,
        errors: [
          {
            code: 'PROCESSING_ERROR',
            message: error.message,
            details: error.stack,
          },
        ],
      });

      throw error;
    }
  }

  private async updateAnalysisStatus(
    analysisId: string,
    status: AnalysisStatus,
    progress: number,
    message: string,
  ): Promise<void> {
    await this.updateAnalysis(analysisId, {
      status,
      progress,
      message,
    });
  }

  private async updateAnalysis(analysisId: string, updates: any): Promise<any> {
    const key = this.getAnalysisKey(analysisId);
    const existing = await this.redis.get(key);
    if (!existing || typeof existing !== 'string') {
      throw new Error('Analysis not found');
    }

    const current = JSON.parse(existing);
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date(),
    };

    await this.redis.setex(key, 86400, JSON.stringify(updated));
    return updated;
  }

  private getAnalysisKey(analysisId: string): string {
    return `link-analysis:${analysisId}`;
  }

  private extractProjectFiles(
    rawContent: any,
  ): Array<{ name: string; url: string; type: string; size?: number }> {
    const files = [];

    if (rawContent.metadata.files) {
      rawContent.metadata.files.forEach((file: any) => {
        files.push({
          name: file.name,
          url: file.url,
          type: this.getFileType(file.name),
          size: file.size,
        });
      });
    }

    rawContent.links.forEach((link: string) => {
      const filename = link.split('/').pop() || '';
      if (filename) {
        files.push({
          name: filename,
          url: link,
          type: this.getFileType(filename),
        });
      }
    });

    return files;
  }

  private extractInstructions(
    rawContent: any,
  ): Array<{ step: number; title: string; description: string; images?: string[] }> {
    const instructions = [];

    if (rawContent.metadata.steps) {
      rawContent.metadata.steps.forEach((step: any, index: number) => {
        instructions.push({
          step: index + 1,
          title: step.title,
          description: step.content,
          images: step.images,
        });
      });
    }

    return instructions;
  }

  private extractTags(rawContent: any): string[] {
    const tags = [];

    if (rawContent.metadata.tags) {
      tags.push(...rawContent.metadata.tags);
    }

    if (rawContent.metadata.category) {
      tags.push(rawContent.metadata.category);
    }

    if (rawContent.metadata.platforms) {
      tags.push(...rawContent.metadata.platforms);
    }

    return [...new Set(tags)];
  }

  private extractDifficulty(rawContent: any): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const difficulty = rawContent.metadata.difficulty?.toLowerCase();

    if (['easy', 'beginner', 'simple'].includes(difficulty)) {
      return 'beginner';
    }
    if (['hard', 'advanced', 'complex', 'difficult'].includes(difficulty)) {
      return 'advanced';
    }
    if (['expert', 'professional'].includes(difficulty)) {
      return 'expert';
    }

    return 'intermediate';
  }

  private extractEstimatedTime(rawContent: any): number {
    if (rawContent.metadata.estimatedTime) {
      return rawContent.metadata.estimatedTime;
    }

    const text = rawContent.description.toLowerCase();

    const hourMatch = text.match(/(\d+)\s*hours?/);
    if (hourMatch) {
      return parseInt(hourMatch[1]);
    }

    const minMatch = text.match(/(\d+)\s*minutes?/);
    if (minMatch) {
      return parseInt(minMatch[1]) / 60;
    }

    return 2;
  }

  private getFileType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();

    const typeMap = {
      stl: '3d_model',
      obj: '3d_model',
      ply: '3d_model',
      '3mf': '3d_model',
      step: 'cad_model',
      stp: 'cad_model',
      iges: 'cad_model',
      dwg: '2d_drawing',
      dxf: '2d_drawing',
      pdf: 'document',
      zip: 'archive',
      ino: 'arduino_code',
      py: 'python_code',
      cpp: 'cpp_code',
      c: 'c_code',
      h: 'header_file',
    };

    return typeMap[extension] || 'unknown';
  }
}
