'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProfileDto } from '@apteez/types';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import { useAvatarUpload, useUpdateProfile } from '@/hooks/use-profile';

export function ProfileHeader({ profile }: { profile: ProfileDto }): React.JSX.Element {
  const initial = (profile.displayName ?? 'A').trim().charAt(0).toUpperCase() || 'A';
  const update = useUpdateProfile();
  const avatar = useAvatarUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    displayName: profile.displayName,
    username: profile.username ?? '',
    bio: profile.bio ?? '',
    country: profile.country ?? '',
    institution: profile.institution ?? '',
    timezone: profile.timezone ?? '',
    isPrivate: profile.isPrivate,
  });

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSave = (): void => {
    update.mutate(
      {
        displayName: form.displayName.trim(),
        ...(form.username.trim() ? { username: form.username.trim() } : {}),
        bio: form.bio,
        country: form.country,
        institution: form.institution,
        timezone: form.timezone,
        isPrivate: form.isPrivate,
      },
      {
        onSuccess: () => {
          toast.success('Profile updated.');
          setOpen(false);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Could not update profile.'),
      },
    );
  };

  const onAvatar = (file: File | undefined): void => {
    if (!file) {
      return;
    }
    avatar.mutate(file, {
      onSuccess: () => toast.success('Avatar updated.'),
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Upload failed.'),
    });
  };

  return (
    <Card className="animate-fade-up overflow-hidden">
      <span className="block h-1.5 bg-gradient-to-r from-primary via-accent-foreground to-primary" aria-hidden />
      <CardContent className="relative flex flex-col gap-4 overflow-hidden p-6 sm:flex-row sm:items-center">
        <div className="aurora-field" aria-hidden>
          <span className="aurora-orb -left-16 top-[-80%] size-56 bg-primary/15" />
          <span className="aurora-orb right-[20%] top-[-60%] size-48 bg-primary/10 [animation-delay:-6s]" />
        </div>
        <div className="relative flex flex-col items-center gap-2">
          <span className="rounded-full bg-gradient-to-br from-primary to-accent-foreground p-[3px] shadow-lg shadow-primary/30" aria-hidden>
            <Avatar className="size-16 border-2 border-card">
              {profile.avatarUrl ? (
                <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/60 text-xl font-extrabold text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              onAvatar(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={avatar.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {avatar.isPending ? 'Uploading…' : 'Change photo'}
          </Button>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="gradient-text text-2xl font-extrabold">{profile.displayName}</CardTitle>
            {profile.isPrivate ? <Badge variant="outline">Private</Badge> : null}
          </div>
          <CardDescription className="mt-1">
            {profile.username ? `@${profile.username}` : 'No username yet'}
            {profile.institution ? ` · ${profile.institution}` : ''}
            {profile.country ? ` · ${profile.country}` : ''}
          </CardDescription>
          {profile.bio ? <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p> : null}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="relative shrink-0 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/15">
              Edit profile
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-display">Display name</Label>
                <Input
                  id="profile-display"
                  value={form.displayName}
                  onChange={(e) => set('displayName')(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-username">Username</Label>
                <Input
                  id="profile-username"
                  value={form.username}
                  onChange={(e) => set('username')(e.target.value)}
                  maxLength={30}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-bio">Bio</Label>
                <Textarea
                  id="profile-bio"
                  value={form.bio}
                  onChange={(e) => set('bio')(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-country">Country</Label>
                  <Input
                    id="profile-country"
                    value={form.country}
                    onChange={(e) => set('country')(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-institution">University</Label>
                  <Input
                    id="profile-institution"
                    value={form.institution}
                    onChange={(e) => set('institution')(e.target.value)}
                    maxLength={160}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-timezone">Timezone (IANA, e.g. Asia/Kolkata)</Label>
                <Input
                  id="profile-timezone"
                  value={form.timezone}
                  onChange={(e) => set('timezone')(e.target.value)}
                  placeholder="UTC"
                  maxLength={80}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPrivate}
                  onChange={(e) => set('isPrivate')(e.target.checked)}
                />
                Private profile (only you can view it)
              </label>
              <Button
                className="btn-sheen w-full"
                disabled={update.isPending}
                onClick={onSave}
              >
                {update.isPending ? <span className="typing-dots">Saving</span> : 'Save changes'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
