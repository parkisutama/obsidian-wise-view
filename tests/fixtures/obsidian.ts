// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Parkis Utama

// Test double for the `obsidian` module (aliased in vitest.config.ts). The real package only
// ships type declarations; its runtime is provided by the Obsidian app.

type DomOptions = { cls?: string | string[]; text?: string };

declare global {
	interface HTMLElement {
		empty(): void;
		addClass(...cls: string[]): void;
		removeClass(...cls: string[]): void;
		toggleClass(cls: string, value: boolean): void;
		setText(text: string): void;
		createDiv(options?: DomOptions): HTMLDivElement;
		createSpan(options?: DomOptions): HTMLSpanElement;
	}
}

function createChild<K extends keyof HTMLElementTagNameMap>(
	parent: HTMLElement,
	tag: K,
	options: DomOptions = {},
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (options.cls) el.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
	if (options.text) el.textContent = options.text;
	parent.appendChild(el);
	return el;
}

/** Install Obsidian's HTMLElement helpers. Call once per DOM environment. */
export function installDomHelpers(): void {
	const proto = HTMLElement.prototype;
	proto.empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
	proto.addClass = function (this: HTMLElement, ...cls: string[]) {
		this.classList.add(...cls);
	};
	proto.removeClass = function (this: HTMLElement, ...cls: string[]) {
		this.classList.remove(...cls);
	};
	proto.toggleClass = function (this: HTMLElement, cls: string, value: boolean) {
		this.classList.toggle(cls, value);
	};
	proto.setText = function (this: HTMLElement, text: string) {
		this.textContent = text;
	};
	proto.createDiv = function (this: HTMLElement, options?: DomOptions) {
		return createChild(this, "div", options);
	};
	proto.createSpan = function (this: HTMLElement, options?: DomOptions) {
		return createChild(this, "span", options);
	};
}

/** Renders a marker <svg data-icon="name"> so tests can assert which icon was set. */
export function setIcon(el: HTMLElement, name: string): void {
	el.replaceChildren();
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("data-icon", name);
	el.appendChild(svg);
}

export class App {}

export class BasesView {
	app: unknown;
	config: unknown;
	data: unknown;
	constructor(controller: { app?: unknown; config?: unknown; data?: unknown }) {
		this.app = controller.app;
		this.config = controller.config;
		this.data = controller.data;
	}
}

export class TAbstractFile {
	path = "";
}

export class TFile extends TAbstractFile {
	basename: string;
	constructor(path: string) {
		super();
		this.path = path;
		this.basename = path.replace(/\.md$/, "").split("/").pop() ?? path;
	}
}

export class TFolder extends TAbstractFile {}

export const notices: string[] = [];
export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class Menu {
	addItem(callback: (item: unknown) => void): this {
		const item = {
			setTitle: () => item,
			setIcon: () => item,
			onClick: () => item,
		};
		callback(item);
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtPosition(): void {}
}

export const normalizePath = (path: string): string => path;
export const parseYaml = (): Record<string, unknown> => ({});
export const stringifyYaml = (): string => "";
