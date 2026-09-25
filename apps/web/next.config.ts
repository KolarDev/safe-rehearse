import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the monorepo root .env so web and api share one env file.
// App-local apps/web/.env* files still take precedence.
loadEnvConfig(path.resolve(process.cwd(), '../..'));

const nextConfig: NextConfig = {
  transpilePackages: ['@safe-rehearse/types'],
};

export default nextConfig;
