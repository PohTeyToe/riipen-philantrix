// Types for the page's live guard. The implementation is plain JavaScript so the build script runs it without a compiler.
export const NUMBER_WORDS: string[];
export const COMPARISON_WORDS: string[];
export const STALE_WORDS: string[];
export function checkText(text: string, ctx: { slots: string[]; firstNames: string[] }): string[];
export function checkAnswer(text: string, ctx: { slots: string[]; firstNames: string[] }): string[];
export function render(text: string, values: Record<string, string>): string;
