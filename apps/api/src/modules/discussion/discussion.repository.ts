import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';

/**
 * Persistence boundary for discussions. Counter recomputation lives in the
 * service because it must run inside the same transaction as the write;
 * this repository holds the read-side queries that do not mutate state.
 */
@Injectable()
export class DiscussionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Visible (non-deleted) reply count for a post. */
  async visibleReplyCount(postId: string): Promise<number> {
    return this.prisma.discussionReply.count({
      where: { postId, deletedAt: null },
    });
  }

  /** How many open reports a post currently has (moderation queue signal). */
  async openReportCount(postId: string): Promise<number> {
    return this.prisma.discussionReport.count({
      where: { postId, status: 'OPEN' },
    });
  }
}
