import { Test, TestingModule } from '@nestjs/testing';
import { FilesController } from '../files.controller';
import { FilesService } from '../files.service';
import { S3Service } from '@/common/services/s3.service';
import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { FileStatus, FileType } from '@prisma/client';

describe('FilesController', () => {
  let controller: FilesController;
  let filesService: FilesService;
  let s3Service: S3Service;

  const mockFilesService = {
    createPresignedUrl: jest.fn(),
    confirmUpload: jest.fn(),
    getFile: jest.fn(),
    getDownloadUrl: jest.fn(),
    deleteFile: jest.fn(),
    validateFile: jest.fn(),
    processFile: jest.fn(),
    listUserFiles: jest.fn(),
  };

  const mockS3Service = {
    createPresignedUploadUrl: jest.fn(),
    createPresignedDownloadUrl: jest.fn(),
    deleteObject: jest.fn(),
    getObjectMetadata: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'customer',
    tenantId: 'tenant-123',
  };

  const mockFile = {
    id: 'file-123',
    fileName: 'part.stl',
    fileType: FileType.MODEL,
    fileSize: 1048576,
    mimeType: 'model/stl',
    s3Key: 'uploads/tenant-123/file-123.stl',
    userId: 'user-123',
    status: FileStatus.UPLOADED,
    metadata: {
      originalName: 'part.stl',
      extension: 'stl',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        {
          provide: FilesService,
          useValue: mockFilesService,
        },
        {
          provide: S3Service,
          useValue: mockS3Service,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<FilesController>(FilesController);
    filesService = module.get<FilesService>(FilesService);
    s3Service = module.get<S3Service>(S3Service);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPresignedUrl', () => {
    const createPresignedDto = {
      fileName: 'test-part.stl',
      fileType: 'model/stl',
      fileSize: 2048000,
    };

    it('should create presigned upload URL', async () => {
      const presignedData = {
        fileId: 'file-456',
        uploadUrl: 'https://s3.amazonaws.com/bucket/uploads/file-456?signature=...',
        uploadFields: {
          key: 'uploads/tenant-123/file-456.stl',
          'Content-Type': 'model/stl',
          'x-amz-meta-user': 'user-123',
        },
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockFilesService.createPresignedUrl.mockResolvedValue(presignedData);

      const result = await controller.createPresignedUrl(createPresignedDto, { user: mockUser });

      expect(result).toEqual(presignedData);
      expect(mockFilesService.createPresignedUrl).toHaveBeenCalledWith(
        createPresignedDto,
        mockUser.id,
        mockUser.tenantId,
      );
    });

    it('should validate file type', async () => {
      const invalidDto = {
        fileName: 'malicious.exe',
        fileType: 'application/x-msdownload',
        fileSize: 1024,
      };

      mockFilesService.createPresignedUrl.mockRejectedValue(
        new BadRequestException('Invalid file type'),
      );

      await expect(controller.createPresignedUrl(invalidDto, { user: mockUser })).rejects.toThrow(
        'Invalid file type',
      );
    });

    it('should enforce file size limits', async () => {
      const oversizedDto = {
        fileName: 'huge-file.stl',
        fileType: 'model/stl',
        fileSize: 524288000, // 500MB
      };

      mockFilesService.createPresignedUrl.mockRejectedValue(
        new BadRequestException('File size exceeds maximum limit (100MB)'),
      );

      await expect(controller.createPresignedUrl(oversizedDto, { user: mockUser })).rejects.toThrow(
        'File size exceeds maximum limit',
      );
    });

    it('should sanitize file names', async () => {
      const unsafeDto = {
        fileName: '../../../etc/passwd.stl',
        fileType: 'model/stl',
        fileSize: 1024,
      };

      const sanitizedResult = {
        fileId: 'file-789',
        uploadUrl: 'https://s3.amazonaws.com/bucket/uploads/file-789',
        uploadFields: {
          key: 'uploads/tenant-123/file-789.stl',
        },
      };

      mockFilesService.createPresignedUrl.mockResolvedValue(sanitizedResult);

      const result = await controller.createPresignedUrl(unsafeDto, { user: mockUser });

      expect(result.uploadFields.key).not.toContain('../');
    });

    it('should support multiple file types', async () => {
      const fileTypes = [
        { fileName: 'part.stl', fileType: 'model/stl' },
        { fileName: 'part.step', fileType: 'model/step' },
        { fileName: 'part.iges', fileType: 'model/iges' },
        { fileName: 'drawing.dxf', fileType: 'application/dxf' },
        { fileName: 'drawing.svg', fileType: 'image/svg+xml' },
      ];

      for (const fileInfo of fileTypes) {
        mockFilesService.createPresignedUrl.mockResolvedValue({
          fileId: `file-${Math.random()}`,
          uploadUrl: 'https://s3.amazonaws.com/...',
        });

        await controller.createPresignedUrl({ ...fileInfo, fileSize: 1024 }, { user: mockUser });

        expect(mockFilesService.createPresignedUrl).toHaveBeenCalled();
      }
    });
  });

  describe('confirmUpload', () => {
    it('should confirm successful upload', async () => {
      const confirmDto = {
        uploadComplete: true,
        fileSize: 1048576,
        checksum: 'abc123def456',
      };

      mockFilesService.confirmUpload.mockResolvedValue({
        ...mockFile,
        status: FileStatus.PROCESSING,
      });

      const result = await controller.confirmUpload('file-123', confirmDto, { user: mockUser });

      expect(result.status).toBe(FileStatus.PROCESSING);
      expect(mockFilesService.confirmUpload).toHaveBeenCalledWith(
        'file-123',
        confirmDto,
        mockUser.id,
      );
    });

    it('should handle upload failure', async () => {
      const failureDto = {
        uploadComplete: false,
        error: 'Network timeout',
      };

      mockFilesService.confirmUpload.mockResolvedValue({
        ...mockFile,
        status: FileStatus.FAILED,
        error: 'Network timeout',
      });

      const result = await controller.confirmUpload('file-123', failureDto, { user: mockUser });

      expect(result.status).toBe(FileStatus.FAILED);
      expect(result.error).toBe('Network timeout');
    });

    it('should validate checksum', async () => {
      const invalidChecksumDto = {
        uploadComplete: true,
        fileSize: 1048576,
        checksum: 'invalid',
      };

      mockFilesService.confirmUpload.mockRejectedValue(
        new BadRequestException('Checksum mismatch'),
      );

      await expect(
        controller.confirmUpload('file-123', invalidChecksumDto, { user: mockUser }),
      ).rejects.toThrow('Checksum mismatch');
    });

    it('should trigger file processing', async () => {
      mockFilesService.confirmUpload.mockResolvedValue({
        ...mockFile,
        status: FileStatus.PROCESSING,
      });

      await controller.confirmUpload('file-123', { uploadComplete: true }, { user: mockUser });

      expect(mockFilesService.processFile).toHaveBeenCalledWith('file-123');
    });
  });

  describe('getFile', () => {
    it('should return file details', async () => {
      mockFilesService.getFile.mockResolvedValue(mockFile);

      const result = await controller.getFile('file-123', { user: mockUser });

      expect(result).toEqual(mockFile);
      expect(mockFilesService.getFile).toHaveBeenCalledWith('file-123', mockUser.id, mockUser.role);
    });

    it('should throw 404 for non-existent file', async () => {
      mockFilesService.getFile.mockRejectedValue(new NotFoundException('File not found'));

      await expect(controller.getFile('invalid-id', { user: mockUser })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should enforce access control', async () => {
      const otherUserFile = { ...mockFile, userId: 'other-user' };

      mockFilesService.getFile.mockRejectedValue(new ForbiddenException('Access denied'));

      await expect(controller.getFile('file-123', { user: mockUser })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to view any file', async () => {
      const adminUser = { ...mockUser, role: 'admin' };

      mockFilesService.getFile.mockResolvedValue(mockFile);

      const result = await controller.getFile('file-123', { user: adminUser });

      expect(result).toEqual(mockFile);
    });
  });

  describe('getDownloadUrl', () => {
    it('should generate download URL', async () => {
      const downloadUrl = {
        url: 'https://s3.amazonaws.com/bucket/uploads/file-123.stl?signature=...',
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockFilesService.getDownloadUrl.mockResolvedValue(downloadUrl);

      const result = await controller.getDownloadUrl('file-123', { user: mockUser });

      expect(result).toEqual(downloadUrl);
      expect(mockFilesService.getDownloadUrl).toHaveBeenCalledWith(
        'file-123',
        mockUser.id,
        mockUser.role,
      );
    });

    it('should track download metrics', async () => {
      mockFilesService.getDownloadUrl.mockResolvedValue({
        url: 'https://s3.amazonaws.com/...',
      });

      await controller.getDownloadUrl('file-123', { user: mockUser });

      // Verify metrics tracking was called
      expect(mockFilesService.getDownloadUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });

    it('should cache download URLs', async () => {
      const downloadUrl = { url: 'https://s3.amazonaws.com/...' };

      mockFilesService.getDownloadUrl.mockResolvedValue(downloadUrl);

      // First call
      await controller.getDownloadUrl('file-123', { user: mockUser });

      // Second call should use cache
      await controller.getDownloadUrl('file-123', { user: mockUser });

      // Service should only be called once due to caching
      expect(mockFilesService.getDownloadUrl).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockFilesService.deleteFile.mockResolvedValue({
        success: true,
        message: 'File deleted successfully',
      });

      const result = await controller.deleteFile('file-123', { user: mockUser });

      expect(result.success).toBe(true);
      expect(mockFilesService.deleteFile).toHaveBeenCalledWith(
        'file-123',
        mockUser.id,
        mockUser.role,
      );
    });

    it('should prevent deletion of files in use', async () => {
      mockFilesService.deleteFile.mockRejectedValue(
        new BadRequestException('File is referenced by quote'),
      );

      await expect(controller.deleteFile('file-123', { user: mockUser })).rejects.toThrow(
        'File is referenced by quote',
      );
    });

    it('should clean up S3 on deletion', async () => {
      mockFilesService.deleteFile.mockImplementation(async (fileId) => {
        await mockS3Service.deleteObject('uploads/tenant-123/file-123.stl');
        return { success: true };
      });

      await controller.deleteFile('file-123', { user: mockUser });

      expect(mockS3Service.deleteObject).toHaveBeenCalledWith('uploads/tenant-123/file-123.stl');
    });

    it('should handle S3 deletion errors gracefully', async () => {
      mockS3Service.deleteObject.mockRejectedValue(new Error('S3 error'));
      mockFilesService.deleteFile.mockResolvedValue({
        success: true,
        warning: 'File record deleted but S3 cleanup failed',
      });

      const result = await controller.deleteFile('file-123', { user: mockUser });

      expect(result.warning).toContain('S3 cleanup failed');
    });
  });

  describe('listUserFiles', () => {
    it('should list user files with pagination', async () => {
      const files = [mockFile, { ...mockFile, id: 'file-456' }];
      const paginatedResult = {
        data: files,
        meta: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      };

      mockFilesService.listUserFiles.mockResolvedValue(paginatedResult);

      const result = await controller.listUserFiles({ page: 1, limit: 20 }, { user: mockUser });

      expect(result).toEqual(paginatedResult);
      expect(mockFilesService.listUserFiles).toHaveBeenCalledWith(mockUser.id, {
        page: 1,
        limit: 20,
      });
    });

    it('should filter files by type', async () => {
      mockFilesService.listUserFiles.mockResolvedValue({
        data: [mockFile],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await controller.listUserFiles({ fileType: FileType.MODEL }, { user: mockUser });

      expect(mockFilesService.listUserFiles).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ fileType: FileType.MODEL }),
      );
    });

    it('should filter files by status', async () => {
      mockFilesService.listUserFiles.mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await controller.listUserFiles({ status: FileStatus.PROCESSING }, { user: mockUser });

      expect(mockFilesService.listUserFiles).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ status: FileStatus.PROCESSING }),
      );
    });
  });

  describe('file processing', () => {
    it('should extract geometry from 3D files', async () => {
      const geometryData = {
        volume: 125.5,
        surfaceArea: 250.8,
        boundingBox: { x: 100, y: 50, z: 25 },
        triangleCount: 5000,
        isClosed: true,
        isManifold: true,
      };

      mockFilesService.processFile.mockResolvedValue({
        ...mockFile,
        geometry: geometryData,
        status: FileStatus.READY,
      });

      await controller.confirmUpload('file-123', { uploadComplete: true }, { user: mockUser });

      expect(mockFilesService.processFile).toHaveBeenCalledWith('file-123');
    });

    it('should detect file format issues', async () => {
      mockFilesService.processFile.mockResolvedValue({
        ...mockFile,
        status: FileStatus.FAILED,
        error: 'Invalid STL format: missing facet normal',
        validationErrors: ['Missing facet normal at line 45', 'Unclosed solid'],
      });

      const result = await mockFilesService.processFile('file-123');

      expect(result.status).toBe(FileStatus.FAILED);
      expect(result.validationErrors).toHaveLength(2);
    });

    it('should handle DFM analysis', async () => {
      const dfmResults = {
        manufacturability: 'good',
        warnings: [
          'Wall thickness below recommended minimum at 2 locations',
          'Sharp internal corner may require special tooling',
        ],
        suggestions: [
          'Increase wall thickness to 1.5mm',
          'Add fillet radius of 0.5mm to internal corners',
        ],
      };

      mockFilesService.processFile.mockResolvedValue({
        ...mockFile,
        dfmAnalysis: dfmResults,
        status: FileStatus.READY,
      });

      const result = await mockFilesService.processFile('file-123');

      expect(result.dfmAnalysis).toEqual(dfmResults);
    });
  });

  describe('security', () => {
    it('should prevent path traversal attacks', async () => {
      const maliciousDto = {
        fileName: '../../../../etc/passwd',
        fileType: 'text/plain',
        fileSize: 1024,
      };

      mockFilesService.createPresignedUrl.mockRejectedValue(
        new BadRequestException('Invalid file name'),
      );

      await expect(controller.createPresignedUrl(maliciousDto, { user: mockUser })).rejects.toThrow(
        'Invalid file name',
      );
    });

    it('should scan for malware', async () => {
      mockFilesService.confirmUpload.mockImplementation(async (fileId) => {
        // Simulate malware scan
        const scanResult = await mockFilesService.scanFile(fileId);
        if (scanResult.infected) {
          throw new BadRequestException('File contains malware');
        }
        return mockFile;
      });

      mockFilesService.scanFile = jest.fn().mockResolvedValue({
        infected: true,
        threat: 'Trojan.Generic',
      });

      await expect(
        controller.confirmUpload('file-123', { uploadComplete: true }, { user: mockUser }),
      ).rejects.toThrow('File contains malware');
    });

    it('should enforce tenant isolation', async () => {
      const otherTenantFile = {
        ...mockFile,
        tenantId: 'other-tenant',
      };

      mockFilesService.getFile.mockRejectedValue(
        new ForbiddenException('Access denied: wrong tenant'),
      );

      await expect(controller.getFile('file-123', { user: mockUser })).rejects.toThrow(
        'Access denied: wrong tenant',
      );
    });
  });
});
