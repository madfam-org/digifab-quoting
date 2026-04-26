import { VersioningType } from '@nestjs/common';

export interface ApiVersionConfig {
  type: VersioningType;
  defaultVersion?: string | string[];
  prefix?: string;
  header?: string;
}

export const API_VERSION_CONFIG: ApiVersionConfig = {
  type: VersioningType.HEADER,
  defaultVersion: '1',
  header: 'X-API-Version',
  prefix: 'v',
};

// Alternative configurations for different versioning strategies
export const URI_VERSION_CONFIG: ApiVersionConfig = {
  type: VersioningType.URI,
  defaultVersion: '1',
  prefix: 'v',
};

export const MEDIA_TYPE_VERSION_CONFIG: ApiVersionConfig = {
  type: VersioningType.MEDIA_TYPE,
  defaultVersion: '1',
  // Uses Accept header: application/vnd.cotiza.v1+json
};

export const CUSTOM_VERSION_CONFIG: ApiVersionConfig = {
  type: VersioningType.CUSTOM,
  defaultVersion: '1',
};

// Version compatibility matrix
export const VERSION_COMPATIBILITY = {
  v1: ['1', '1.0', 'v1'],
  v2: ['2', '2.0', 'v2'],
};

// Deprecated versions with sunset dates
export const DEPRECATED_VERSIONS = {
  v1: {
    deprecated: true,
    sunset: new Date('2024-12-31'),
    message: 'API v1 is deprecated. Please upgrade to v2.',
    migrationGuide: 'https://docs.cotiza.studio/api/migration-v1-to-v2',
  },
};

import { Request } from 'express';

export function createVersionExtractor() {
  return (request: Request) => {
    // Priority order: header > query param > accept header > default

    // 1. Check custom header
    const headerVersion = request.headers['x-api-version'] || request.headers['api-version'];
    if (headerVersion) {
      return normalizeVersion(Array.isArray(headerVersion) ? headerVersion[0] : headerVersion);
    }

    // 2. Check query parameter
    if (request.query?.version) {
      const queryVersion = request.query.version;
      const versionStr = Array.isArray(queryVersion)
        ? String(queryVersion[0])
        : typeof queryVersion === 'string'
          ? queryVersion
          : String(queryVersion);
      return normalizeVersion(versionStr);
    }

    // 3. Check Accept header for media type versioning
    const acceptHeader = request.headers.accept;
    if (acceptHeader) {
      const mediaTypeMatch = acceptHeader.match(
        /application\/vnd\.madfam\.v(\d+)(?:\.(\d+))?\+json/,
      );
      if (mediaTypeMatch) {
        const major = mediaTypeMatch[1];
        const minor = mediaTypeMatch[2] || '0';
        return `${major}.${minor}`;
      }
    }

    // 4. Default version
    return API_VERSION_CONFIG.defaultVersion;
  };
}

function normalizeVersion(version: string): string {
  // Remove 'v' prefix if present
  const cleanVersion = version.replace(/^v/i, '');

  // Ensure it's a valid version format
  if (!/^\d+(\.\d+)*$/.test(cleanVersion)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  return cleanVersion;
}

// Utility functions for version management
export class VersionUtils {
  static isVersionSupported(version: string): boolean {
    const normalizedVersion = normalizeVersion(version);
    return Object.keys(VERSION_COMPATIBILITY).some((supportedVersion) =>
      VERSION_COMPATIBILITY[supportedVersion as keyof typeof VERSION_COMPATIBILITY].includes(
        normalizedVersion,
      ),
    );
  }

  static isVersionDeprecated(version: string): boolean {
    const versionKey = `v${normalizeVersion(version)}`;
    return Object.prototype.hasOwnProperty.call(DEPRECATED_VERSIONS, versionKey);
  }

  static getDeprecationInfo(version: string) {
    const versionKey = `v${normalizeVersion(version)}`;
    return DEPRECATED_VERSIONS[versionKey as keyof typeof DEPRECATED_VERSIONS];
  }

  static compareVersions(version1: string, version2: string): number {
    const v1Parts = normalizeVersion(version1).split('.').map(Number);
    const v2Parts = normalizeVersion(version2).split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }

  static getLatestVersion(): string {
    const versions = Object.keys(VERSION_COMPATIBILITY).map((v) => v.replace('v', ''));

    return versions.sort((a, b) => this.compareVersions(b, a))[0];
  }
}
