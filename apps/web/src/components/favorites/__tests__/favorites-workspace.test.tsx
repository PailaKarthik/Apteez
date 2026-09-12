import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FavoritesWorkspace } from '../favorites-workspace';

const mocks = vi.hoisted(() => ({
  collections: { data: undefined as unknown, isPending: false, isError: false },
  favorites: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
  collectionProblems: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  create: { mutate: vi.fn(), isPending: false },
  rename: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/hooks/use-favorites', () => ({
  useFavoriteCollections: () => mocks.collections,
  useFavoriteProblems: () => mocks.favorites,
  useCollectionProblems: () => mocks.collectionProblems,
  useCreateCollection: () => mocks.create,
  useRenameCollection: () => mocks.rename,
  useDeleteCollection: () => mocks.remove,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.collections.data = undefined;
  mocks.favorites.data = undefined;
});

function collection(id: string, name: string, problemCount = 0) {
  return {
    id,
    name,
    isDefault: false,
    problemCount,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const defaultCollection = {
  id: 'default-1',
  name: 'Favorites',
  isDefault: true,
  problemCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('FavoritesWorkspace', () => {
  it('shows both empty states when nothing is saved', () => {
    mocks.collections.data = [defaultCollection];
    mocks.favorites.data = { items: [], hasNextPage: false, nextCursor: null };
    render(<FavoritesWorkspace />);
    expect(screen.getByText('No favorites yet')).toBeDefined();
    expect(screen.getByText('Save problems you want to revisit.')).toBeDefined();
    expect(screen.getByText('Create a collection to organize your practice.')).toBeDefined();
  });

  it('lists custom collections with rename and delete affordances', () => {
    mocks.collections.data = [defaultCollection, collection('c1', 'Quant Practice', 3)];
    mocks.favorites.data = { items: [], hasNextPage: false, nextCursor: null };
    render(<FavoritesWorkspace />);
    expect(screen.getByRole('button', { name: 'Rename Quant Practice' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Delete Quant Practice' })).toBeDefined();
    expect(screen.getAllByText('Quant Practice').length).toBeGreaterThan(0);
  });

  it('creates a collection from the sidebar', () => {
    mocks.collections.data = [defaultCollection];
    mocks.favorites.data = { items: [], hasNextPage: false, nextCursor: null };
    render(<FavoritesWorkspace />);
    fireEvent.change(screen.getByLabelText('New collection name'), {
      target: { value: ' Hard Set ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(mocks.create.mutate).toHaveBeenCalledWith('Hard Set', expect.anything());
  });

  it('renames a collection through the inline editor', () => {
    mocks.collections.data = [defaultCollection, collection('c1', 'Quant Practice')];
    mocks.favorites.data = { items: [], hasNextPage: false, nextCursor: null };
    render(<FavoritesWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Quant Practice' }));
    fireEvent.change(screen.getByLabelText('Rename collection'), {
      target: { value: 'Quant Revision' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.rename.mutate).toHaveBeenCalledWith(
      { id: 'c1', name: 'Quant Revision' },
      expect.anything(),
    );
  });

  it('deletes a collection', () => {
    mocks.collections.data = [defaultCollection, collection('c1', 'Quant Practice')];
    mocks.favorites.data = { items: [], hasNextPage: false, nextCursor: null };
    render(<FavoritesWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Quant Practice' }));
    expect(mocks.remove.mutate).toHaveBeenCalledWith('c1', expect.anything());
  });

  it('never offers rename or delete for the default collection', () => {
    mocks.collections.data = [defaultCollection];
    mocks.favorites.data = { items: [], hasNextPage: false, nextCursor: null };
    render(<FavoritesWorkspace />);
    expect(screen.queryByRole('button', { name: 'Rename Favorites' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Favorites' })).toBeNull();
  });
});
