// tools/typecheck/ambient.d.ts — WHAT THE GAME'S OWN FILES CANNOT SAY. Read by tools/typecheck.mjs, never shipped.
//
// Each block removes a kind of error that is true to the compiler and false to the game, so that a new line of
// ordinary code does not go red for it. Nothing here hides a wrong field on the game's own data.

// `window.Hearthrise...` and friends: tests/window-globals-exist.mjs is the census of these, with its own proof.
interface Window { [name: string]: any; }

// An expando on an Error is how the game tags one (`e.starved = true`, then `if (e.starved)` at the catch).
interface Error { [name: string]: any; }

// querySelector answers Element, but the caller asked for a thing it knows. This still catches `el.txtContent`:
// a field no form, link, image or plain element has.
interface GameElement extends HTMLElement {
  disabled: boolean; value: string; checked: boolean; src: string; href: string; name: string; type: string;
  width: number; height: number; placeholder: string; select(): void; elements: HTMLFormControlsCollection & Record<string, any>;
  options: HTMLOptionsCollection; selectedIndex: number;
}
interface Element { blur(): void; focus(options?: FocusOptions): void; }
interface ParentNode {
  querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K];
  querySelector(selectors: string): GameElement;
  querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeListOf<HTMLElementTagNameMap[K]>;
  querySelectorAll(selectors: string): NodeListOf<GameElement>;
}
interface Element {
  closest<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K];
  closest(selectors: string): GameElement;
}
interface ChildNode { querySelector(selectors: string): GameElement; querySelectorAll(selectors: string): NodeListOf<GameElement>; closest(selectors: string): GameElement; }

// e.target: every listener here is on an element it made.
interface EventTarget {
  closest(selectors: string): GameElement; matches(selectors: string): boolean; contains(other: Node | null): boolean;
  getAttribute(name: string): string | null; hasAttribute(name: string): boolean;
  tagName: string; id: string; value: string; checked: boolean; disabled: boolean; src: string; href: string;
  dataset: DOMStringMap; classList: DOMTokenList; parentElement: HTMLElement | null; isContentEditable: boolean;
}

// The game draws in 2D only; a context id held in a variable still answers a 2D context.
interface HTMLCanvasElement { getContext(contextId: string, options?: any): CanvasRenderingContext2D; }
