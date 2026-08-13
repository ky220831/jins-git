import { callFunction } from '../api/cloud';
import type {
  CreateSpaceInput,
  CreateSpaceResult,
  GetMySpaceResult,
  JoinSpaceInput,
  JoinSpaceResult,
  SetNicknameInput,
} from '../lib/shared/types/index';

export const SpaceService = {
  create(input: CreateSpaceInput): Promise<CreateSpaceResult> {
    return callFunction<CreateSpaceResult>('space-create', { ...input });
  },

  join(input: JoinSpaceInput): Promise<JoinSpaceResult> {
    return callFunction<JoinSpaceResult>('space-join', { ...input });
  },

  mySpace(): Promise<GetMySpaceResult> {
    return callFunction<GetMySpaceResult>('space-info');
  },

  regenInvite(): Promise<CreateSpaceResult> {
    return callFunction<CreateSpaceResult>('space-info', { action: 'regen-invite' });
  },

  setNickname(input: SetNicknameInput): Promise<GetMySpaceResult> {
    return callFunction<GetMySpaceResult>('space-info', { action: 'set-nickname', ...input });
  },
};
