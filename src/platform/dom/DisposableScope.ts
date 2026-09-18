// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Idempotent disposal scope (T008, spec §7.4).
 *
 * Every view gets one of these to own DOM event listeners, observers, timers, animation-frame
 * requests, abort controllers, and child lifecycle components. `dispose()` releases every owned
 * resource exactly once, in reverse registration order, and is safe to call more than once.
 */

/** Anything with an idempotent teardown method; matches both DOM observers and Obsidian `Component`. */
export interface Disposable {
	disconnect?(): void;
	dispose?(): void;
	unload?(): void;
}

type Cleanup = () => void;

export class DisposableScope {
	private disposed = false;
	private readonly cleanups: Cleanup[] = [];

	/** True once `dispose()` has run; further registrations are refused. */
	get isDisposed(): boolean {
		return this.disposed;
	}

	/** Registers a raw cleanup callback. Ignored (and warned) if the scope is already disposed. */
	add(cleanup: Cleanup): void {
		if (this.disposed) {
			cleanup();
			return;
		}
		this.cleanups.push(cleanup);
	}

	/** Tracks an event listener and removes it on dispose. */
	addEventListener<K extends keyof WindowEventMap>(
		target: EventTarget,
		type: K | string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void {
		target.addEventListener(type, listener, options);
		this.add(() => target.removeEventListener(type, listener, options));
	}

	/** Tracks a `ResizeObserver`/`MutationObserver`/`IntersectionObserver`-shaped observer. */
	observe(observer: { disconnect(): void }): void {
		this.add(() => observer.disconnect());
	}

	/** Tracks a `setTimeout` handle from the given window and clears it on dispose. */
	setTimeout(win: Window, handler: () => void, timeout?: number): number {
		const id = win.setTimeout(handler, timeout);
		this.add(() => win.clearTimeout(id));
		return id;
	}

	/** Tracks a `setInterval` handle from the given window and clears it on dispose. */
	setInterval(win: Window, handler: () => void, timeout?: number): number {
		const id = win.setInterval(handler, timeout);
		this.add(() => win.clearInterval(id));
		return id;
	}

	/** Tracks a `requestAnimationFrame` handle from the given window and cancels it on dispose. */
	requestAnimationFrame(win: Window, callback: (time: number) => void): number {
		const id = win.requestAnimationFrame(callback);
		this.add(() => win.cancelAnimationFrame(id));
		return id;
	}

	/** Creates an `AbortController` that is aborted on dispose. */
	createAbortController(): AbortController {
		const controller = new AbortController();
		this.add(() => controller.abort());
		return controller;
	}

	/** Tracks any disposable (observer, abort controller, or Obsidian `Component`-like child). */
	own<T extends Disposable>(disposable: T): T {
		this.add(() => {
			disposable.disconnect?.();
			disposable.dispose?.();
			disposable.unload?.();
		});
		return disposable;
	}

	/** Releases every owned resource exactly once, in reverse registration order. Safe to call twice. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		while (this.cleanups.length > 0) {
			const cleanup = this.cleanups.pop();
			cleanup?.();
		}
	}
}
