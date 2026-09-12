import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AppLogger } from '../../common/logger/app-logger';
import { CHALLENGE_JOBS, CHALLENGE_QUEUE } from '../../queue/queue.constants';
import { RatingService } from '../rating/rating.service';
import { ChallengeLiveStateService } from './challenge-live-state.service';
import { ChallengeService } from './challenge.service';
import { MatchmakingService } from './matchmaking.service';

interface ChallengeJobData {
  challengeId?: string;
}

@Processor(CHALLENGE_QUEUE)
export class ChallengeProcessor extends WorkerHost {
  constructor(
    private readonly challenges: ChallengeService,
    private readonly matchmaking: MatchmakingService,
    private readonly liveState: ChallengeLiveStateService,
    private readonly ratings: RatingService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<ChallengeJobData>): Promise<void> {
    switch (job.name) {
      case CHALLENGE_JOBS.activate:
        await this.handleActivate(job);
        return;
      case CHALLENGE_JOBS.expire:
        await this.handleExpire(job);
        return;
      case CHALLENGE_JOBS.matchmakingSweep:
        await this.handleMatchmakingSweep();
        return;
      case CHALLENGE_JOBS.liveStateCleanup:
        await this.handleLiveStateCleanup();
        return;
      case CHALLENGE_JOBS.ratingUpdate:
        await this.handleRatingUpdate(job);
        return;
      default:
        this.logger.warn(`challenge.job.unknown name=${job.name}`, 'Challenge');
    }
  }

  private async handleActivate(job: Job<ChallengeJobData>): Promise<void> {
    const challengeId = job.data.challengeId;
    if (!challengeId) {
      return;
    }
    try {
      const challenge = await this.challenges.loadChallenge(challengeId);
      await this.challenges.syncStatus(challenge);
    } catch (error) {
      this.warn(`activate id=${challengeId}`, error);
    }
  }

  private async handleExpire(job: Job<ChallengeJobData>): Promise<void> {
    const challengeId = job.data.challengeId;
    if (!challengeId) {
      return;
    }
    try {
      await this.challenges.finalizeOnce(challengeId, 'TIMER_EXPIRED');
      await this.liveState.clearChallengeState(challengeId);
    } catch (error) {
      this.warn(`expire id=${challengeId}`, error);
    }
  }

  private async handleMatchmakingSweep(): Promise<void> {
    try {
      await this.matchmaking.sweepStale();
    } catch (error) {
      this.warn('matchmaking-sweep', error);
    }
  }

  private async handleLiveStateCleanup(): Promise<void> {
    try {
      await this.liveState.sweepExpired();
    } catch (error) {
      this.warn('live-state-cleanup', error);
    }
  }

  private async handleRatingUpdate(job: Job<ChallengeJobData>): Promise<void> {
    const challengeId = job.data.challengeId;
    if (!challengeId) {
      return;
    }
    // Rating failures are surfaced to BullMQ so it retries with backoff; the
    // challenge itself stays permanently finalized regardless.
    await this.ratings.processChallenge(challengeId);
  }

  private warn(context: string, error: unknown): void {
    this.logger.warn(
      `challenge.job.${context} ${error instanceof Error ? error.message : String(error)}`,
      'Challenge',
    );
  }
}
