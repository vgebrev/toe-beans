// Helpers the shadcn-svelte components import (`#lib/utils.js`, components.json).
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names, letting later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
