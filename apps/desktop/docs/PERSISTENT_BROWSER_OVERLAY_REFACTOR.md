# Persistent Browser Overlay Refactor

This document describes the cleaner architecture for persistent browser tabs in Desktop and the refactor that follows from it.

## Problem

We want browser panes to preserve page state across:

- tab switches
- workspace switches
- layout changes inside the workspace view

The first persistence implementation solved the Electron reload problem by moving `<webview>` nodes into a dashboard-level overlay and positioning them over transparent pane slots. That part was directionally right, but the ownership model stayed split across too many places:

- `WebviewOverlay` owned the global container
- `webview-overlay.ts` owned imperative DOM wrappers and positioning
- `BrowserPane` still owned blank/error browser chrome and portaled it back into the overlay
- `TabsContent` had to force periodic resyncs because visibility changes were not naturally part of the overlay lifecycle

That left us with an architecture that worked, but still felt like two UIs glued together.

## Design Goals

- Keep each browser pane backed by one stable Electron `<webview>` node for the life of that pane.
- Never reparent that `<webview>` during tab/workspace switching.
- Make the overlay the real owner of browser rendering, not just a parking lot for DOM nodes.
- Keep pane-level browser controls in `BrowserPane`, but move page rendering and page chrome into the overlay surface.
- Replace polling-based position correction with event-driven updates.

## Target Architecture

### 1. React-owned overlay surfaces

`WebviewOverlay` renders one `PersistentBrowserSurface` per browser pane currently in the tabs store.

Each surface owns:

- the positioned wrapper
- the DOM host for the persistent `<webview>`
- the blank state
- the error overlay
- visibility and geometry sync to its registered pane slot

This means the browser page and its chrome live in one React subtree.

### 2. Small imperative core for the actual webview node

`renderer/stores/webview-overlay.ts` becomes a thin module-level registry for persistent Electron webviews:

- create/get persistent webview by `paneId`
- attach the existing webview node to a stable host element owned by the surface
- register/unregister the current pane slot element
- destroy the webview when the pane is removed
- expose imperative browser actions (`navigate`, `reload`, history navigation)

The registry still matters because Electron webview DOM nodes are stateful and need stable identity outside normal React reconciliation.

### 3. BrowserPane becomes a slot + toolbar

`BrowserPane` is reduced to:

- browser toolbar
- devtools/open/split actions
- a transparent slot element registered with the overlay

It no longer owns blank/error page chrome and no longer portals UI into the overlay.

### 4. Event-driven layout sync

Each `PersistentBrowserSurface` computes its placement from the registered slot and updates when:

- the slot is registered or unregistered
- the slot element resizes
- the window resizes
- tab/workspace activation changes cause visibility changes in the pane tree

The important shift is that layout sync is now driven by concrete events instead of a `setInterval` fallback loop.

## Invariants

- One browser pane maps to one persistent webview node.
- Browser state is destroyed only when the pane is removed from the tabs store.
- Hidden tabs keep their browser surfaces mounted but not visible.
- Browser chrome is rendered in the same overlay surface as the webview it belongs to.
- Main-process browser registration still keys off the same `paneId`.

## Migration Plan

1. Keep the existing tabs-store-driven pane lifecycle.
2. Introduce `PersistentBrowserSurface` under `WebviewOverlay`.
3. Simplify the registry so it owns only persistent webview identity, not React chrome.
4. Move blank/error rendering out of `BrowserPane` and into the overlay surface.
5. Replace periodic `syncAllPositions()` polling with surface-level observers plus explicit activation signals.
6. Leave browser toolbar actions and tRPC subscriptions in `BrowserPane`/`usePersistentWebview`, since those are still pane-local concerns.

## Expected Benefits

- Clearer ownership: overlay surfaces render the page and its chrome, pane components render the workspace UI around it.
- Fewer cross-layer hacks: no portal from `BrowserPane` back into the overlay.
- Better behavior under tab switches: visibility changes become part of the surface lifecycle instead of something corrected later by polling.
- Easier follow-up work: blank states, loading states, devtools affordances, or per-browser overlays can all evolve inside the browser surface component.
