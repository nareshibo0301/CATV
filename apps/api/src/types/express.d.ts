import type { AuthUser } from '@catv/shared';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      rawBody?: Buffer;
      user?: AuthUser;
      apiKey?: { id: string; scopes: string[] };
    }
  }
}

export {};
