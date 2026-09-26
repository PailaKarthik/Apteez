import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ContributionController } from './contribution.controller';
import { ContributionPrecheckService } from './contribution-precheck.service';
import { ContributionService } from './contribution.service';

/**
 * Contributor-owned lifecycle: submit, list mine, owner-safe detail, plus
 * the deterministic precheck (shared with the admin review flow).
 * Approval/rejection/publication live in AdminModule (human authority);
 * this module never publishes or exposes staff notes.
 */
@Module({
  imports: [AiModule],
  controllers: [ContributionController],
  providers: [ContributionService, ContributionPrecheckService],
  exports: [ContributionService, ContributionPrecheckService],
})
export class ContributionModule {}
