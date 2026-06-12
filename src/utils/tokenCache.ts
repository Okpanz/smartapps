let _accessToken: string | null = null;

export const tokenCache = {
  get: (): string | null => _accessToken,
  set: (token: string | null): void => { _accessToken = token; },
  clear: (): void => { _accessToken = null; },
};
