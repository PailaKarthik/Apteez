import { Module } from '@nestjs/common';

/**
 * Boundary for user-contributed questions. The lifecycle
 * contribution → review → approval → question library is implemented in a
 * later prompt on top of the statuses shared in `@apteez/types`.
 */
@Module({})
export class ContributionModule {}
