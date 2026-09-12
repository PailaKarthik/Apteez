import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectionPicker } from '../collection-picker';

const pickerMock = vi.hoisted(() => ({
  collections: { data: undefined as unknown, isPending: false },
  membership: { data: undefined as unknown },
  add: { mutateAsync: vi.fn(async () => ({ added: true })) },
  remove: { mutateAsync: vi.fn(async () => ({ removed: true })) },
  create: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/hooks/use-favorites', () => ({
  useFavoriteCollections: () => pickerMock.collections,
  useFavoriteMembership: () => pickerMock.membership,
  useAddToCollection: () => pickerMock.add,
  useRemoveFromCollection: () => pickerMock.remove,
  useCreateCollection: () => pickerMock.create,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@apteez/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const ReactImpl = await import('react');
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    ReactImpl.createElement(ReactImpl.Fragment, null, children);
  const Item = ({
    children,
    onSelect,
    disabled,
  }: {
    children?: ReactNode;
    onSelect?: (event: { preventDefault: () => void }) => void;
    disabled?: boolean;
  }) =>
    ReactImpl.createElement(
      'button',
      {
        type: 'button',
        disabled,
        onClick: onSelect ? () => onSelect({ preventDefault: () => undefined }) : undefined,
      },
      children,
    );
  return {
    ...actual,
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuLabel: Passthrough,
    DropdownMenuSeparator: () => ReactImpl.createElement('hr'),
    DropdownMenuItem: Item,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pickerMock.collections.data = undefined;
  pickerMock.membership.data = undefined;
});

function collection(id: string, name: string) {
  return {
    id,
    name,
    isDefault: false,
    problemCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('CollectionPicker', () => {
  it('lists Favorites plus the caller custom collections', () => {
    pickerMock.collections.data = [collection('c1', 'Quant Practice')];
    pickerMock.membership.data = [{ problemId: 'p1', collectionIds: [], isFavorited: false }];
    render(<CollectionPicker problemId="p1" />);
    expect(screen.getByText('Favorites')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Quant Practice' })).toBeDefined();
  });

  it('adds the problem to a collection it is not yet in', () => {
    pickerMock.collections.data = [collection('c1', 'Quant Practice')];
    pickerMock.membership.data = [{ problemId: 'p1', collectionIds: [], isFavorited: false }];
    render(<CollectionPicker problemId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Quant Practice' }));
    expect(pickerMock.add.mutateAsync).toHaveBeenCalledWith({
      collectionId: 'c1',
      problemId: 'p1',
    });
  });

  it('removes the problem from a collection it already belongs to', () => {
    pickerMock.collections.data = [collection('c1', 'Quant Practice')];
    pickerMock.membership.data = [{ problemId: 'p1', collectionIds: ['c1'], isFavorited: true }];
    render(<CollectionPicker problemId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Quant Practice' }));
    expect(pickerMock.remove.mutateAsync).toHaveBeenCalledWith({
      collectionId: 'c1',
      problemId: 'p1',
    });
  });

  it('creates a new collection from the picker', () => {
    pickerMock.collections.data = [];
    pickerMock.membership.data = [{ problemId: 'p1', collectionIds: [], isFavorited: false }];
    render(<CollectionPicker problemId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'New collection' }));
    fireEvent.change(screen.getByLabelText('New collection name'), {
      target: { value: 'Hard Set' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(pickerMock.create.mutate).toHaveBeenCalledWith('Hard Set', expect.anything());
  });
});
