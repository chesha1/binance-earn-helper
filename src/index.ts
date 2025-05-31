import { ExecutionContext } from '@cloudflare/workers-types';
import { handler, handler2 } from './service';
import { Env } from './types';

export default {
	async fetch(event: Event, env: Env, ctx: ExecutionContext): Promise<Response> {
		const API_KEY = env.API_KEY;
		const API_SECRET = env.API_SECRET;

		const res = await handler(API_KEY, API_SECRET);

		return Response.json(res);

	},
};
