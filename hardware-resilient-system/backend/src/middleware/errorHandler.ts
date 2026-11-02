import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export interface AppErrorResponse {
  success: false;
  statusCode: number;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Global centralized error middleware
 * Discrimina entre:
 * 1. ZodError (400)
 * 2. PrismaClientKnownRequestError (P2002 -> 409)
 * 3. AppError (Custom statusCode)
 * 4. Error genérico (500)
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  // 1. Zod validation errors -> 400 Bad Request
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    const response: AppErrorResponse = {
      success: false,
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input parameters or body payload',
        details: formattedErrors,
      },
    };

    res.status(400).json(response);
    return;
  }

  // 2. Prisma Known Request Errors (e.g. Unique constraint violation P2002)
  if (isPrismaKnownRequestError(err)) {
    if (err.code === 'P2002') {
      const target = err.meta?.target;
      const response: AppErrorResponse = {
        success: false,
        statusCode: 409,
        error: {
          code: 'CONFLICT_DUPLICATE_ENTRY',
          message: `Unique constraint failed: A record already exists with that ${Array.isArray(target) ? target.join(', ') : 'unique identifier'}`,
          details: { target },
        },
      };
      res.status(409).json(response);
      return;
    }

    if (err.code === 'P2025') {
      const response: AppErrorResponse = {
        success: false,
        statusCode: 404,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested device or record does not exist',
        },
      };
      res.status(404).json(response);
      return;
    }
  }

  // 3. Custom Application Errors
  if (err instanceof AppError) {
    const response: AppErrorResponse = {
      success: false,
      statusCode: err.statusCode,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // 4. Generic unhandled exceptions -> 500 Internal Server Error
  const errorMessage = err instanceof Error ? err.message : 'Unknown unexpected system error';
  
  // Safe logging in production without exposing sensitive internals to caller
  const response: AppErrorResponse = {
    success: false,
    statusCode: 500,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected internal error occurred on the resilient backend'
        : errorMessage,
    },
  };

  res.status(500).json(response);
};

/**
 * Type-guard for PrismaClientKnownRequestError without requiring direct runtime import if prisma client is mocked
 */
interface PrismaErrorShape {
  code: string;
  clientVersion?: string;
  meta?: { target?: string[] | string };
}

function isPrismaKnownRequestError(error: unknown): error is PrismaErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  );
}
