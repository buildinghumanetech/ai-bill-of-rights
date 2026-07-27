/**
 * Tells React it is running inside a test so `act()` can flush effects without
 * warning. Harmless for the node-environment tests, which never render.
 */
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
