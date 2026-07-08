import { FilesController } from '../files.controller';
import { FilesService } from '../files.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// FilesController is a thin, tenant-scoped delegation layer over FilesService.
// The current surface is exactly four routes: presign (createPresignedUpload),
// confirm, url (getFileUrl) and delete. The previous spec targeted a removed
// API (getFile / listUserFiles / getDownloadUrl / dto-first signatures); these
// tests assert the real delegation contract instead.

describe('FilesController', () => {
  let controller: FilesController;
  let filesService: {
    createPresignedUpload: jest.Mock;
    confirmUpload: jest.Mock;
    getFileUrl: jest.Mock;
    deleteFile: jest.Mock;
  };

  const req = {
    user: {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      roles: ['customer'],
    },
  } as any;

  beforeEach(() => {
    filesService = {
      createPresignedUpload: jest.fn(),
      confirmUpload: jest.fn(),
      getFileUrl: jest.fn(),
      deleteFile: jest.fn(),
    };
    controller = new FilesController(filesService as unknown as FilesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createPresignedUpload', () => {
    const dto = { filename: 'test-part.stl', type: 'stl' as any, size: 2048000 };

    it('forwards tenantId, filename, type, size and userId to the service', async () => {
      const presigned = {
        fileId: 'file-456',
        uploadUrl: 'https://s3.amazonaws.com/bucket/uploads/file-456',
        fields: {},
        expiresIn: 3600,
      };
      filesService.createPresignedUpload.mockResolvedValue(presigned);

      const result = await controller.createPresignedUpload(req, dto);

      expect(result).toBe(presigned);
      expect(filesService.createPresignedUpload).toHaveBeenCalledWith(
        'tenant-123',
        'test-part.stl',
        'stl',
        2048000,
        'user-123',
      );
    });

    it('propagates validation errors from the service', async () => {
      filesService.createPresignedUpload.mockRejectedValue(
        new BadRequestException('Invalid file type'),
      );

      await expect(controller.createPresignedUpload(req, dto)).rejects.toThrow('Invalid file type');
    });
  });

  describe('confirmUpload', () => {
    it('forwards tenantId, fileId and the optional NDA acceptance id', async () => {
      filesService.confirmUpload.mockResolvedValue(undefined);

      await controller.confirmUpload(req, 'file-123', { ndaAcceptanceId: 'nda-1' } as any);

      expect(filesService.confirmUpload).toHaveBeenCalledWith('tenant-123', 'file-123', 'nda-1');
    });

    it('passes undefined when no NDA acceptance id is provided', async () => {
      filesService.confirmUpload.mockResolvedValue(undefined);

      await controller.confirmUpload(req, 'file-123', {} as any);

      expect(filesService.confirmUpload).toHaveBeenCalledWith('tenant-123', 'file-123', undefined);
    });

    it('propagates not-found errors', async () => {
      filesService.confirmUpload.mockRejectedValue(new NotFoundException('File not found'));

      await expect(controller.confirmUpload(req, 'missing', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getFileUrl', () => {
    it('wraps the presigned download URL in a { url } envelope', async () => {
      filesService.getFileUrl.mockResolvedValue('https://s3.amazonaws.com/bucket/file-123.stl');

      const result = await controller.getFileUrl(req, 'file-123');

      expect(result).toEqual({ url: 'https://s3.amazonaws.com/bucket/file-123.stl' });
      expect(filesService.getFileUrl).toHaveBeenCalledWith('tenant-123', 'file-123');
    });
  });

  describe('deleteFile', () => {
    it('delegates to service.deleteFile(tenantId, fileId)', async () => {
      filesService.deleteFile.mockResolvedValue(undefined);

      await controller.deleteFile(req, 'file-123');

      expect(filesService.deleteFile).toHaveBeenCalledWith('tenant-123', 'file-123');
    });

    it('propagates the active-quote guard error', async () => {
      filesService.deleteFile.mockRejectedValue(
        new BadRequestException('File is referenced by quote'),
      );

      await expect(controller.deleteFile(req, 'file-123')).rejects.toThrow(
        'File is referenced by quote',
      );
    });
  });
});
