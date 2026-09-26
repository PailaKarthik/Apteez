import { Module } from '@nestjs/common';
import { ProblemsModule } from '../problems/problems.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SimilarProblemService } from './similar-problem.service';

/**
 * Lexical search + discovery plus live RAG retrieval. ProblemsService
 * supplies hydration; nothing here duplicates problem listing logic.
 * SimilarProblemService runs pgvector retrieval with metadata filtering
 * and reranking, falling back to lexical bands when vectors are missing.
 */
@Module({
  imports: [ProblemsModule],
  controllers: [SearchController],
  providers: [SearchService, SimilarProblemService],
  exports: [SearchService, SimilarProblemService],
})
export class SearchModule {}
