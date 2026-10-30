import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PlantLifecycleActions } from '../../src/components/PlantLifecycleActions';

vi.mock('react-native', () => ({
  Button: 'button',
  Text: 'text',
  View: 'view',
}));

function getButtons(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType('button');
}

function render(element: ReactElement) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) throw new Error('Could not render lifecycle actions');
  return renderer;
}

describe('PlantLifecycleActions', () => {
  it('restores an archived plant without requiring destructive confirmation', () => {
    const onRestore = vi.fn();
    const renderer = render(
      <PlantLifecycleActions
        archived
        plantName="Fern"
        onArchive={vi.fn()}
        onRestore={onRestore}
        onDelete={vi.fn()}
      />,
    );

    act(() => getButtons(renderer)[0]?.props.onPress());
    expect(onRestore).toHaveBeenCalledOnce();
    renderer.unmount();
  });

  it('requires confirmation before archiving and does not offer active deletion', () => {
    const onArchive = vi.fn();
    const renderer = render(
      <PlantLifecycleActions
        archived={false}
        plantName="Fern"
        onArchive={onArchive}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(getButtons(renderer).map(({ props }) => props.title)).toEqual([
      'Remove plant',
    ]);

    act(() => getButtons(renderer)[0]?.props.onPress());
    expect(getButtons(renderer).map(({ props }) => props.title)).toEqual([
      'Remove plant',
      'Archive plant',
      'Cancel',
    ]);
    expect(renderer.root.findAllByType('text').map(({ children }) => children.join(' ')))
      .toContain('Archive Fern? Its journal will remain available as a read-only memorial.');

    act(() => getButtons(renderer)[2]?.props.onPress());
    expect(onArchive).not.toHaveBeenCalled();
    act(() => getButtons(renderer)[0]?.props.onPress());
    act(() => getButtons(renderer)[1]?.props.onPress());
    expect(onArchive).toHaveBeenCalledOnce();
    renderer.unmount();
  });

  it('requires confirmation before permanent deletion from the archive', () => {
    const onDelete = vi.fn();
    const renderer = render(
      <PlantLifecycleActions
        archived
        plantName="Fern"
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(getButtons(renderer).map(({ props }) => props.title)).toEqual([
      'Restore plant',
      'Delete plant',
    ]);
    act(() => getButtons(renderer)[1]?.props.onPress());
    expect(onDelete).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('text').map(({ children }) => children.join(' ')))
      .toContain('Permanently delete Fern and its journal history? This cannot be undone.');
    expect(getButtons(renderer).map(({ props }) => props.title)).toEqual([
      'Restore plant',
      'Delete plant',
      'Delete permanently',
      'Cancel',
    ]);

    act(() => getButtons(renderer)[2]?.props.onPress());
    expect(onDelete).toHaveBeenCalledOnce();
    renderer.unmount();
  });
});
