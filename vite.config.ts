import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { voidPlugin } from 'void';

// voidPlugin は独自に dev サーバーを張るため、vitest の中では読み込まない。
const underTest = Boolean(process.env.VITEST);
// SH_CLIENT_ONLY=1 vp dev：API や Cloudflare の binding を使わず、画面だけを出す（/__screens の確認用）。
const clientOnly = Boolean(process.env.SH_CLIENT_ONLY);

export default defineConfig({
  plugins: underTest
    ? [react()]
    : [
        ...(clientOnly ? [] : [voidPlugin()]),
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
    // 画面のテスト（happy-dom）で Google Fonts の CSS を取りに行かない
    environmentOptions: {
      happyDOM: {
        settings: { disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true },
      },
    },
  },
});
