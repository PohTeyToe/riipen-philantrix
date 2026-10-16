// Types for the agent's checks. The implementation is plain JavaScript so the agent run uses it without a compiler.
export const ANSWER_TYPES: string[];
export const WANTS: string[];
export const FORMULA_OPS: string[];
export function findQuote(quote: string, source: string): 'exact' | 'spread' | null;
export function locateQuote(quote: string, source: string): [number, number] | null;
export function checkExtraction(result: unknown, source: string): string[];
export function checkField(answer: unknown, field: unknown, ctx: unknown): string[];
export function checkItem(item: unknown, answers: unknown[], ctx: unknown): string[];
