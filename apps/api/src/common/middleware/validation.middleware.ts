import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class ValidationMiddleware implements NestMiddleware {
  // File type validation mapping - currently unused but kept for future validation
  // private readonly fileTypeMap: Record<string, string[]> = {
  //   'model/stl': ['STL', 'ASCII', 'solid'],
  //   'model/step': ['ISO-10303-21', 'STEP'],
  //   'model/iges': ['IGES', '5.3'],
  //   'application/dxf': ['AutoCAD', 'DXF'],
  // };

  use(req: Request, res: Response, next: NextFunction) {
    // Sanitize all string inputs
    this.sanitizeObject(req.body);
    this.sanitizeObject(req.query);
    this.sanitizeObject(req.params);

    // Validate file uploads if present
    if ('files' in req && req.files) {
      this.validateFiles(
        req.files as MulterFile[] | MulterFile | { [fieldname: string]: MulterFile[] },
      );
    }

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    next();
  }

  private sanitizeObject(obj: Record<string, unknown> | null | undefined): void {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        const strValue = obj[key] as string;
        // Basic sanitization
        obj[key] = strValue.trim();

        // HTML sanitization for fields that might contain HTML
        if (this.isHtmlField(key)) {
          obj[key] = DOMPurify.sanitize(strValue, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
            ALLOWED_ATTR: ['href', 'target'],
          });
        }

        // Remove any potential SQL injection attempts
        obj[key] = this.sanitizeSql(obj[key]);

        // Remove any potential NoSQL injection attempts
        obj[key] = this.sanitizeNoSql(obj[key]);
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key] as Record<string, unknown>);
      }
    }
  }

  private isHtmlField(fieldName: string): boolean {
    const htmlFields = ['description', 'notes', 'comments', 'message'];
    return htmlFields.some((field) => fieldName.toLowerCase().includes(field));
  }

  private sanitizeSql(input: unknown): string {
    if (typeof input !== 'string') return String(input);

    // Remove common SQL injection patterns
    const sqlPatterns = [
      /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|SELECT|UNION|UPDATE)\b)/gi,
      /(--)/g,
      /(\/\*[\s\S]*?\*\/)/g,
      /(;)/g,
      /(\|\|)/g,
    ];

    let sanitized = input;
    sqlPatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized;
  }

  private sanitizeNoSql(input: unknown): string {
    if (typeof input !== 'string') return String(input);

    // Remove MongoDB injection patterns
    const noSqlPatterns = [
      /(\$[a-zA-Z]+)/g, // $ne, $gt, etc.
      /({|})/g,
      /(\[|\])/g,
    ];

    let sanitized = input;
    noSqlPatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized;
  }

  private validateFiles(
    files: MulterFile[] | MulterFile | { [fieldname: string]: MulterFile[] },
  ): void {
    const maxFileSize = 50 * 1024 * 1024; // 50MB
    const allowedExtensions = ['.stl', '.step', '.stp', '.iges', '.igs', '.dxf'];

    const fileArray = Array.isArray(files) ? files : [files];

    fileArray.forEach((file: MulterFile) => {
      // Check file size
      if (file.size > maxFileSize) {
        throw new BadRequestException(`File ${file.originalname} exceeds maximum size of 50MB`);
      }

      // Check file extension
      const extension = file.originalname
        .toLowerCase()
        .substring(file.originalname.lastIndexOf('.'));
      if (!allowedExtensions.includes(extension)) {
        throw new BadRequestException(`File type ${extension} is not allowed`);
      }

      // Check MIME type
      const validMimeTypes = [
        'model/stl',
        'model/step',
        'model/iges',
        'application/dxf',
        'application/octet-stream',
      ];
      if (!validMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(`MIME type ${file.mimetype} is not allowed`);
      }

      // Validate magic numbers for file content
      this.validateFileMagicNumbers(file);
    });
  }

  private validateFileMagicNumbers(file: MulterFile): void {
    if (!file.buffer || file.buffer.length < 20) {
      // Skip validation for files without buffer or too small
      return;
    }

    const buffer = file.buffer;
    const extension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    // Magic number validation based on file type
    switch (extension) {
      case '.stl': {
        // ASCII STL files start with "solid"
        const asciiSTL = buffer.subarray(0, 5).toString('ascii');
        // Binary STL files have 80-byte header (can be anything) + uint32 for triangle count
        const isBinarySTL = buffer.length > 84;

        if (!asciiSTL.startsWith('solid') && !isBinarySTL) {
          throw new BadRequestException(`Invalid STL file format`);
        }
        break;
      }

      case '.step':
      case '.stp': {
        // STEP files start with "ISO-10303-21"
        const stepHeader = buffer.subarray(0, 13).toString('ascii');
        if (!stepHeader.includes('ISO-10303-21')) {
          throw new BadRequestException(`Invalid STEP file format`);
        }
        break;
      }

      case '.iges':
      case '.igs': {
        // IGES files have specific markers at byte positions
        // Check for 'S' at position 72 (Start Section)
        if (buffer.length > 72 && buffer[72] !== 0x53) {
          throw new BadRequestException(`Invalid IGES file format`);
        }
        break;
      }

      case '.dxf': {
        // DXF files typically start with group code "0" followed by "SECTION" or similar
        const dxfHeader = buffer.subarray(0, 20).toString('ascii');
        if (!dxfHeader.includes('0\r\n') && !dxfHeader.includes('0\n')) {
          throw new BadRequestException(`Invalid DXF file format`);
        }
        break;
      }

      default:
        // Unknown file type, skip magic number validation
        break;
    }
  }
}

// Global validation schemas
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const createValidationPipe = <T>(schema: z.ZodSchema<T>) => {
  return (value: unknown): T => {
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      throw error;
    }
  };
};
