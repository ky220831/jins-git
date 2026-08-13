import { callFunction } from '../api/cloud';
import type { LoginResult } from '../lib/shared/types/index';

export const AuthService = {
  login(): Promise<LoginResult> {
    return callFunction<LoginResult>('auth-login');
  },
};
