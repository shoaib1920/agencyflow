import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentUser } from '../middleware/auth';
import * as commentService from '../services/comment.service';
import * as timeService from '../services/time.service';
import * as portalService from '../services/portal.service';
import * as inviteService from '../services/invite.service';
import { REFRESH_COOKIE, refreshCookieOptions } from '../utils/tokens';

// ---------- Comments ----------
export const listComments = asyncHandler(async (req, res) => {
  const task = typeof req.query.task === 'string' ? req.query.task : undefined;
  sendSuccess(res, await commentService.listComments(currentUser(req), req.params.id as string, task));
});
export const addComment = asyncHandler(async (req, res) => {
  sendSuccess(res, await commentService.addComment(currentUser(req), req.params.id as string, req.body), { status: 201 });
});
export const deleteComment = asyncHandler(async (req, res) => {
  await commentService.deleteComment(currentUser(req), req.params.id as string);
  sendSuccess(res, null, { message: 'Comment deleted' });
});
export const commentCounts = asyncHandler(async (req, res) => {
  sendSuccess(res, await commentService.commentCounts(req.params.id as string));
});

// ---------- Time tracking ----------
export const running = asyncHandler(async (req, res) => {
  sendSuccess(res, await timeService.runningTimer(currentUser(req).id));
});
export const start = asyncHandler(async (req, res) => {
  const { task } = req.body as { task: string };
  sendSuccess(res, await timeService.startTimer(currentUser(req), req.params.id as string, task), { message: 'Timer started' });
});
export const stop = asyncHandler(async (req, res) => {
  const entry = await timeService.stopTimer(currentUser(req).id);
  sendSuccess(res, entry, { message: entry ? `Logged ${entry.minutes} min` : 'No timer was running' });
});
export const manual = asyncHandler(async (req, res) => {
  sendSuccess(res, await timeService.addManualEntry(currentUser(req), req.params.id as string, req.body), {
    status: 201,
    message: 'Time logged',
  });
});
export const projectTime = asyncHandler(async (req, res) => {
  sendSuccess(res, await timeService.projectTime(currentUser(req), req.params.id as string));
});
export const deleteEntry = asyncHandler(async (req, res) => {
  await timeService.deleteEntry(currentUser(req), req.params.id as string);
  sendSuccess(res, null, { message: 'Time entry removed' });
});

// ---------- Client portal ----------
export const portalOverview = asyncHandler(async (req, res) => {
  sendSuccess(res, await portalService.portalOverview(currentUser(req)));
});
export const portalProject = asyncHandler(async (req, res) => {
  sendSuccess(res, await portalService.portalProject(currentUser(req), req.params.id as string));
});

// ---------- Invites ----------
export const createInvite = asyncHandler(async (req, res) => {
  const result = await inviteService.createInvite(currentUser(req), req.body);
  sendSuccess(res, result, {
    status: 201,
    message: result.emailed ? `Invite emailed to ${result.invite.email}` : 'Invite created. Copy the link to share it.',
  });
});
export const listInvites = asyncHandler(async (req, res) => {
  const client = typeof req.query.client === 'string' ? req.query.client : undefined;
  sendSuccess(res, await inviteService.listInvites(client));
});
export const revokeInvite = asyncHandler(async (req, res) => {
  await inviteService.revokeInvite(currentUser(req), req.params.id as string);
  sendSuccess(res, null, { message: 'Invite revoked' });
});
export const previewInvite = asyncHandler(async (req, res) => {
  sendSuccess(res, await inviteService.previewInvite(String(req.query.token)));
});
export const acceptInvite = asyncHandler(async (req, res) => {
  const { token, name, password } = req.body as { token: string; name: string; password: string };
  const result = await inviteService.acceptInvite(token, { name, password }, req.get('user-agent'));
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
  sendSuccess(res, { user: result.user, accessToken: result.accessToken }, { status: 201, message: 'Welcome aboard!' });
});
