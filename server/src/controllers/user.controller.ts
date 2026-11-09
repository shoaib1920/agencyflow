import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentUser } from '../middleware/auth';
import * as userService from '../services/user.service';

export const list = asyncHandler(async (req, res) => {
  const includeInactive = currentUser(req).role === 'admin' && req.query.all === 'true';
  sendSuccess(res, await userService.listUsers({ includeInactive }));
});

export const create = asyncHandler(async (req, res) => {
  const user = await userService.createUser(currentUser(req).id, req.body);
  sendSuccess(res, user, { status: 201, message: 'Team member added' });
});

export const update = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(currentUser(req).id, req.params.id as string, req.body);
  sendSuccess(res, user, { message: 'Team member updated' });
});
