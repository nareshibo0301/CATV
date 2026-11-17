import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.header('x-request-id');
    const requestId = (header && header.length <= 64 ? header : randomUUID());
    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    const path = req.path;
    if (path === '/health' || path === '/ready') {
      next();
      return;
    }

    const started = Date.now();
    res.on('finish', () => {
      process.stdout.write(
        `${JSON.stringify({
          level: 'info',
          time: new Date().toISOString(),
          requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ms: Date.now() - started,
        })}\n`,
      );
    });
    next();
  }
}
