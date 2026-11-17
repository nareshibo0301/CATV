import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.id ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong.';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as { message?: unknown; error?: unknown };
        if (Array.isArray(record.message)) {
          message = record.message.join(', ');
        } else if (typeof record.message === 'string') {
          message = record.message;
        } else {
          message = exception.message;
        }
        if (typeof record.error === 'string') {
          error = record.error;
        }
      }
      if (status >= 500) {
        this.logger.error(JSON.stringify({ requestId, message: exception.message }));
      }
    } else if (exception instanceof Error) {
      this.logger.error(JSON.stringify({ requestId, name: exception.name, message: exception.message }));
    } else {
      this.logger.error(JSON.stringify({ requestId, message: 'Unknown error' }));
    }

    response.status(status).json({ statusCode: status, message, error, requestId });
  }
}
