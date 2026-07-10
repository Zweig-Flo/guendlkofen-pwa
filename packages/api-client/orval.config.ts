import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: './openapi.json',
    output: {
      mode: 'split',
      target: './src/generated/api.ts',
      client: 'react-query',
      httpClient: 'fetch',
      override: {
        mutator: {
          path: './src/mutator.ts',
          name: 'customFetch',
        },
        fetch: {
          // return the parsed body directly instead of { status, data, headers }
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
