<script lang="ts">
	// The privacy policy or terms (backlog S16.4): public, readable signed in or out, and from the
	// sign-in page, More and the landing page. The back link goes where the person came from, else
	// to / loaded afresh: the landing page when signed out (from the edge, D44), else the app.
	import { resolve } from '$app/paths';
	import BackLink from '#lib/components/shell/BackLink.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';

	interface Props {
		title: string;
		/** For search results and link previews: these two are public pages (backlog S21.3). */
		description: string;
		updated: string;
		html: string;
	}

	let { title, description, updated, html }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Toe Beans</title>
	<meta name="description" content={description} />
</svelte:head>

<main class="mx-auto max-w-2xl pb-12">
	<PageHeader {title} subtitle={`Last updated ${updated}`}>
		<BackLink href={resolve('/(app)')} label="Toe Beans" reload />
	</PageHeader>
	<!-- Our own Markdown, rendered on the server (lib/server/legal.ts). -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<article class="legal px-4">{@html html}</article>
</main>

<style>
	.legal {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow-wrap: break-word;
	}
	.legal :global(h2) {
		margin-top: 1.25rem;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.3;
	}
	.legal :global(ul) {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding-left: 1.25rem;
		list-style: disc;
	}
	.legal :global(a) {
		color: var(--tb-primary);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.legal :global(code) {
		overflow-wrap: anywhere;
		font-size: 0.9em;
	}
	.legal :global(table) {
		border-collapse: collapse;
		font-size: 0.9375rem;
	}
	.legal :global(th),
	.legal :global(td) {
		padding: 0.5rem 0.75rem 0.5rem 0;
		border-bottom: 1px solid var(--tb-border);
		text-align: left;
		vertical-align: top;
	}
	.legal :global(th) {
		font-weight: 800;
	}
	/* On a phone each row stacks into a card: the first cell as its title, the others under their
	   column's name (lib/server/legal.ts puts it on each cell), so nothing scrolls sideways. */
	@media (width < 40rem) {
		.legal :global(thead) {
			display: none;
		}
		.legal :global(table),
		.legal :global(tbody),
		.legal :global(tr),
		.legal :global(td) {
			display: block;
		}
		.legal :global(tr) {
			padding: 0.75rem 0;
			border-bottom: 1px solid var(--tb-border);
		}
		.legal :global(td) {
			padding: 0.125rem 0;
			border: 0;
		}
		.legal :global(td:first-child) {
			font-weight: 700;
		}
		.legal :global(td:not(:first-child)::before) {
			content: attr(data-label) ': ';
			color: var(--tb-text-muted);
		}
	}
</style>
