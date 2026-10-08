'use client';

import { FolderPlus, Heart, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import type { FavoriteProblemDto } from '@apteez/types';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@apteez/ui';
import { ProblemList } from '@/components/problems/problem-list';
import {
  useCollectionProblems,
  useCreateCollection,
  useDeleteCollection,
  useFavoriteCollections,
  useFavoriteProblems,
  useRenameCollection,
} from '@/hooks/use-favorites';

const DEFAULT_TAB = 'favorites';

function FavoriteProblemList({
  problems,
  isPending,
  isError,
  onRetry,
}: {
  problems: FavoriteProblemDto[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <ProblemList
      problems={problems}
      isPending={isPending}
      isError={isError}
      hasNextPage={false}
      isFetchingNextPage={false}
      onRetry={onRetry}
      onLoadMore={() => undefined}
    />
  );
}

function CollectionPanel({ collectionId }: { collectionId: string }): React.JSX.Element {
  const query = useCollectionProblems(collectionId);
  const problems = query.data?.items ?? [];

  if (query.isPending) {
    return (
      <div className="animate-fade-in space-y-2" aria-busy="true" aria-label="Loading collection">
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3" aria-hidden>
            <div className="skeleton-shine size-9 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton-shine h-4 w-2/5 rounded-md" />
              <div className="skeleton-shine h-3 w-3/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState title="Could not load this collection" onRetry={() => void query.refetch()} />
    );
  }
  if (problems.length === 0) {
    return (
      <EmptyState
        title="Add problems to this collection"
        description="Use the Add to collection menu on any problem to build this set."
      />
    );
  }
  return (
    <FavoriteProblemList
      problems={problems}
      isPending={false}
      isError={false}
      onRetry={() => void query.refetch()}
    />
  );
}

/**
 * Favorites + custom collections workspace. Collections are a normal data set
 * with system rules (default Favorites is immutable); every list here is
 * server-backed and paginated.
 */
export function FavoritesWorkspace(): React.JSX.Element {
  const collections = useFavoriteCollections();
  const favorites = useFavoriteProblems({ limit: 24 });
  const create = useCreateCollection();
  const rename = useRenameCollection();
  const remove = useDeleteCollection();
  const [tab, setTab] = React.useState(DEFAULT_TAB);
  const [newName, setNewName] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');

  const customCollections = (collections.data ?? []).filter((item) => !item.isDefault);

  const onCreate = (): void => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    create.mutate(trimmed, {
      onSuccess: () => {
        setNewName('');
        toast.success('Collection created');
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : 'Could not create collection.'),
    });
  };

  const onRename = (id: string): void => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      return;
    }
    rename.mutate(
      { id, name: trimmed },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success('Collection renamed');
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : 'Could not rename collection.'),
      },
    );
  };

  const onDelete = (id: string, name: string): void => {
    remove.mutate(id, {
      onSuccess: () => {
        if (tab === id) {
          setTab(DEFAULT_TAB);
        }
        toast.success(`Deleted “${name}”`);
      },
      onError: () => toast.error('Could not delete collection.'),
    });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="glass sticky top-top-bar z-10 h-auto flex-wrap py-1.5 shadow-sm">
        <TabsTrigger value={DEFAULT_TAB} className="gap-1.5">
          <Heart aria-hidden className="fill-primary/20 text-primary" />
          Favorites
        </TabsTrigger>
        {customCollections.map((collection) => (
          <TabsTrigger key={collection.id} value={collection.id} className="gap-1.5">
            {collection.name}
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-metric text-xs font-bold text-primary">
              {collection.problemCount}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div>
          <TabsContent value={DEFAULT_TAB} className="mt-0">
            {favorites.isPending ? (
              <FavoriteProblemList
                problems={[]}
                isPending
                isError={false}
                onRetry={() => void favorites.refetch()}
              />
            ) : favorites.isError ? (
              <ErrorState
                title="Could not load favorites"
                onRetry={() => void favorites.refetch()}
              />
            ) : (favorites.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={Heart}
                title="No favorites yet"
                description="Save problems you want to revisit."
              />
            ) : (
              <FavoriteProblemList
                problems={favorites.data?.items ?? []}
                isPending={false}
                isError={false}
                onRetry={() => void favorites.refetch()}
              />
            )}
          </TabsContent>
          {customCollections.map((collection) => (
            <TabsContent key={collection.id} value={collection.id} className="mt-0">
              <CollectionPanel collectionId={collection.id} />
            </TabsContent>
          ))}
        </div>

        <Card className="glass h-fit shadow-sm">
          <CardContent className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="icon-tile size-7" aria-hidden>
                <FolderPlus className="size-3.5" />
              </span>
              Collections
            </p>
            <div className="flex gap-1.5">
              <Input
                value={newName}
                placeholder="New collection"
                aria-label="New collection name"
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onCreate();
                  }
                }}
              />
              <Button
                size="sm"
                onClick={onCreate}
                disabled={create.isPending}
                className="btn-sheen shrink-0 shadow-md shadow-primary/20"
              >
                {create.isPending ? <span className="typing-dots">Adding</span> : 'Add'}
              </Button>
            </div>
            <ul className="space-y-1">
              {customCollections.length === 0 ? (
                <li className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Create a collection to organize your practice.
                </li>
              ) : (
                customCollections.map((collection) => (
                  <li
                    key={collection.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl border border-border px-2 py-1.5 transition-all duration-200 hover:border-primary/40 hover:shadow-sm',
                      tab === collection.id && 'border-primary/50 bg-primary/[0.06] shadow-[0_0_16px_-6px_hsl(var(--primary)/0.4)]',
                    )}
                  >
                    {editingId === collection.id ? (
                      <>
                        <Input
                          value={editingName}
                          aria-label="Rename collection"
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              onRename(collection.id);
                            }
                          }}
                        />
                        <Button size="sm" onClick={() => onRename(collection.id)}>
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="flex-1 truncate text-left text-sm text-foreground"
                          onClick={() => setTab(collection.id)}
                        >
                          {collection.name}
                          <span className="font-metric ml-1.5 text-xs text-muted-foreground">
                            {collection.problemCount}
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Rename ${collection.name}`}
                          onClick={() => {
                            setEditingId(collection.id);
                            setEditingName(collection.name);
                          }}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${collection.name}`}
                          onClick={() => onDelete(collection.id, collection.name)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </>
                    )}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </Tabs>
  );
}
