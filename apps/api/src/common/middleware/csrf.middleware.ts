import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const CSRF_COOKIE = 'catv_csrf';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    const path = req.originalUrl;
    if (path.includes('/auth/login') || path.includes('/auth/refresh') || path.includes('/auth/logout') || path.includes('/webhooks/inbound')) {
      next();
      return;
    }
    const authorization = req.header('authorization') ?? '';
    if (authorization.startsWith('Bearer ')) {
      next();
      return;
    }
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.header('x-csrf-token');
    if (!cookie || cookie !== header) {
      res.status(403).json({ message: 'CSRF token missing.' });
      return;
    }
    next();
  }
}

export { CSRF_COOKIE };
