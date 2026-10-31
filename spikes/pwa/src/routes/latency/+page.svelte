<script lang="ts">
	// S-1.4a: open this page on each origin (run.app, cf., fb.) and compare the totals.
	let rows = $state<{ label: string; p50: number; p95: number; max: number; edge: string }[]>([]);
	let cookies = $state<unknown>(null);
	let busy = $state(false);

	const pct = (s: number[], p: number) =>
		s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];

	async function run(n = 30) {
		busy = true;
		const times: number[] = [];
		let edge = '';
		for (let i = 0; i < n; i++) {
			const t0 = performance.now();
			const res = await fetch('/api/ping', { cache: 'no-store' });
			await res.text();
			times.push(performance.now() - t0);
			edge = res.headers.get('cf-ray')?.split('-')[1] ?? res.headers.get('x-served-by') ?? '';
		}
		times.sort((a, b) => a - b);
		rows.push({
			label: `${new Date().toLocaleTimeString()} ×${n}`,
			p50: Math.round(pct(times, 50)),
			p95: Math.round(pct(times, 95)),
			max: Math.round(times[times.length - 1]),
			edge
		});
		busy = false;
	}

	async function checkCookies() {
		await fetch('/api/cookies', { method: 'POST' });
		cookies = await (await fetch('/api/cookies')).json();
	}
</script>

<h1>Domain probe (S-1.4a)</h1>
<p>Origin: <strong>{location.origin}</strong></p>

<button disabled={busy} onclick={() => run()}>{busy ? 'Running…' : 'Time 30 pings'}</button>
<button onclick={checkCookies}>Check cookies</button>

{#if rows.length}
	<table>
		<thead><tr><th>Run</th><th>p50</th><th>p95</th><th>max</th><th>Edge</th></tr></thead>
		<tbody>
			{#each rows as r}
				<tr><td>{r.label}</td><td>{r.p50}</td><td>{r.p95}</td><td>{r.max}</td><td>{r.edge}</td></tr>
			{/each}
		</tbody>
	</table>
	<p>
		Milliseconds, measured in the browser (total round trip). The first run includes connection
		setup.
	</p>
{/if}

{#if cookies}
	<pre>{JSON.stringify(cookies, null, 2)}</pre>
{/if}
