import { RetryReason } from './database';
import { logger } from '../utils/logger';

// Constants
export const BASE_BACKOFF_MS = 2000; // 2 seconds
export const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes
export const JOB_POLL_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
export const CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_RETRIES = 5;

// Circuit Breaker State
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';
interface CircuitBreakerStats {
  failures: number;
  openedAt: number | null;
  state: CircuitBreakerState;
}

let circuitBreakerStats: CircuitBreakerStats = {
  failures: 0,
  openedAt: null,
  state: 'closed',
};

// Load circuit breaker state from AsyncStorage (or database)
// For now, in-memory, but in production should persist
// TODO: Persist circuit breaker state to SQLite app_data table

/**
 * AWS-style Full Jitter Exponential Backoff
 * Formula: delay = random(0, min(cap, base * 2^attempt))
 */
export function calculateFullJitterBackoff(
  attempt: number,
  base = BASE_BACKOFF_MS,
  cap = MAX_BACKOFF_MS
): number {
  const rawDelay = base * Math.pow(2, attempt);
  const cappedDelay = Math.min(rawDelay, cap);
  return Math.floor(Math.random() * (cappedDelay + 1)); // +1 to include cap
}

/**
 * Calculate adaptive timeout based on payload size
 */
export function calculateAdaptiveTimeout(payloadSizeBytes: number): number {
  if (payloadSizeBytes < 5 * 1024 * 1024) { // <5MB
    return 30 * 1000;
  } else if (payloadSizeBytes <= 20 * 1024 * 1024) { //5-20MB
    return 60 * 1000;
  } else { //>20MB
    return 120 * 1000;
  }
}

/**
 * Classify errors into specific retry reasons
 */
export function classifyError(error: any): RetryReason {
  if (!error) return 'unknown';

  // Check error message patterns
  const message = (error.message || '').toLowerCase();

  if (message.includes('network request failed') || message.includes('unable to resolve host')) {
    return 'network_unreachable';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (message.includes('dns') || message.includes('could not resolve')) {
    return 'dns_failure';
  }
  if (message.includes('ssl') || message.includes('tls') || message.includes('certificate')) {
    return 'ssl_failure';
  }
  if (message.includes('file not found') || message.includes('no such file')) {
    return 'missing_local_files';
  }

  // Check HTTP status codes
  const status = error.status || error.response?.status;
  if (status === 429) {
    return 'http_429';
  }
  if (status >= 500 && status < 600) {
    return 'http_5xx';
  }
  if (status >= 400 && status < 500 && status !== 429) {
    return 'http_4xx_permanent';
  }

  return 'unknown';
}

/**
 * Check if an error type is retryable
 */
export function isRetryable(reason: RetryReason): boolean {
  return reason !== 'http_4xx_permanent' && reason !== 'missing_local_files';
}

/**
 * Circuit Breaker Functions
 */
export function getCircuitBreakerState(): CircuitBreakerState {
  // Check if cooldown period has passed
  if (
    circuitBreakerStats.state === 'open' &&
    circuitBreakerStats.openedAt &&
    Date.now() - circuitBreakerStats.openedAt >= CIRCUIT_BREAKER_COOLDOWN_MS
  ) {
    circuitBreakerStats.state = 'half_open';
    logger.debug('[CircuitBreaker] State changed to half_open');
  }
  return circuitBreakerStats.state;
}

export function recordCircuitBreakerSuccess(): void {
  if (circuitBreakerStats.state === 'half_open') {
    // Probe succeeded - close the circuit
    circuitBreakerStats = {
      failures: 0,
      openedAt: null,
      state: 'closed',
    };
    logger.debug('[CircuitBreaker] Probe succeeded - circuit closed');
  } else if (circuitBreakerStats.state === 'closed') {
    circuitBreakerStats.failures = 0;
  }
}

export function recordCircuitBreakerFailure(): void {
  const currentState = getCircuitBreakerState();
  
  if (currentState === 'half_open') {
    // Probe failed - re-open circuit
    circuitBreakerStats.openedAt = Date.now();
    circuitBreakerStats.state = 'open';
    logger.warn('[CircuitBreaker] Probe failed - circuit re-opened');
  } else if (currentState === 'closed') {
    circuitBreakerStats.failures++;
    if (circuitBreakerStats.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      circuitBreakerStats.openedAt = Date.now();
      circuitBreakerStats.state = 'open';
      logger.warn('[CircuitBreaker] Failure threshold reached - circuit opened');
    }
  }
}

export function isCircuitBreakerOpen(): boolean {
  return getCircuitBreakerState() === 'open';
}

/**
 * Unit test helpers
 */
export const __testHelpers = {
  resetCircuitBreaker: () => {
    circuitBreakerStats = {
      failures: 0,
      openedAt: null,
      state: 'closed',
    };
  },
  getCircuitBreakerStats: () => circuitBreakerStats,
};
