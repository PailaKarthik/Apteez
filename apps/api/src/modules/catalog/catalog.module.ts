import { Module } from '@nestjs/common';
import { ProblemsModule } from '../problems/problems.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [ProblemsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
