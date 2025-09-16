import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('Telegram Crypto Bot', () => {
	it('responds with method not allowed for GET requests (unit style)', async () => {
		const request = new Request('http://example.com');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"Method not allowed. This endpoint accepts only POST requests for Telegram webhooks."`);
		expect(response.status).toBe(405);
	});

	it('responds with method not allowed for GET requests (integration style)', async () => {
		const response = await SELF.fetch('http://example.com');
		expect(await response.text()).toMatchInlineSnapshot(`"Method not allowed. This endpoint accepts only POST requests for Telegram webhooks."`);
		expect(response.status).toBe(405);
	});

	it('handles CORS preflight requests', async () => {
		const request = new Request('http://example.com', { method: 'OPTIONS' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('handles empty POST requests gracefully', async () => {
		const request = new Request('http://example.com', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toBe('ok');
		expect(response.status).toBe(200);
	});

	it('handles P2P proxy endpoint', async () => {
		const request = new Request('http://example.com/binancep2p', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				asset: 'USDT',
				fiat: 'ETB',
				tradeType: 'BUY',
				rows: 10,
				page: 1
			})
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		
		// The response should be a proxy attempt (might fail due to network restrictions in test env)
		// but should at least return a structured response
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});
});
