import { Module } from '@nestjs/common';
import { ProblemsController } from './problems.controller';
import { ProblemMapper } from './problem-mapper';
import { ProblemsService } from './problems.service';

@Module({
  controllers: [ProblemsController],
  providers: [ProblemsService, ProblemMapper],
  exports: [ProblemsService, ProblemMapper],
})
export class ProblemsModule {}
