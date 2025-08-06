export default {
  extensions: {
    ts: 'module'
  },
  files: [
    'test/**/*.test.ts'
  ],
  environmentVariables: {
    NODE_ENV: 'test'
  },
  timeout: '30s',
  concurrency: 4,
  failFast: false,
  verbose: true
};
