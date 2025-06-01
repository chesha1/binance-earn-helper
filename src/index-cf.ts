import { ExecutionContext } from '@cloudflare/workers-types';
import { handler } from './service';
import { Env } from './types';

export default {
	async fetch(): Promise<Response> {
		return new Response('Forbidden', { status: 403 });
	},
	async scheduled(event: Event, env: Env, ctx: ExecutionContext): Promise<Response> {
		const API_KEY = env.API_KEY;
		const API_SECRET = env.API_SECRET;

		await handler(API_KEY, API_SECRET);

		return Response.json({
			success: true,
		});

	},
};
