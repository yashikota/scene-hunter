import { defineConfig } from 'void/config';

export default defineConfig({
  target: 'cloudflare',
  cloudflare: {
    name: 'scene-hunter',
  },
});
