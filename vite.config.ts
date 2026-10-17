import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { voidPlugin } from 'void';

// voidPlugin は独自に dev サーバーを張るため、vitest の中では読み込まない。
const underTest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: underTest
    ? [react()]
    : [
        voidPlugin(),
        tanstackRouter({
          target: 'react',
          routesDirectory: './src/client/routes',
          generatedRouteTree: './src/client/routeTree.gen.ts',
          autoCodeSplitting: true,
        }),
        react(),
        paraglideVitePlugin({
          project: './project.inlang',
          outdir: './src/client/paraglide',
          strategy: ['globalVariable', 'baseLocale'],
        }),
      ],
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
