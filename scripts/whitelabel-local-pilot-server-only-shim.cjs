// Local-runner preload only: Next's `server-only` package intentionally throws
// outside a Server Component runtime. The White Label pilot scripts execute
// trusted server modules directly in Node, so treat the marker as an empty
// module without changing application/runtime behavior.
const id = require.resolve("server-only");
require.cache[id] = {
  id,
  filename: id,
  loaded: true,
  exports: {},
  children: [],
  paths: [],
};
