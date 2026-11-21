import { defineConfig } from 'vitest/config';

// An explicit config keeps vitest from discovering a workspace/projects config in a parent folder.
export default defineConfig({
    test: {
        root: import.meta.dirname,
        include: ['tests/**/*.test.ts'],
        environment: 'node',
    },
});
