// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Popout-safe window/document helpers (T008, spec §7.4).
 *
 * A view mounted in an Obsidian popout window lives in a different `Document`/`Window` than
 * the main app. Observer and animation-frame constructors must come from the element's own
 * `ownerDocument`/`defaultView`, not the bare global `document`/`window`, or they silently
 * attach to the wrong window.
 */

/** The `Document` that owns `node`, falling back to the global document for detached nodes. */
export function ownerDocument(node: Node): Document {
	return node.ownerDocument ?? document;
}

/** The `Window` that owns `node`'s document, falling back to the global window. */
export function ownerWindow(node: Node): Window {
	return ownerDocument(node).defaultView ?? window;
}
