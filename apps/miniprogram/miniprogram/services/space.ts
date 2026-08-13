import { callFunction } from '../api/cloud';
import type {
  CreateSpaceInput,
  CreateSpaceResult,
  GetMySpaceResult,
  JoinSpaceInput,
  JoinSpaceResult,
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
};
