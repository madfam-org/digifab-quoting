import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  access: {
    secret: process.env.JWT_ACCESS_SECRET,
    publicKey: process.env.JWT_ACCESS_PUBLIC,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    algorithm: 'RS256',
  },
  refresh: {
    secret: process.env.JWT_REFRESH_SECRET,
    publicKey: process.env.JWT_REFRESH_PUBLIC,
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    algorithm: 'RS256',
  },
  issuer: process.env.JWT_ISSUER || 'madfam-api',
  audience: process.env.JWT_AUDIENCE || 'madfam-client',
}));
