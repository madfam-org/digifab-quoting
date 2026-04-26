#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const http = require('http');
const net = require('net');

// Configuration
const SERVICES = {
  api: {
    name: 'API Server',
    url: 'http://localhost:4000/health',
    port: 4000,
    critical: true,
  },
  web: {
    name: 'Web Application',
    url: 'http://localhost:3002',
    port: 3002,
    critical: true,
  },
  postgres: {
    name: 'PostgreSQL',
    port: 5432,
    checkCommand: 'pg_isready -h localhost -p 5432',
    critical: true,
  },
  redis: {
    name: 'Redis',
    port: 6379,
    checkCommand: 'redis-cli ping',
    critical: true,
  },
};

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Check results
const results = {
  healthy: [],
  unhealthy: [],
  warnings: [],
};

// Utility functions
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[!]${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}[✗]${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
};

// Check if port is open
function checkPort(port, host = 'localhost') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

// Check HTTP endpoint
function checkHttp(url, timeout = 5000) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout }, (res) => {
      const healthy = res.statusCode >= 200 && res.statusCode < 400;

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          healthy,
          statusCode: res.statusCode,
          body: data,
        });
      });
    });

    request.on('error', () => {
      resolve({ healthy: false, error: true });
    });

    request.on('timeout', () => {
      request.destroy();
      resolve({ healthy: false, timeout: true });
    });
  });
}

// Check command-based service
async function checkCommand(command) {
  try {
    await execAsync(command);
    return { healthy: true };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

// Check individual service
async function checkService(key, service) {
  const result = {
    name: service.name,
    healthy: false,
    details: {},
  };

  try {
    // Check port first if specified
    if (service.port) {
      const portOpen = await checkPort(service.port);
      result.details.portOpen = portOpen;

      if (!portOpen) {
        result.healthy = false;
        result.details.error = 'Port not accessible';
        return result;
      }
    }

    // Check HTTP endpoint if specified
    if (service.url) {
      const httpResult = await checkHttp(service.url);
      result.healthy = httpResult.healthy;
      result.details.http = {
        statusCode: httpResult.statusCode,
        timeout: httpResult.timeout,
        error: httpResult.error,
      };

      // Parse health response if available
      if (httpResult.body) {
        try {
          const healthData = JSON.parse(httpResult.body);
          result.details.health = healthData;
        } catch (err) {
          // Not JSON, ignore
        }
      }
    }

    // Check command if specified
    if (service.checkCommand) {
      const cmdResult = await checkCommand(service.checkCommand);
      result.healthy = cmdResult.healthy;
      if (!cmdResult.healthy) {
        result.details.error = cmdResult.error;
      }
    }

    // Additional checks for specific services
    if (key === 'api' && result.healthy) {
      // Check API specific endpoints
      const endpoints = [
        { path: '/api', name: 'OpenAPI Docs' },
        { path: '/api/v1/quotes', name: 'Quotes Endpoint' },
      ];

      result.details.endpoints = {};

      for (const endpoint of endpoints) {
        const endpointResult = await checkHttp(`http://localhost:4000${endpoint.path}`, 2000);
        result.details.endpoints[endpoint.name] = endpointResult.healthy;
      }
    }

    if (key === 'postgres' && result.healthy) {
      // Check database connection
      try {
        const { stdout } = await execAsync(
          'cd apps/api && npx prisma db execute --stdin <<< "SELECT 1"',
          {
            env: { ...process.env, NODE_ENV: 'development' },
          },
        );
        result.details.canExecuteQueries = true;
      } catch (err) {
        result.details.canExecuteQueries = false;
        result.details.queryError = err.message;
      }
    }
  } catch (err) {
    result.healthy = false;
    result.details.error = err.message;
  }

  return result;
}

// Check environment variables
async function checkEnvironment() {
  log.header('Environment Check');

  const requiredVars = [
    { name: 'DATABASE_URL', description: 'PostgreSQL connection string' },
    { name: 'REDIS_URL', description: 'Redis connection string' },
    { name: 'JWT_SECRET', description: 'JWT signing secret' },
    { name: 'NEXTAUTH_SECRET', description: 'NextAuth session secret' },
  ];

  const optionalVars = [
    { name: 'S3_BUCKET', description: 'S3 bucket for file uploads' },
    { name: 'DHANAM_WEBHOOK_URL', description: 'Dhanam billing relay webhook URL' },
    { name: 'DEFAULT_CURRENCY', description: 'Default currency (MXN)' },
  ];

  let allRequired = true;

  for (const envVar of requiredVars) {
    if (process.env[envVar.name]) {
      log.success(`${envVar.name} is set`);
    } else {
      log.error(`${envVar.name} is missing - ${envVar.description}`);
      allRequired = false;
    }
  }

  for (const envVar of optionalVars) {
    if (process.env[envVar.name]) {
      log.success(`${envVar.name} is set`);
    } else {
      log.warning(`${envVar.name} is not set (optional) - ${envVar.description}`);
    }
  }

  return allRequired;
}

// Check disk space
async function checkDiskSpace() {
  try {
    const { stdout } = await execAsync('df -h . | tail -1');
    const parts = stdout.trim().split(/\s+/);
    const usage = parseInt(parts[4]);

    if (usage > 90) {
      log.error(`Disk space critically low: ${usage}% used`);
      return false;
    } else if (usage > 80) {
      log.warning(`Disk space warning: ${usage}% used`);
      return true;
    } else {
      log.success(`Disk space healthy: ${usage}% used`);
      return true;
    }
  } catch (err) {
    log.warning('Could not check disk space');
    return true;
  }
}

// Check Node.js version
function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.split('.')[0].substring(1));

  if (major >= 18) {
    log.success(`Node.js version ${version} meets requirements`);
    return true;
  } else {
    log.error(`Node.js version ${version} is too old (requires 18+)`);
    return false;
  }
}

// Generate summary report
function generateReport() {
  console.log(`\n${colors.bright}Health Check Summary${colors.reset}`);
  console.log('═'.repeat(50));

  // Overall status
  const critical = results.unhealthy.filter((r) => r.critical);
  const isHealthy = critical.length === 0;

  if (isHealthy) {
    console.log(`\n${colors.bright}${colors.green}✓ System is HEALTHY${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.red}✗ System is UNHEALTHY${colors.reset}`);
  }

  // Service summary
  console.log(`\n${colors.cyan}Services:${colors.reset}`);
  console.log(`  Healthy: ${colors.green}${results.healthy.length}${colors.reset}`);
  console.log(`  Unhealthy: ${colors.red}${results.unhealthy.length}${colors.reset}`);
  console.log(`  Warnings: ${colors.yellow}${results.warnings.length}${colors.reset}`);

  // Unhealthy services details
  if (results.unhealthy.length > 0) {
    console.log(`\n${colors.red}Unhealthy Services:${colors.reset}`);
    for (const service of results.unhealthy) {
      console.log(`  - ${service.name}${service.critical ? ' (CRITICAL)' : ''}`);
      if (service.details.error) {
        console.log(`    Error: ${service.details.error}`);
      }
    }
  }

  // Warnings
  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    for (const warning of results.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  // Recommendations
  if (!isHealthy) {
    console.log(`\n${colors.cyan}Recommendations:${colors.reset}`);

    if (results.unhealthy.some((s) => s.name === 'PostgreSQL')) {
      console.log('  - Start PostgreSQL: brew services start postgresql@15');
    }

    if (results.unhealthy.some((s) => s.name === 'Redis')) {
      console.log('  - Start Redis: brew services start redis');
    }

    if (results.unhealthy.some((s) => s.name === 'API Server' || s.name === 'Web Application')) {
      console.log('  - Start development server: npm run dev');
    }
  }

  console.log('\n' + '═'.repeat(50) + '\n');

  // Exit code
  process.exit(isHealthy ? 0 : 1);
}

// Main health check function
async function main() {
  console.log(`\n${colors.bright}${colors.blue}Cotiza Studio System Health Check${colors.reset}`);
  console.log('═'.repeat(50));

  // Load environment
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch (err) {
    // Ignore if not found
  }

  // System checks
  log.header('System Requirements');
  checkNodeVersion();
  await checkDiskSpace();

  // Environment check
  const envHealthy = await checkEnvironment();
  if (!envHealthy) {
    results.warnings.push('Missing required environment variables');
  }

  // Service checks
  log.header('Service Health');

  for (const [key, service] of Object.entries(SERVICES)) {
    const result = await checkService(key, service);

    if (result.healthy) {
      log.success(`${result.name} is healthy`);
      results.healthy.push(result);

      // Show additional details for healthy services
      if (result.details.endpoints) {
        for (const [endpoint, healthy] of Object.entries(result.details.endpoints)) {
          if (healthy) {
            log.info(`  └─ ${endpoint}: ${colors.green}available${colors.reset}`);
          } else {
            log.warning(`  └─ ${endpoint}: ${colors.yellow}unavailable${colors.reset}`);
          }
        }
      }
    } else {
      log.error(`${result.name} is unhealthy`);
      results.unhealthy.push({
        ...result,
        critical: service.critical,
      });
    }
  }

  // Database migrations check
  if (results.healthy.some((s) => s.name === 'PostgreSQL')) {
    log.header('Database Status');
    try {
      const { stdout } = await execAsync('cd apps/api && npx prisma migrate status', {
        env: { ...process.env, NODE_ENV: 'development' },
      });

      if (stdout.includes('up to date')) {
        log.success('Database migrations are up to date');
      } else {
        log.warning('Database has pending migrations');
        results.warnings.push('Database has pending migrations');
      }
    } catch (err) {
      if (err.message.includes('migrations to apply')) {
        log.warning('Database has pending migrations');
        results.warnings.push('Database has pending migrations');
      } else {
        log.error('Could not check migration status');
      }
    }
  }

  // Performance checks
  log.header('Performance Metrics');

  // Check memory usage
  const memUsage = process.memoryUsage();
  const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  log.info(`Node.js memory usage: ${memUsageMB}MB`);

  // Check API response time if healthy
  const apiHealthy = results.healthy.find((s) => s.name === 'API Server');
  if (apiHealthy) {
    const start = Date.now();
    await checkHttp('http://localhost:4000/health');
    const responseTime = Date.now() - start;

    if (responseTime < 100) {
      log.success(`API response time: ${responseTime}ms (excellent)`);
    } else if (responseTime < 500) {
      log.success(`API response time: ${responseTime}ms (good)`);
    } else {
      log.warning(`API response time: ${responseTime}ms (slow)`);
      results.warnings.push(`API response time is slow: ${responseTime}ms`);
    }
  }

  // Generate final report
  generateReport();
}

// Export for use in other scripts
module.exports = {
  checkService,
  checkPort,
  checkHttp,
  SERVICES,
};

// Run if called directly
if (require.main === module) {
  main().catch((err) => {
    console.error(`\n${colors.red}Health check failed:${colors.reset}`, err.message);
    process.exit(1);
  });
}
