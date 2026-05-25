interface Env {
	WORKER_URL: string;
	WORKER_TOKEN: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
	const { request, env } = context;

	// Validate env vars exist
	if (!env.WORKER_URL || !env.WORKER_TOKEN) {
		return new Response(
			JSON.stringify({ error: 'Worker URL or token not configured' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } },
		);
	}

	// Forward request to real Worker with Bearer token added server-side
	const workerResponse = await fetch(`${env.WORKER_URL}/api/ask`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.WORKER_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: request.body,
	});

	// Pass through stream, status, and headers
	return new Response(workerResponse.body, {
		status: workerResponse.status,
		headers: workerResponse.headers,
	});
};
