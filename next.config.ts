import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    /* config options here */
    distDir: '.next',
    reactCompiler: true,
    turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
