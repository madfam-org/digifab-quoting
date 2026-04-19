import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as AWS from 'aws-sdk';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { FileType, FILE_SIZE_LIMITS } from '@cotiza/shared';
import { getErrorMessage } from '@/common/utils/error-handling';

export interface PresignedUrlResponse {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  fileId: string;
  key: string;
}

@Injectable()
export class FilesService {
  private s3: AWS.S3;
  private readonly bucketName: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.s3 = new AWS.S3({
      region: this.configService.get<string>('aws.s3.region') || 'us-east-1',
      signatureVersion: 'v4',
    });
    this.bucketName = this.configService.get<string>('aws.s3.bucket') || 'madfam-uploads';
  }

  async createPresignedUpload(
    tenantId: string,
    filename: string,
    fileType: FileType,
    fileSize: number,
    userId?: string,
  ): Promise<PresignedUrlResponse> {
    // Validate file size
    if (fileSize > FILE_SIZE_LIMITS.maxFileSizeMB * 1024 * 1024) {
      throw new BadRequestException(
        `File size exceeds maximum of ${FILE_SIZE_LIMITS.maxFileSizeMB}MB`,
      );
    }

    // Validate file type
    const allowedExtensions = this.getAllowedExtensions(fileType);
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      throw new BadRequestException(`Invalid file extension for type ${fileType}`);
    }

    // Generate unique file ID and key
    const fileId = uuidv4();
    const timestamp = Date.now();
    const safeFilename = this.sanitizeFilename(filename);
    const key = `${tenantId}/uploads/${timestamp}-${fileId}/${safeFilename}`;

    // Create presigned POST data
    const params = {
      Bucket: this.bucketName,
      Fields: {
        key,
        'Content-Type': this.getContentType(fileType),
        'x-amz-meta-tenant-id': tenantId,
        'x-amz-meta-file-id': fileId,
        'x-amz-meta-original-name': filename,
        'x-amz-meta-file-type': fileType,
      },
      Expires: 300, // 5 minutes
      Conditions: [
        ['content-length-range', 0, fileSize],
        ['starts-with', '$Content-Type', ''],
      ],
    };

    const presignedPost = await this.s3.createPresignedPost(params);

    // Create file record in database
    await this.prisma.file.create({
      data: {
        id: fileId,
        tenantId,
        filename: safeFilename,
        originalName: filename,
        type: fileType,
        size: fileSize,
        path: key,
        hash: '', // Will be updated after upload confirmation
        metadata: {
          uploadedBy: userId,
          status: 'pending',
        },
      },
    });

    return {
      uploadUrl: presignedPost.url,
      uploadFields: presignedPost.fields,
      fileId,
      key,
    };
  }

  async confirmUpload(tenantId: string, fileId: string, ndaAcceptanceId?: string): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
    });

    if (!file) {
      throw new BadRequestException('File not found');
    }

    // Verify file exists in S3
    try {
      const headResult = await this.s3
        .headObject({
          Bucket: this.bucketName,
          Key: file.path,
        })
        .promise();

      // Calculate file hash
      const fileData = await this.s3
        .getObject({
          Bucket: this.bucketName,
          Key: file.path,
        })
        .promise();

      // Node 22 tightened `BinaryLike` to exclude Buffer; wrap in Uint8Array
      // (Buffer extends Uint8Array, so this is a zero-copy cast).
      const hash = createHash('sha256')
        .update(new Uint8Array(fileData.Body as Buffer))
        .digest('hex');

      // Update file record
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          hash,
          size: headResult.ContentLength || file.size,
          ndaAcceptanceId,
          metadata: {
            ...((file.metadata as Record<string, unknown>) || {}),
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          metadata: {
            ...((file.metadata as Record<string, unknown>) || {}),
            status: 'failed',
            error: getErrorMessage(error as Error),
          },
        },
      });
      throw new BadRequestException('File upload verification failed');
    }
  }

  async getFileUrl(tenantId: string, fileId: string): Promise<string> {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
    });

    if (!file) {
      throw new BadRequestException('File not found');
    }

    // Generate temporary signed URL (valid for 1 hour)
    const url = await this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucketName,
      Key: file.path,
      Expires: 3600,
    });

    return url;
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    try {
      // If it's an S3 URL, extract bucket and key
      if (fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('s3://')) {
        const urlParts = new URL(fileUrl);
        const pathParts = urlParts.pathname.split('/').filter((p) => p);
        const bucket = urlParts.hostname.split('.')[0];
        const key = pathParts.join('/');

        const result = await this.s3
          .getObject({
            Bucket: bucket || this.bucketName,
            Key: key,
          })
          .promise();

        return result.Body as Buffer;
      } else {
        // For presigned URLs or other URLs, download directly
        const result = await this.s3
          .getObject({
            Bucket: this.bucketName,
            Key: fileUrl, // Assuming fileUrl is actually the key
          })
          .promise();

        return result.Body as Buffer;
      }
    } catch (error) {
      throw new BadRequestException(`Failed to download file: ${getErrorMessage(error as Error)}`);
    }
  }

  async deleteFile(tenantId: string, fileId: string): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
    });

    if (!file) {
      throw new BadRequestException('File not found');
    }

    // Delete from S3
    await this.s3
      .deleteObject({
        Bucket: this.bucketName,
        Key: file.path,
      })
      .promise();

    // Delete from database
    await this.prisma.file.delete({
      where: { id: fileId },
    });
  }

  async getFilesByQuoteItem(tenantId: string, quoteItemId: string) {
    return this.prisma.file.findMany({
      where: {
        tenantId,
        quoteItemId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  private getContentType(fileType: FileType): string {
    const contentTypes: Record<FileType, string> = {
      stl: 'model/stl',
      step: 'model/step',
      iges: 'model/iges',
      dxf: 'application/dxf',
      dwg: 'application/dwg',
      pdf: 'application/pdf',
    };
    return contentTypes[fileType] || 'application/octet-stream';
  }

  private getAllowedExtensions(fileType: FileType): string[] {
    const extensions: Record<FileType, string[]> = {
      stl: ['stl'],
      step: ['step', 'stp'],
      iges: ['iges', 'igs'],
      dxf: ['dxf'],
      dwg: ['dwg'],
      pdf: ['pdf'],
    };
    return extensions[fileType] || [];
  }
}
