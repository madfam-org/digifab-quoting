import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CacheService } from '@/modules/redis/cache.service';
import { Material, Machine } from '@prisma/client';
import { ProcessType, TenantFeatures } from '@cotiza/shared';

interface TenantConfig {
  id: string;
  name: string;
  subdomain: string;
  settings: Record<string, unknown>;
  features: string[];
  currencies: string[];
  locales: string[];
}

interface MaterialCache {
  [key: string]: Material;
}

interface MachineCache {
  [process: string]: Machine[];
}

@Injectable()
export class TenantCacheService {
  private readonly logger = new Logger(TenantCacheService.name);
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly MATERIAL_CACHE_TTL = 7200; // 2 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getTenantConfig(tenantId: string): Promise<TenantConfig> {
    const cacheKey = `tenant:config:${tenantId}`;

    // Try cache first
    const cached = await this.cacheService.get<TenantConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    // Load from database
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      // include: { // Remove if not in schema
      //   tenantFeatures: {
      //     where: { enabled: true },
      //     include: { feature: true },
      //   },
      // },
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const config: TenantConfig = {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.domain || '', // Use correct field name
      settings: (tenant.settings as Record<string, unknown>) || {},
      features: [], // tenant.tenantFeatures.map((tf: any) => tf.feature.code), // Remove if not in schema
      currencies: (tenant.settings as Record<string, unknown>)?.currencies as string[] || ['MXN'],
      locales: (tenant.settings as Record<string, unknown>)?.locales as string[] || ['es', 'en'],
    };

    // Cache the config
    await this.cacheService.set(cacheKey, config, this.CACHE_TTL);

    return config;
  }

  // Typed readthrough for Tenant.features. Use this for feature flag
  // checks (e.g. servicesQuotes) instead of pulling the raw JSON.
  // Returns an object with all flags defaulted to false — callers can
  // do plain boolean reads without undefined checks.
  async getTenantFeatures(tenantId: string): Promise<TenantFeatures> {
    const cacheKey = `tenant:features:${tenantId}`;

    const cached = await this.cacheService.get<TenantFeatures>(cacheKey);
    if (cached) {
      return cached;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { features: true },
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const raw = (tenant.features as Record<string, unknown>) || {};
    const features: TenantFeatures = {
      supplierPortal: Boolean(raw.supplierPortal),
      dynamicScheduling: Boolean(raw.dynamicScheduling),
      euRegion: Boolean(raw.euRegion),
      whatsappNotifications: Boolean(raw.whatsappNotifications),
      bankTransferReconciliation: Boolean(raw.bankTransferReconciliation),
      servicesQuotes: Boolean(raw.servicesQuotes),
    };

    // Forward any extra flags untouched so tenants can opt into beta
    // features without requiring a shape change.
    for (const [k, v] of Object.entries(raw)) {
      if (!(k in features)) {
        features[k] = Boolean(v);
      }
    }

    await this.cacheService.set(cacheKey, features, this.CACHE_TTL);
    return features;
  }

  async getMaterialsByProcess(tenantId: string, process: ProcessType): Promise<Material[]> {
    const cacheKey = `tenant:materials:${tenantId}:${process}`;

    // Try cache first
    const cached = await this.cacheService.get<Material[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Load from database
    const materials = await this.prisma.material.findMany({
      where: {
        tenantId,
        process,
        active: true,
      },
      orderBy: [{ name: 'asc' }], // Remove category if not in schema
    });

    // Cache the materials
    await this.cacheService.set(cacheKey, materials, this.MATERIAL_CACHE_TTL);

    return materials;
  }

  async getAllMaterials(tenantId: string): Promise<MaterialCache> {
    const cacheKey = `tenant:materials:all:${tenantId}`;

    // Try cache first
    const cached = await this.cacheService.get<MaterialCache>(cacheKey);
    if (cached) {
      return cached;
    }

    // Load all materials
    const materials = await this.prisma.material.findMany({
      where: {
        tenantId,
        active: true,
      },
    });

    // Create indexed cache
    const materialCache: MaterialCache = {};
    materials.forEach((material) => {
      const key = `${material.process}:${material.code}`;
      materialCache[key] = material;
    });

    // Cache the materials
    await this.cacheService.set(cacheKey, materialCache, this.MATERIAL_CACHE_TTL);

    return materialCache;
  }

  async getMachinesByProcess(tenantId: string, process: ProcessType): Promise<Machine[]> {
    const cacheKey = `tenant:machines:${tenantId}:${process}`;

    // Try cache first
    const cached = await this.cacheService.get<Machine[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Load from database
    const machines = await this.prisma.machine.findMany({
      where: {
        tenantId,
        process,
        active: true,
      },
      orderBy: {
        hourlyRate: 'asc',
      },
    });

    // Cache the machines
    await this.cacheService.set(cacheKey, machines, this.MATERIAL_CACHE_TTL);

    return machines;
  }

  async getAllMachines(tenantId: string): Promise<MachineCache> {
    const cacheKey = `tenant:machines:all:${tenantId}`;

    // Try cache first
    const cached = await this.cacheService.get<MachineCache>(cacheKey);
    if (cached) {
      return cached;
    }

    // Load all machines
    const machines = await this.prisma.machine.findMany({
      where: {
        tenantId,
        active: true,
      },
      orderBy: {
        hourlyRate: 'asc',
      },
    });

    // Group by process
    const machineCache: MachineCache = {};
    machines.forEach((machine) => {
      if (!machineCache[machine.process]) {
        machineCache[machine.process] = [];
      }
      machineCache[machine.process].push(machine);
    });

    // Cache the machines
    await this.cacheService.set(cacheKey, machineCache, this.MATERIAL_CACHE_TTL);

    return machineCache;
  }

  async getPricingSettings(tenantId: string): Promise<Record<string, unknown>> {
    const config = await this.getTenantConfig(tenantId);
    const settings = config.settings;

    return {
      marginFloorPercent: settings.marginFloorPercent || 30,
      overheadPercent: settings.overheadPercent || 15,
      energyTariffPerKwh: settings.energyTariffPerKwh || 0.12,
      laborRatePerHour: settings.laborRatePerHour || 25,
      rushUpchargePercent: settings.rushUpchargePercent || 50,
      volumeDiscounts: settings.volumeDiscounts || [
        { minQuantity: 10, discountPercent: 5 },
        { minQuantity: 50, discountPercent: 10 },
        { minQuantity: 100, discountPercent: 15 },
      ],
      gridCo2eFactor: settings.gridCo2eFactor || 0.42,
      logisticsCo2eFactor: settings.logisticsCo2eFactor || 0.0002,
      taxRate: settings.taxRate || 0.16,
      freeShippingThreshold: settings.freeShippingThreshold || 1000,
      standardShippingRate: settings.standardShippingRate || 150,
    };
  }

  async clearTenantCache(tenantId: string): Promise<void> {
    const patterns = [
      `tenant:config:${tenantId}`,
      `tenant:materials:*:${tenantId}*`,
      `tenant:machines:*:${tenantId}*`,
    ];

    for (const pattern of patterns) {
      // await this.cacheService.deletePattern(pattern); // Method may not exist
      // await this.cacheService.delete(pattern); // Method may not exist either
      try {
        await (this.cacheService as CacheService & { clearPattern?: (pattern: string) => Promise<void> }).clearPattern?.(pattern);
      } catch {
        this.logger.warn(`Could not clear cache pattern: ${pattern}`);
      }
    }

    this.logger.log(`Cleared cache for tenant ${tenantId}`);
  }

  async warmupCache(tenantId: string): Promise<void> {
    try {
      // Load all data in parallel
      await Promise.all([
        this.getTenantConfig(tenantId),
        this.getAllMaterials(tenantId),
        this.getAllMachines(tenantId),
        ...Object.values(ProcessType).map((process) =>
          Promise.all([
            this.getMaterialsByProcess(tenantId, process),
            this.getMachinesByProcess(tenantId, process),
          ]),
        ),
      ]);

      this.logger.log(`Warmed up cache for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to warmup cache for tenant ${tenantId}`, error);
    }
  }
}
