import { Role, Plan } from '@prisma/client';

export { Role, Plan };

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  plan: Plan;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Express.Request {
  user: JwtPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
