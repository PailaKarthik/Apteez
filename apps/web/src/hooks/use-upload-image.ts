'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface UploadedImage {
  key: string;
  url: string;
  contentType: string;
  size: number;
}

export const ACCEPTED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Client-side precheck mirroring POST /storage/uploads (server re-verifies). */
export function describeImageProblem(file: File): string | null {
  if (!ACCEPTED_IMAGE_MIMES.includes(file.type)) {
    return 'Only JPEG, PNG, WebP, GIF and AVIF images are supported.';
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return 'Pick an image up to 5 MB.';
  }
  return null;
}

/** Upload one question/option image; resolves to the storage key + render URL. */
export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadedImage> => {
      const form = new FormData();
      form.append('file', file, file.name);
      return apiFetch<UploadedImage>('/storage/uploads', {
        method: 'POST',
        body: form,
        timeoutMs: 60_000,
      });
    },
  });
}
