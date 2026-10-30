import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ScheduleReenableFields } from '../../src/components/ScheduleReenableFields';

vi.mock('react-native', () => ({
  Text: 'text',
  View: 'view',
}));
vi.mock('../../src/components/DatePickerField', () => ({
  DatePickerField: 'date-picker',
}));

function getDatePickerFields(renderer: ReactTestRenderer) {
  return renderer.root.findAll(({ type }) => String(type) === 'date-picker');
}

function render(element: ReactElement) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) throw new Error('Could not render schedule re-enable fields');
  return renderer;
}

describe('ScheduleReenableFields', () => {
  it('requires a watering date and renders a fertilizing date only when applicable', () => {
    const renderer = render(
      <ScheduleReenableFields
        visible
        requiresFertilizingDate
        today="2026-10-30"
        lastWateredDate={undefined}
        lastFertilizedDate={undefined}
        onLastWateredDateChange={vi.fn()}
        onLastFertilizedDateChange={vi.fn()}
      />,
    );

    expect(getDatePickerFields(renderer).map(({ props }) => props.label))
      .toEqual(['Last watered date', 'Last fertilized date']);
    act(() => {
      renderer.update(
        <ScheduleReenableFields
          visible
          requiresFertilizingDate={false}
          today="2026-10-30"
          lastWateredDate={undefined}
          lastFertilizedDate={undefined}
          onLastWateredDateChange={vi.fn()}
          onLastFertilizedDateChange={vi.fn()}
        />,
      );
    });
    expect(getDatePickerFields(renderer).map(({ props }) => props.label))
      .toEqual(['Last watered date']);
    renderer.unmount();
  });

  it('hides date fields until scheduling is being re-enabled', () => {
    const renderer = render(
      <ScheduleReenableFields
        visible={false}
        requiresFertilizingDate
        today="2026-10-30"
        lastWateredDate={undefined}
        lastFertilizedDate={undefined}
        onLastWateredDateChange={vi.fn()}
        onLastFertilizedDateChange={vi.fn()}
      />,
    );

    expect(renderer.toJSON()).toBeNull();
    renderer.unmount();
  });
});
