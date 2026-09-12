'use client';

import { Check, FolderPlus, Heart, Loader2, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@apteez/ui';
import {
  useAddToCollection,
  useCreateCollection,
  useFavoriteCollections,
  useFavoriteMembership,
  useRemoveFromCollection,
} from '@/hooks/use-favorites';

export interface CollectionPickerProps {
  problemId: string;
}

/**
 * Add-to-collection menu. Membership is fetched once for the problem (bulk
 * endpoint), so opening the menu never loads collection contents.
 */
export function CollectionPicker({ problemId }: CollectionPickerProps): React.JSX.Element {
  const collections = useFavoriteCollections();
  const membership = useFavoriteMembership([problemId]);
  const add = useAddToCollection();
  const remove = useRemoveFromCollection();
  const create = useCreateCollection();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');

  const memberships = membership.data?.[0]?.collectionIds ?? [];
  const isFavorited = membership.data?.[0]?.isFavorited ?? false;

  const toggleCollection = (collectionId: string, isMember: boolean): void => {
    const action = isMember
      ? remove.mutateAsync({ collectionId, problemId })
      : add.mutateAsync({ collectionId, problemId });
    void action
      .then(() => toast.success(isMember ? 'Removed from collection' : 'Added to collection'))
      .catch(() => toast.error('Could not update the collection.'));
  };

  const submitCreate = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    create.mutate(trimmed, {
      onSuccess: (collection) => {
        setName('');
        setCreating(false);
        void add
          .mutateAsync({ collectionId: collection.id, problemId })
          .then(() => toast.success(`Added to ${collection.name}`))
          .catch(() => toast.error('Created the collection but could not add the problem.'));
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : 'Could not create the collection.'),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Add to collection">
          <FolderPlus aria-hidden />
          Add to collection
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Save to</DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <Heart className={isFavorited ? 'fill-gold text-gold' : undefined} aria-hidden />
          Favorites
          {isFavorited ? <Check className="ml-auto" aria-hidden /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {collections.isPending ? (
          <DropdownMenuItem disabled>
            <Loader2 className="animate-spin" aria-hidden />
            Loading collections…
          </DropdownMenuItem>
        ) : (
          (collections.data ?? [])
            .filter((collection) => !collection.isDefault)
            .map((collection) => {
              const isMember = memberships.includes(collection.id);
              return (
                <DropdownMenuItem
                  key={collection.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    toggleCollection(collection.id, isMember);
                  }}
                >
                  {isMember ? <Check aria-hidden /> : <Plus aria-hidden />}
                  <span className="truncate">{collection.name}</span>
                </DropdownMenuItem>
              );
            })
        )}
        <DropdownMenuSeparator />
        {creating ? (
          <div className="flex items-center gap-1.5 p-1">
            <Input
              autoFocus
              value={name}
              placeholder="Collection name"
              aria-label="New collection name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitCreate();
                }
              }}
            />
            <Button size="sm" onClick={submitCreate} disabled={create.isPending}>
              Add
            </Button>
          </div>
        ) : (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setCreating(true);
            }}
          >
            <Plus aria-hidden />
            New collection
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
