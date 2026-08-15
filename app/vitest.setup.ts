// jest-dom matchers are attached by hand rather than via
// `@testing-library/jest-dom/vitest`, which cannot resolve `vitest` when it is
// hoisted to the workspace root. Same workaround budget-app documents.
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

expect.extend(matchers);
