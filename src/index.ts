import { ExecutionContext } from '@cloudflare/workers-types';
import { handler } from './service';
import { Env } from './types';

export default {
	async fetch(event: Event, env: Env, ctx: ExecutionContext): Promise<Response> {
		const API_KEY = env.API_KEY;
		const API_SECRET = env.API_SECRET;
		const LOCKED_ASSETS = JSON.parse(env.LOCKED_ASSETS);

		const res = await handler(API_KEY, API_SECRET, LOCKED_ASSETS);

		return Response.json(res);

	},
};
