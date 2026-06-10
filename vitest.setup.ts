/**
 * Test setup: route all internal logging to a no-op so provider error-path
 * tests don't flood the test output. Exercises the logging seam too.
 */
import { setLoggerFactory } from "./src/logging/index.js";
import { noopLogger } from "./src/adapters/logging/noop-logger.js";

setLoggerFactory(() => noopLogger);
