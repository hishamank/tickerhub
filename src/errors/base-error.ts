/**
 * Base error class that all package errors extend from.
 *
 * Vendored from the source monorepo's `@repo/errors` to keep this package
 * self-contained. Provides a stable error code, HTTP-ish status code, an
 * operational/programmer-error flag, structured context, and JSON
 * serialization for logging.
 */

type CaptureStackTrace = (targetObject: object, constructorOpt?: unknown) => void;

export interface BaseErrorOptions {
  code: string;
  statusCode: number;
  isOperational?: boolean;
  context?: Record<string, unknown>;
  cause?: Error;
}

export abstract class BaseError extends Error {
  /** Unique error code for this error type (e.g. "VALIDATION_ERROR"). */
  public readonly code: string;

  /** HTTP status code associated with this error. */
  public readonly statusCode: number;

  /**
   * Whether this error is operational (expected, handle gracefully) or a
   * programming error (a bug — log/alert).
   */
  public readonly isOperational: boolean;

  /** Timestamp when the error occurred. */
  public readonly timestamp: Date;

  /** Additional context data for debugging. */
  public readonly context?: Record<string, unknown> | undefined;

  /** Original error that caused this one (for error wrapping). */
  public override readonly cause?: Error | undefined;

  constructor(message: string, options: BaseErrorOptions) {
    super(message);

    // Maintain proper stack trace for where the error was thrown (V8 only).
    const errorCtor = Error as unknown as {
      captureStackTrace?: CaptureStackTrace;
    };
    if (typeof errorCtor.captureStackTrace === "function") {
      errorCtor.captureStackTrace(this, this.constructor);
    }

    // Set the prototype explicitly so `instanceof` works across transpilation.
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.isOperational = options.isOperational ?? true;
    this.timestamp = new Date();
    this.context = options.context;
    this.cause = options.cause;
  }

  /** Serialize to JSON for logging / API responses (no stack trace). */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      ...(this.cause && {
        cause: { name: this.cause.name, message: this.cause.message },
      }),
    };
  }

  override toString(): string {
    let result = `${this.name} [${this.code}]: ${this.message}`;
    if (this.context && Object.keys(this.context).length > 0) {
      result += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
    }
    if (this.cause) {
      result += `\nCaused by: ${this.cause.toString()}`;
    }
    return result;
  }
}
