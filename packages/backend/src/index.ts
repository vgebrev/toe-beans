// The only entry point apps import (architecture §4.2): config, the composition root and the
// http layer.
export { createBackend, type Backend } from './composition.js';
export { ConfigError, loadConfig, type Config } from './config.js';
export * from './http/index.js';
