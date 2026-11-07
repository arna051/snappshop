export interface SnappShopErrorOptions {
  status?: number;
  code?: string | number;
  trackId?: string;
  cause?: unknown;
  details?: unknown;
}

export class SnappShopError extends Error {
  readonly status?: number;
  readonly code?: string | number;
  readonly trackId?: string;
  readonly details?: unknown;

  constructor(message: string, options: SnappShopErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    if (options.status !== undefined) this.status = options.status;
    if (options.code !== undefined) this.code = options.code;
    if (options.trackId !== undefined) this.trackId = options.trackId;
    if (options.details !== undefined) this.details = options.details;
  }
}

export class SnappShopAuthenticationError extends SnappShopError {}
export class SnappShopAuthorizationError extends SnappShopError {}
export class SnappShopValidationError extends SnappShopError {}
export class SnappShopRateLimitError extends SnappShopError {}
export class SnappShopTransportError extends SnappShopError {}
export class SnappShopApiError extends SnappShopError {}
export class SnappShopPartialSuccessError extends SnappShopError {}
export class SnappShopReadbackMismatchError extends SnappShopError {}
export class SnappShopMappingAmbiguityError extends SnappShopError {}
