import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom lacks these browser APIs used by charts and dialogs.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false
}
