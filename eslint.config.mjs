import { globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  globalIgnores(['.cloudflare/**', '.next/**', '.vinext/**', '.wrangler/**', 'dist/**']),
  ...nextVitals,
];
export default config;
