import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { z, type ZodType } from 'zod';
import {
  SnappShopApiError,
  SnappShopAuthenticationError,
  SnappShopAuthorizationError,
  SnappShopRateLimitError,
  SnappShopTransportError,
  SnappShopValidationError,
} from '../core/errors.js';
import { apiErrorEnvelopeSchema } from '../schemas/common.js';

export interface SnappShopCredentials {
  token: string;
  clientCode: string;
}

export interface RetryOptions {
  maxAttempts?: number;
  maxElapsedMs?: number;
  baseDelayMs?: number;
}

export interface TransportOptions {
  credentials: SnappShopCredentials;
  baseUrl?: string;
  timeoutMs?: number;
  retry?: RetryOptions;
  adapter?: AxiosRequestConfig['adapter'];
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const credentialsSchema = z.object({ token: z.string().min(1), clientCode: z.string().min(1) });
const retryStatuses = new Set([429, 500, 502, 503, 504]);

export class SnappShopTransport {
  readonly axios: AxiosInstance;
  readonly #token: string;
  readonly #clientCode: string;
  readonly #maxAttempts: number;
  readonly #maxElapsedMs: number;
  readonly #baseDelayMs: number;

  constructor(options: TransportOptions) {
    const credentials = credentialsSchema.parse(options.credentials);
    this.#token = credentials.token;
    this.#clientCode = credentials.clientCode;
    this.#maxAttempts = Math.max(1, options.retry?.maxAttempts ?? 3);
    this.#maxElapsedMs = Math.max(1, options.retry?.maxElapsedMs ?? 60_000);
    this.#baseDelayMs = Math.max(1, options.retry?.baseDelayMs ?? 250);
    this.axios = axios.create({
      baseURL: options.baseUrl ?? 'https://apix.snappshop.ir/automation/v1',
      timeout: options.timeoutMs ?? 60_000,
      ...(options.adapter ? { adapter: options.adapter } : {}),
      headers: { Authorization: `Bearer ${this.#token}`, 'User-Agent': this.#clientCode },
    });
  }

  async get<T>(path: string, schema: ZodType<T>, config: AxiosRequestConfig = {}): Promise<T> {
    return this.request({ ...config, url: path, method: 'GET' }, schema, true);
  }

  async mutate<T>(
    method: 'PATCH' | 'PUT',
    path: string,
    body: unknown,
    schema: ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.request(
      {
        method,
        url: path,
        data: body,
        ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
      schema,
      false,
    );
  }

  private async request<T>(config: AxiosRequestConfig, schema: ZodType<T>, retryable: boolean) {
    const started = Date.now();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const response = await this.axios.request(config);
        const apiError = apiErrorEnvelopeSchema.safeParse(response.data);
        if (apiError.success) throw this.fromApiError(apiError.data, response.status);
        return schema.parse(response.data);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new SnappShopValidationError('SnappShop response failed validation', {
            details: error.issues,
          });
        }
        const mapped = this.mapError(error);
        const elapsed = Date.now() - started;
        const canRetry =
          retryable &&
          attempt < this.#maxAttempts &&
          elapsed < this.#maxElapsedMs &&
          mapped instanceof SnappShopErrorWithRetry;
        if (!canRetry)
          throw mapped instanceof SnappShopErrorWithRetry ? mapped.publicError : mapped;
        const delay = Math.min(
          mapped.retryAfterMs ?? this.#baseDelayMs * 2 ** (attempt - 1),
          this.#maxElapsedMs - elapsed,
        );
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
      }
    }
  }

  private fromApiError(data: z.infer<typeof apiErrorEnvelopeSchema>, status: number) {
    const options = compactOptions(status, data.code, data.trackId);
    if (status === 401)
      return new SnappShopAuthenticationError('SnappShop authentication failed', options);
    if (status === 403)
      return new SnappShopAuthorizationError('SnappShop authorization failed', options);
    if (status === 422)
      return new SnappShopValidationError('SnappShop rejected the request', options);
    return new SnappShopApiError(data.message ?? 'SnappShop API error', options);
  }

  private mapError(error: unknown): Error {
    if (error instanceof SnappShopApiError || error instanceof SnappShopValidationError)
      return error;
    if (
      error instanceof SnappShopAuthenticationError ||
      error instanceof SnappShopAuthorizationError
    )
      return error;
    if (!axios.isAxiosError(error))
      return error instanceof Error ? error : new Error('Unknown error');
    const safeMessage = redact(error.message, this.#token, this.#clientCode);
    const status = error.response?.status;
    const envelope = apiErrorEnvelopeSchema.safeParse(error.response?.data);
    const details = envelope.success ? envelope.data : undefined;
    if (status === 401)
      return new SnappShopAuthenticationError('SnappShop authentication failed', {
        status,
        ...(details?.code !== undefined ? { code: details.code } : {}),
        ...(details?.trackId ? { trackId: details.trackId } : {}),
        cause: safeAxiosCause(error, safeMessage),
      });
    if (status === 403)
      return new SnappShopAuthorizationError('SnappShop authorization failed', {
        status,
        ...(details?.code !== undefined ? { code: details.code } : {}),
        ...(details?.trackId ? { trackId: details.trackId } : {}),
        cause: safeAxiosCause(error, safeMessage),
      });
    if (status === 429) {
      const rateError = new SnappShopRateLimitError('SnappShop rate limit exceeded', {
        status,
        ...(details?.trackId ? { trackId: details.trackId } : {}),
        cause: safeAxiosCause(error, safeMessage),
      });
      return new SnappShopErrorWithRetry(rateError, retryAfter(error));
    }
    if (status && retryStatuses.has(status)) {
      return new SnappShopErrorWithRetry(
        new SnappShopTransportError(`SnappShop request failed with HTTP ${status}`, {
          status,
          ...(details?.trackId ? { trackId: details.trackId } : {}),
          cause: safeAxiosCause(error, safeMessage),
        }),
        retryAfter(error),
      );
    }
    return new SnappShopTransportError(safeMessage || 'SnappShop transport failed', {
      ...(status !== undefined ? { status } : {}),
      cause: safeAxiosCause(error, safeMessage),
    });
  }
}

class SnappShopErrorWithRetry extends Error {
  constructor(
    readonly publicError: Error,
    readonly retryAfterMs?: number,
  ) {
    super(publicError.message, { cause: publicError });
  }
}

function retryAfter(error: AxiosError): number | undefined {
  const raw = error.response?.headers['retry-after'];
  if (raw === undefined) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(String(raw));
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function redact(value: string, ...secrets: string[]) {
  return secrets.reduce(
    (text, secret) => (secret ? text.split(secret).join('[REDACTED]') : text),
    value,
  );
}

function safeAxiosCause(error: AxiosError, message: string): Error {
  const safe = new Error(message);
  safe.name = error.name;
  return safe;
}

function compactOptions(status: number, code?: string | number, trackId?: string) {
  return {
    status,
    ...(code !== undefined ? { code } : {}),
    ...(trackId ? { trackId } : {}),
  };
}
