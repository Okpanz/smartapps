const noop = (..._args: unknown[]) => {};

export const logger = {
  debug: __DEV__ ? (...args: unknown[]) => console.log(...args) : noop,
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
