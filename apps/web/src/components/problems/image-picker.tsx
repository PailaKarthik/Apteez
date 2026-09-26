'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import {
  describeImageProblem,
  useUploadImage,
  type UploadedImage,
} from '@/hooks/use-upload-image';

export interface ImagePickerProps {
  label: string;
  value: UploadedImage | null;
  onChange: (next: UploadedImage | null) => void;
  compact?: boolean;
}

/**
 * Single image attach: file → POST /storage/uploads → storage key + URL.
 * Parent forms send the key onward; URLs are never persisted anywhere.
 */
export function ImagePicker({ label, value, onChange, compact }: ImagePickerProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = useUploadImage();

  const onFile = (file: File | undefined): void => {
    if (!file) {
      return;
    }
    const problem = describeImageProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    upload.mutate(file, {
      onSuccess: (uploaded) => {
        onChange(uploaded);
        toast.success('Image attached.');
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Image upload failed.'),
    });
  };

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <span className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>{label}</span>
      {value ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- storage asset preview */}
          <img
            src={value.url}
            alt="Attached illustration preview"
            className="h-14 w-14 rounded-md border border-border object-cover"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              if (inputRef.current) {
                inputRef.current.value = '';
              }
            }}
          >
            Remove
          </Button>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="text-xs"
            aria-label={label}
            disabled={upload.isPending}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {upload.isPending ? (
            <p className="text-xs text-muted-foreground">Uploading…</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
