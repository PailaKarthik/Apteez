import { Injectable } from '@nestjs/common';
import type {
  ProblemAssetDto,
  ProblemDetailDto,
  ProblemOptionDto,
  ProblemSummaryDto,
} from '@apteez/types';
import { StorageService } from '../../storage/storage.service';

export interface ProblemStats {
  attemptCount: number;
  correctCount: number;
  solvedCount: number;
  hasExplanation: boolean;
  hasShortcut: boolean;
}

export interface ProblemUserState {
  solvedIds: Set<string>;
  favoritedIds: Set<string>;
}

export interface ProblemRefRow {
  name: string;
  slug: string;
}

export interface ProblemListRow {
  id: string;
  title: string;
  contentMode: ProblemSummaryDto['contentMode'];
  difficulty: ProblemSummaryDto['difficulty'];
  rating: number;
  createdAt: Date;
  publishedAt: Date | null;
  category: ProblemRefRow;
  topic: ProblemRefRow | null;
  subtopic: ProblemRefRow | null;
  exams: Array<{ examTag: ProblemRefRow }>;
  _count: { options: number };
}

export interface ProblemDetailRow extends ProblemListRow {
  statement: string | null;
  explanation: string | null;
  shortcut: string | null;
  source: string | null;
  sourceYear: number | null;
  assets: Array<{
    id: string;
    kind: ProblemAssetDto['kind'];
    objectKey: string;
    mimeType: string;
    position: number;
    altText: string | null;
  }>;
  options: Array<{
    id: string;
    position: number;
    text: string | null;
    assetKey: string | null;
  }>;
}

/**
 * Maps Prisma rows to public DTOs. Correct answers are never selected by the
 * query layer and never exist on these shapes, so a leak requires changing
 * both the query and this mapper.
 */
@Injectable()
export class ProblemMapper {
  constructor(private readonly storage: StorageService) {}

  accuracyOf(stats: ProblemStats): number | null {
    if (stats.attemptCount === 0) {
      return null;
    }
    return Math.round((stats.correctCount / stats.attemptCount) * 100);
  }

  async toSummary(
    row: ProblemListRow,
    stats: ProblemStats,
    userState?: ProblemUserState,
  ): Promise<ProblemSummaryDto> {
    return {
      id: row.id,
      title: row.title,
      contentMode: row.contentMode,
      difficulty: row.difficulty,
      rating: Math.round(row.rating),
      category: row.category,
      topic: row.topic,
      subtopic: row.subtopic,
      examTags: row.exams.map((exam) => exam.examTag),
      optionCount: row._count.options,
      hasImage: row.contentMode !== 'TEXT_ONLY',
      hasExplanation: stats.hasExplanation,
      hasShortcut: stats.hasShortcut,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      accuracy: this.accuracyOf(stats),
      solvedCount: stats.solvedCount,
      ...(userState
        ? {
            isSolved: userState.solvedIds.has(row.id),
            isFavorited: userState.favoritedIds.has(row.id),
          }
        : {}),
    };
  }

  async toDetail(
    row: ProblemDetailRow,
    stats: ProblemStats,
    userState?: ProblemUserState,
  ): Promise<ProblemDetailDto> {
    const summary = await this.toSummary(row, stats, userState);
    // Asset URLs must never fail the whole detail read: after a deploy the
    // storage backend/region/keys can lag behind the DB, and a single bad
    // object key previously 500'd the entire image-based problem. Resolve
    // best-effort — missing URLs render as '' and the UI shows a retryable
    // placeholder instead of "Could not load this problem".
    let urlByKey = new Map<string, string>();
    try {
      urlByKey = await this.storage.getDownloadUrls([
        ...row.assets.map((asset) => asset.objectKey),
        ...row.options.flatMap((option) => (option.assetKey ? [option.assetKey] : [])),
      ]);
    } catch {
      urlByKey = new Map<string, string>();
    }

    const assets: ProblemAssetDto[] = row.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      url: urlByKey.get(asset.objectKey) ?? '',
      mimeType: asset.mimeType,
      position: asset.position,
      altText: asset.altText,
    }));

    const options: ProblemOptionDto[] = row.options.map((option) => ({
      id: option.id,
      position: option.position,
      text: option.text,
      assetUrl: option.assetKey ? (urlByKey.get(option.assetKey) ?? null) : null,
    }));

    return {
      ...summary,
      statement: row.statement,
      assets,
      options,
      source: row.source,
      sourceYear: row.sourceYear,
    };
  }
}
