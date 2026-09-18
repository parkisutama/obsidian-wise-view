// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// Test double for the `obsidian` module (aliased in vitest.config.mts). The real package only
// ships type declarations; its runtime is provided by the Obsidian app.

type DomOptions = { cls?: string | string[]; text?: string };

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
	// Obsidian's globals are typed by the obsidian package; the test double only needs to exist.
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
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
	proto.createEl = function <K extends keyof HTMLElementTagNameMap>(this: HTMLElement, tag: K, options?: DomOptions) {
		return createChild(this, tag, options);
	};
	proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
		for (const [name, value] of Object.entries(props)) {
			this.style.setProperty(name, value);
		}
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

// Bases value wrappers; the views only use them for instanceof checks and toString.
export class Value {}
export class NullValue extends Value {}
export class NumberValue extends Value {
	constructor(private readonly value: number) {
		super();
	}
	toString(): string {
		return String(this.value);
	}
}
export class DateValue extends Value {
	constructor(private readonly value: Date) {
		super();
	}
	dateOnly(): this {
		return this;
	}
	toString(): string {
		return this.value.toISOString().slice(0, 10);
	}
}

/** Plugin base with in-memory data.json (set `storedData` before calling loadData). */
export class Plugin {
	app: unknown;
	storedData: unknown = null;
	constructor(app?: unknown) {
		this.app = app;
	}
	async loadData(): Promise<unknown> {
		return this.storedData;
	}
	async saveData(data: unknown): Promise<void> {
		this.storedData = data;
	}
}

export class PluginSettingTab {
	constructor(
		public app: unknown,
		public plugin: unknown,
	) {}
}
export class Setting {}

export class Modal {
	constructor(public app: unknown) {}
	open(): void {}
	close(): void {}
}
export class SuggestModal<T> extends Modal {
	declare readonly suggestion?: T;
}

export const normalizePath = (path: string): string => path;
export const parseYaml = (): Record<string, unknown> => ({});
export const stringifyYaml = (): string => "";
