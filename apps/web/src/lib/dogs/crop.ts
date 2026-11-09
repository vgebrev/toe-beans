// The maths of framing a photo in a square (ui.md J1 step 4): the photo always covers the square,
// zooming from "just covers" to 4× and panning only as far as an edge. Kept apart from the
// component so it can be tested without a browser.

export interface Size {
	width: number;
	height: number;
}

/** Where the photo sits: its top-left corner relative to the square's, and its scale. */
export interface Frame {
	x: number;
	y: number;
	/** Screen pixels per photo pixel. */
	scale: number;
}

export const MAX_ZOOM = 4;

/** The scale at which the photo's shorter side just fills the square. */
export const coverScale = (photo: Size, side: number) => side / Math.min(photo.width, photo.height);

/** Keeps the scale between covering and 4× that, and the photo over the whole square. */
export function clampFrame(frame: Frame, photo: Size, side: number): Frame {
	const min = coverScale(photo, side);
	const scale = Math.min(Math.max(frame.scale, min), min * MAX_ZOOM);
	const clamp = (value: number, length: number) => Math.min(0, Math.max(side - length, value));
	return {
		scale,
		x: clamp(frame.x, photo.width * scale),
		y: clamp(frame.y, photo.height * scale)
	};
}

/** The photo covering the square, centred. */
export const initialFrame = (photo: Size, side: number): Frame => {
	const scale = coverScale(photo, side);
	return clampFrame(
		{
			scale,
			x: (side - photo.width * scale) / 2,
			y: (side - photo.height * scale) / 2
		},
		photo,
		side
	);
};

export const panBy = (frame: Frame, dx: number, dy: number, photo: Size, side: number) =>
	clampFrame({ ...frame, x: frame.x + dx, y: frame.y + dy }, photo, side);

/** Zooms to `scale` keeping the photo point under (`cx`, `cy`) where it is, as a pinch does. */
export function zoomTo(
	frame: Frame,
	scale: number,
	cx: number,
	cy: number,
	photo: Size,
	side: number
): Frame {
	const ratio = scale / frame.scale;
	return clampFrame(
		{ scale, x: cx - (cx - frame.x) * ratio, y: cy - (cy - frame.y) * ratio },
		photo,
		side
	);
}

/** The part of the photo, in its own pixels, that the square shows. */
export const sourceRect = (frame: Frame, side: number) => ({
	x: -frame.x / frame.scale,
	y: -frame.y / frame.scale,
	size: side / frame.scale
});
