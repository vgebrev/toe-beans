// Household resources are for members only. Someone with no household gets a 404, as if they'd
// asked for another household's data (architecture §4.4).
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { notFound } from '../application/errors.js';
import { errorResponse } from './response.js';

export const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;

export const noHousehold = () => errorResponse(notFound('household'));
