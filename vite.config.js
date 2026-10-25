import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // Relative assets work at /dice-n-roll/ and on any static mirror.
  base: './',
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.spec.js'],
    restoreMocks: true,
  },
});
