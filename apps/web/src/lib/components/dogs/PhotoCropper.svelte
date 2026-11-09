<script lang="ts">
	// Framing a dog's photo (ui.md J1 step 4): drag to move, pinch or use the slider to zoom, inside
	// a square with the circle the avatar will show. It has no confirm button of its own: the sheet
	// around it has the one, which calls `crop()` to draw the square at 1024 px as a JPEG, so a
	// 12-megapixel camera photo goes up as a few hundred KB (architecture §3.6).
	import Icon from '#lib/components/icon/Icon.svelte';
	import {
		MAX_ZOOM,
		coverScale,
		initialFrame,
		panBy,
		sourceRect,
		zoomTo,
		type Frame,
		type Size
	} from '#lib/dogs/crop.js';

	interface Props {
		file: File;
		/** Whether the photo has opened and can be cropped. */
		ready?: boolean;
		/** The browser couldn't open the photo, so another must be chosen. */
		onunreadable: () => void;
		/** The most the square may be across, as CSS, so the sheet's button stays in view. */
		maxSide?: string;
	}

	// `ready` is written here and read by the sheet that binds it, which ESLint can't see.
	// eslint-disable-next-line no-useless-assignment
	let { file, ready = $bindable(false), onunreadable, maxSide }: Props = $props();

	/** The photo the server receives: square, this many pixels across (architecture §3.6). */
	const OUTPUT = 1024;
	const KEY_STEP = 16;

	const url = $derived(URL.createObjectURL(file));
	$effect(() => {
		const current = url;
		return () => URL.revokeObjectURL(current);
	});

	let image = $state<HTMLImageElement | null>(null);
	let side = $state(0);
	let photo = $state<Size | null>(null);
	let frame = $state<Frame | null>(null);
	$effect(() => {
		ready = frame !== null;
	});

	// Fit again whenever the square's size changes, e.g. on turning the phone.
	$effect(() => {
		if (photo && side > 0) frame = initialFrame(photo, side);
	});

	function loaded() {
		if (!image) return;
		photo = { width: image.naturalWidth, height: image.naturalHeight };
	}

	const zoom = $derived(photo && frame ? frame.scale / coverScale(photo, side) : 1);

	function setZoom(value: number, cx = side / 2, cy = side / 2) {
		if (!photo || !frame) return;
		frame = zoomTo(frame, value * coverScale(photo, side), cx, cy, photo, side);
	}

	// Pointers down on the square: one drags, two pinch. Only the frame they move is rendered, so
	// the map itself needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, { x: number; y: number }>();
	const spread = () => {
		const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
		return {
			distance: Math.hypot(a.x - b.x, a.y - b.y),
			x: (a.x + b.x) / 2,
			y: (a.y + b.y) / 2
		};
	};

	function pointerDown(event: PointerEvent) {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, local(event));
	}

	function pointerMove(event: PointerEvent) {
		if (!photo || !frame || !pointers.has(event.pointerId)) return;
		const point = local(event);
		if (pointers.size === 1) {
			const last = pointers.get(event.pointerId)!;
			pointers.set(event.pointerId, point);
			frame = panBy(frame, point.x - last.x, point.y - last.y, photo, side);
			return;
		}
		const before = spread();
		pointers.set(event.pointerId, point);
		const after = spread();
		if (before.distance === 0) return;
		const scaled = zoomTo(
			frame,
			frame.scale * (after.distance / before.distance),
			before.x,
			before.y,
			photo,
			side
		);
		frame = panBy(scaled, after.x - before.x, after.y - before.y, photo, side);
	}

	function pointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
	}

	function local(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return { x: event.clientX - box.left, y: event.clientY - box.top };
	}

	function wheel(event: WheelEvent) {
		event.preventDefault();
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		setZoom(
			zoom * Math.exp(-event.deltaY / 500),
			event.clientX - box.left,
			event.clientY - box.top
		);
	}

	function key(event: KeyboardEvent) {
		if (!photo || !frame) return;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [KEY_STEP, 0],
			ArrowRight: [-KEY_STEP, 0],
			ArrowUp: [0, KEY_STEP],
			ArrowDown: [0, -KEY_STEP]
		};
		const move = moves[event.key];
		if (move) frame = panBy(frame, move[0], move[1], photo, side);
		else if (event.key === '+' || event.key === '=') setZoom(zoom * 1.1);
		else if (event.key === '-') setZoom(zoom / 1.1);
		else return;
		event.preventDefault();
	}

	/** The framed square as a JPEG, or null if the photo isn't open or can't be drawn. */
	export async function crop(): Promise<Blob | null> {
		if (!image || !frame) return null;
		const shown = sourceRect(frame, side);
		const canvas = document.createElement('canvas');
		canvas.width = OUTPUT;
		canvas.height = OUTPUT;
		const context = canvas.getContext('2d');
		context?.drawImage(image, shown.x, shown.y, shown.size, shown.size, 0, 0, OUTPUT, OUTPUT);
		const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
		if (!blob) onunreadable();
		return blob;
	}
</script>

<div class="flex flex-col gap-4">
	<!-- A pan-and-zoom surface: pointers drag and pinch, and the keyboard pans with the arrows. The
	     slider below does the zooming for anyone who can't pinch. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		bind:clientWidth={side}
		style:max-width={maxSide}
		class="relative mx-auto aspect-square w-full touch-none overflow-hidden rounded-2xl bg-soft select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		role="application"
		aria-label="Photo framing. Drag to move, pinch to zoom, or use the arrow keys."
		tabindex="0"
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
		onwheel={wheel}
		onkeydown={key}
	>
		<img
			bind:this={image}
			src={url}
			alt=""
			draggable="false"
			class="absolute top-0 left-0 max-w-none origin-top-left"
			class:invisible={!frame}
			style:transform={frame
				? `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`
				: undefined}
			onload={loaded}
			onerror={onunreadable}
		/>
		<!-- The circle the avatar will show, with the rest dimmed. -->
		<div
			class="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)]"
		></div>
		{#if !frame}
			<div class="absolute inset-0 flex items-center justify-center">
				<Icon name="saving" class="animate-spin text-muted-foreground" />
			</div>
		{/if}
	</div>

	<!-- Shown once the photo is open, rather than disabled while it opens behind the spinner. -->
	{#if frame}
		<label class="flex items-center gap-3">
			<span class="font-bold">Zoom</span>
			<input
				type="range"
				min="1"
				max={MAX_ZOOM}
				step="0.01"
				value={zoom}
				oninput={(e) => setZoom(Number(e.currentTarget.value))}
				class="h-12 min-w-0 flex-1 accent-primary"
			/>
		</label>
	{/if}
</div>
