#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

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

// Utility functions
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  step: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
};

// Check if command exists
async function commandExists(cmd) {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch (err) {
    return false;
  }
}

// Ask user input
async function askInput(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, resolve);
  });
  rl.close();

  return answer || defaultValue;
}

// Setup steps
async function setupPostgreSQL() {
  log.step('Setting up PostgreSQL');

  if (await commandExists('psql')) {
    log.success('PostgreSQL is installed');

    // Check if it's running
    try {
      await execAsync('pg_isready');
      log.success('PostgreSQL is running');
    } catch (err) {
      log.warning('PostgreSQL is not running');

      if (await commandExists('brew')) {
        log.info('Starting PostgreSQL...');
        await execAsync('brew services start postgresql@15 || brew services start postgresql');
        log.success('PostgreSQL started');
      } else {
        log.warning('Please start PostgreSQL manually');
      }
    }

    // Create database
    const dbName = await askInput('Database name', 'madfam_dev');
    try {
      await execAsync(`createdb ${dbName}`);
      log.success(`Database '${dbName}' created`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        log.info(`Database '${dbName}' already exists`);
      } else {
        log.error(`Failed to create database: ${err.message}`);
      }
    }

    return dbName;
  } else {
    log.error('PostgreSQL is not installed');

    if (await commandExists('brew')) {
      log.info('To install PostgreSQL:');
      log.info('  brew install postgresql@15');
      log.info('  brew services start postgresql@15');
    } else {
      log.info('Please install PostgreSQL from: https://www.postgresql.org/download/');
    }

    throw new Error('PostgreSQL is required');
  }
}

async function setupRedis() {
  log.step('Setting up Redis');

  if (await commandExists('redis-cli')) {
    log.success('Redis is installed');

    // Check if it's running
    try {
      await execAsync('redis-cli ping');
      log.success('Redis is running');
    } catch (err) {
      log.warning('Redis is not running');

      if (await commandExists('brew')) {
        log.info('Starting Redis...');
        await execAsync('brew services start redis');
        log.success('Redis started');
      } else {
        log.warning('Please start Redis manually');
      }
    }
  } else {
    log.error('Redis is not installed');

    if (await commandExists('brew')) {
      log.info('To install Redis:');
      log.info('  brew install redis');
      log.info('  brew services start redis');
    } else {
      log.info('Please install Redis from: https://redis.io/download');
    }

    throw new Error('Redis is required');
  }
}

async function setupEnvironment(dbName) {
  log.step('Setting up environment variables');

  const envPath = path.join(process.cwd(), '.env.local');

  try {
    await fs.access(envPath);
    log.info('.env.local already exists');

    const overwrite = await askInput('Overwrite existing .env.local? (y/n)', 'n');
    if (overwrite.toLowerCase() !== 'y') {
      log.info('Keeping existing .env.local');
      return;
    }
  } catch (err) {
    // File doesn't exist, which is fine
  }

  // Collect configuration
  log.info('Please provide the following configuration:');

  const dbUser = await askInput('PostgreSQL username', 'postgres');
  const dbPassword = await askInput('PostgreSQL password', '');
  const dbHost = await askInput('PostgreSQL host', 'localhost');
  const dbPort = await askInput('PostgreSQL port', '5432');

  const jwtSecret = await askInput('JWT secret (leave empty to generate)', '');
  const nextAuthSecret = await askInput('NextAuth secret (leave empty to generate)', '');

  // Generate secrets if not provided
  const generateSecret = () => {
    return require('crypto').randomBytes(32).toString('hex');
  };

  const finalJwtSecret = jwtSecret || generateSecret();
  const finalNextAuthSecret = nextAuthSecret || generateSecret();

  // Create .env.local content
  const envContent = `# Database
DATABASE_URL="postgresql://${dbUser}${dbPassword ? ':' + dbPassword : ''}@${dbHost}:${dbPort}/${dbName}?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="${finalJwtSecret}"
JWT_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
NEXTAUTH_URL="http://localhost:3002"
NEXTAUTH_SECRET="${finalNextAuthSecret}"

# Application
NODE_ENV="development"
API_URL="http://localhost:4000"

# File Upload (optional)
# S3_BUCKET="madfam-uploads-dev"
# S3_REGION="us-east-1"
# AWS_ACCESS_KEY_ID="your-access-key"
# AWS_SECRET_ACCESS_KEY="your-secret-key"

# Email (optional)
# SMTP_HOST="smtp.gmail.com"
# SMTP_PORT="587"
# SMTP_USER="your-email@gmail.com"
# SMTP_PASS="your-app-password"

# Currency Configuration
DEFAULT_CURRENCY="MXN"
SUPPORTED_CURRENCIES="MXN,USD"
DEFAULT_LOCALES="es,en"

# Feature Flags
FEATURE_EMAIL_NOTIFICATIONS="false"
FEATURE_FILE_UPLOAD="false"
`;

  await fs.writeFile(envPath, envContent);
  log.success('Created .env.local with configuration');

  if (!jwtSecret) {
    log.warning('Generated random JWT secret - save this for production use');
  }
  if (!nextAuthSecret) {
    log.warning('Generated random NextAuth secret - save this for production use');
  }
}

async function installDependencies() {
  log.step('Installing dependencies');

  log.info('Running npm install...');

  try {
    await execAsync('npm install', {
      stdio: 'inherit',
    });
    log.success('Dependencies installed');
  } catch (err) {
    log.error('Failed to install dependencies');
    throw err;
  }
}

async function setupDatabase() {
  log.step('Setting up database schema');

  try {
    // Generate Prisma client
    log.info('Generating Prisma client...');
    await execAsync('npm run db:generate');
    log.success('Prisma client generated');

    // Run migrations
    log.info('Running database migrations...');
    await execAsync('cd apps/api && npx prisma migrate dev --name init', {
      env: { ...process.env, NODE_ENV: 'development' },
    });
    log.success('Database migrations completed');

    // Seed database
    const seed = await askInput('Seed database with test data? (y/n)', 'y');
    if (seed.toLowerCase() === 'y') {
      log.info('Seeding database...');
      await execAsync('npm run db:seed');
      log.success('Database seeded');

      log.info('\nTest users created:');
      log.info('  Admin: admin@cotiza.studio (password: Admin123!)');
      log.info('  User: user@example.com (password: User123!)');
    }
  } catch (err) {
    log.error(`Database setup failed: ${err.message}`);
    throw err;
  }
}

// Main setup function
async function main() {
  console.log(`
${colors.bright}${colors.blue}Cotiza Studio Quoting System - Initial Setup${colors.reset}
${'='.repeat(50)}

This script will help you set up your development environment.
`);

  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required. Current: ${nodeVersion}`);
    }
    log.success(`Node.js ${nodeVersion} meets requirements`);

    // Setup services
    const dbName = await setupPostgreSQL();
    await setupRedis();

    // Setup environment
    await setupEnvironment(dbName);

    // Install dependencies
    await installDependencies();

    // Setup database
    await setupDatabase();

    // Success!
    console.log(`
${colors.bright}${colors.green}✨ Setup completed successfully! ✨${colors.reset}

To start the development environment:
  ${colors.cyan}npm run dev${colors.reset}

To check system health:
  ${colors.cyan}npm run health${colors.reset}

To manage the database:
  ${colors.cyan}npm run db:utils${colors.reset}

Happy coding! 🚀
`);
  } catch (err) {
    console.error(`\n${colors.red}Setup failed:${colors.reset} ${err.message}\n`);
    process.exit(1);
  }
}

// Run setup
if (require.main === module) {
  main();
}
