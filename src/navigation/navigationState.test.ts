import { describe, expect, it } from 'vitest';
import { activeScreen, goBack, pushScreen, switchPrimaryScreen } from './navigationState';

describe('navigation state', () => {
  it('opens nested screens and returns to the previous meaningful screen', () => {
    const detail = pushScreen(['plants'], 'plant-detail');
    expect(activeScreen(detail)).toBe('plant-detail');
    expect(activeScreen(goBack(detail))).toBe('plants');
  });
  it('returns from settings to the screen that opened it', () => { expect(activeScreen(goBack(pushScreen(['journal'], 'settings')))).toBe('journal'); });
  it('switches primary destinations without retaining a nested route', () => { expect(switchPrimaryScreen(['plants', 'plant-detail'], 'journal')).toEqual(['journal']); });
  it('does not pop the root destination on back', () => { expect(goBack(['today'])).toEqual(['today']); });
});
