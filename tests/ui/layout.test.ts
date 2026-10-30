import { describe, expect, it } from 'vitest';

import { getBottomNavigationPadding } from '../../src/ui/layout';

describe('getBottomNavigationPadding', () => {
  it('preserves the existing spacing when there is no bottom inset', () => {
    expect(getBottomNavigationPadding(0)).toBe(18);
  });

  it('adds the device bottom inset to the existing spacing', () => {
    expect(getBottomNavigationPadding(24)).toBe(42);
  });
});
