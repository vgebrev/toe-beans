// A dog's accent as Tailwind classes (ui.md §5.5). Spelled out in full so Tailwind finds them.
const backgrounds = ['bg-dog-0', 'bg-dog-1', 'bg-dog-2', 'bg-dog-3', 'bg-dog-4', 'bg-dog-5'];
const rings = ['ring-dog-0', 'ring-dog-1', 'ring-dog-2', 'ring-dog-3', 'ring-dog-4', 'ring-dog-5'];

const pick = (classes: string[], accent: number) => classes[accent % classes.length]!;

export const accentBackground = (accent: number) => pick(backgrounds, accent);
export const accentRing = (accent: number) => pick(rings, accent);
