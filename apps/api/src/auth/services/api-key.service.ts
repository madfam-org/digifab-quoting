import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

interface ApiKeyData {
  id: string;
  tenantId: string;
  name: string;
  scopes: string[];
  rateLimit?: number;
  isActive: boolean;
  expiresAt?: Date;
}

@Injectable()
export class ApiKeyService {
  constructor(private prisma: PrismaService) {}

  async generateApiKey(
    tenantId: string,
    name: string,
    scopes: string[],
    expiresIn?: number,
  ): Promise<{ key: string; keyData: ApiKeyData }> {
    // Generate a secure API key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = 'mfm_'; // Cotiza Studio prefix
    const apiKey = `${keyPrefix}${rawKey}`;

    // Hash the key for storage
    const hashedKey = await bcrypt.hash(apiKey, 10);

    // Calculate expiration
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    // Store in database
    const keyData = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash: hashedKey,
        keyPrefix: apiKey.substring(0, 8), // Store prefix for identification
        scopes,
        expiresAt,
        lastUsedAt: null,
        createdAt: new Date(),
      },
    });

    return {
      key: apiKey,
      keyData: {
        id: keyData.id,
        tenantId: keyData.tenantId,
        name: keyData.name,
        scopes: keyData.scopes as string[],
        rateLimit: keyData.rateLimit || undefined,
        isActive: keyData.isActive,
        expiresAt: keyData.expiresAt || undefined,
      },
    };
  }

  async validateApiKey(apiKey: string): Promise<ApiKeyData | null> {
    if (!apiKey || !apiKey.startsWith('mfm_')) {
      return null;
    }

    const keyPrefix = apiKey.substring(0, 8);

    // Find potential matches by prefix
    const potentialKeys = await this.prisma.apiKey.findMany({
      where: {
        keyPrefix,
        isActive: true,
      },
    });

    // Verify the key hash
    for (const keyRecord of potentialKeys) {
      const isValid = await bcrypt.compare(apiKey, keyRecord.keyHash);
      if (isValid) {
        // Update last used timestamp
        await this.prisma.apiKey.update({
          where: { id: keyRecord.id },
          data: { lastUsedAt: new Date() },
        });

        return {
          id: keyRecord.id,
          tenantId: keyRecord.tenantId,
          name: keyRecord.name,
          scopes: keyRecord.scopes as string[],
          rateLimit: keyRecord.rateLimit || undefined,
          isActive: keyRecord.isActive,
          expiresAt: keyRecord.expiresAt || undefined,
        };
      }
    }

    return null;
  }

  async revokeApiKey(keyId: string, tenantId: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: {
        id: keyId,
        tenantId,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });
  }

  async listApiKeys(tenantId: string): Promise<
    Array<{
      id: string;
      name: string;
      scopes: unknown;
      keyPrefix: string;
      isActive: boolean;
      expiresAt: Date | null;
      lastUsedAt: Date | null;
      createdAt: Date;
      revokedAt: Date | null;
    }>
  > {
    return this.prisma.apiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        scopes: true,
        keyPrefix: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async logUsage(keyId: string, ip: string, endpoint: string): Promise<void> {
    await this.prisma.apiKeyUsage.create({
      data: {
        apiKeyId: keyId,
        ipAddress: ip,
        endpoint,
        timestamp: new Date(),
      },
    });
  }

  async getUsageStats(keyId: string, days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.apiKeyUsage.groupBy({
      by: ['endpoint'],
      where: {
        apiKeyId: keyId,
        timestamp: { gte: since },
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });
  }
}
