import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DatePickerField } from '../../src/components/DatePickerField';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'pressable',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'text',
  View: 'view',
}));
vi.mock('@react-native-community/datetimepicker', () => ({
  default: 'date-time-picker',
}));

function getPressables(renderer: ReactTestRenderer) {
  return renderer.root.findAll(({ type }) => String(type) === 'pressable');
}

function render(element: ReactElement) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) throw new Error('Could not render date picker field');
  return renderer;
}

describe('DatePickerField', () => {
  it('commits today when the user confirms an unselected date', () => {
    const onChange = vi.fn();
    const element: ReactElement = (
      <DatePickerField label="Last watered date" onChange={onChange} />
    );
    const renderer = render(element);

    act(() => getPressables(renderer)[0]?.props.onPress());
    const pressables = getPressables(renderer);
    act(() => pressables[1]?.props.onPress());

    const date = new Date();
    const expectedToday = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    expect(onChange).toHaveBeenCalledWith(expectedToday);
    renderer.unmount();
  });
});
