/**
 * What jsdom does not provide, and what it provides too well, for the islands
 * rendered under the `dom` project.
 *
 * Every global here is installed with `Object.defineProperty` rather than
 * `vi.stubGlobal`, and the distinction is invisible at the call site: a setup
 * file runs once per test FILE while `vi.unstubAllGlobals()` runs per TEST.
 * `stubGlobal` records the value it replaced and restores to it, so a stub
 * installed here is torn down by the first `afterEach` that unstubs, and every
 * later test in that file renders against a missing global. A defined property
 * is instead the value `unstubAllGlobals` restores TO.
 */

// jsdom ships no `matchMedia`, and every animating island calls
// `useReducedMotion`, which reads it in a layout effect and then subscribes.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
})

// `Palette` scrolls the highlighted row into view on arrow press.
Element.prototype.scrollIntoView = () => {}

// jsdom's `fetch` is real and `location.href` is http://localhost:3000/, so an
// unstubbed component request opens a connection instead of failing. Throwing
// names the test that forgot, and is not swallowed by the islands' own
// `.catch()`, which would route the omission into the fallback path and pass.
Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  configurable: true,
  value: () => {
    throw new Error('unstubbed fetch: stub it with vi.stubGlobal in the test')
  },
})
