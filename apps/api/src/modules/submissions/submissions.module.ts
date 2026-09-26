import { Module } from '@nestjs/common';
import { ProblemsModule } from '../problems/problems.module';
import { RewardsModule } from '../rewards/rewards.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

/**
 * Practice attempts and submission history. The ProblemsModule supplies the
 * answer-free problem projection used to render results.
 */
@Module({
  imports: [ProblemsModule, RewardsModule],
  controllers: [PracticeController, SubmissionsController],
  providers: [PracticeService, SubmissionsService],
  exports: [PracticeService],
})
export class SubmissionsModule {}
