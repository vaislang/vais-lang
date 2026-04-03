/**
 * @vaisx/testing-library — public API
 *
 * Re-exports everything needed for testing VaisX components.
 */

// Core render / cleanup
export { render, cleanup } from "./render.js";
export type { RenderResult, RenderOptions, ComponentFactory } from "./render.js";

// Low-level event simulation
export { fireEvent } from "./fire-event.js";
export type { FireEventOptions } from "./fire-event.js";

// High-level user interactions
export {
  userEvent,
  type as userType,
  click as userClick,
  dblClick as userDblClick,
  hover as userHover,
  unhover as userUnhover,
  tab as userTab,
  clear as userClear,
  selectOptions as userSelectOptions,
} from "./user-event.js";

// DOM queries — getBy*
export { getByText, getByTestId, getByRole } from "./queries.js";

// DOM queries — queryBy*
export { queryByText, queryByTestId, queryByRole } from "./queries.js";

// DOM queries — queryAllBy*
export { queryAllByText, queryAllByTestId, queryAllByRole } from "./queries.js";

// DOM queries — findBy* (async)
export { findByText, findByTestId, findByRole } from "./queries.js";

// Async waiting utilities
export { waitFor, waitForElementToBeRemoved } from "./wait-for.js";
export type { WaitForOptions } from "./wait-for.js";

// Snapshot utilities
export {
  snapshotHtml,
  snapshotElement,
  captureSnapshot,
  assertSnapshotMatch,
  normaliseHtml,
  prettyHtml,
} from "./snapshot.js";
export type { ComponentSnapshot } from "./snapshot.js";
