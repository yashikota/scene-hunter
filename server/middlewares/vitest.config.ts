import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // or 'jsdom' if you need DOM APIs
    mockReset: true, // Reset mocks before each test
    // setupFiles: ['./src/setupTests.ts'], // Optional: for global test setup
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'],
    },
  },
});
