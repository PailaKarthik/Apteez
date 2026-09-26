import { Global, Module } from '@nestjs/common';
import { AppLogger } from './logger/app-logger';
import { RateLimitMonitor } from './throttle/rate-limit-monitor';

/**
 * Global shared providers: logger (every other provider can inject it) plus
 * the 429 observability monitor (wired into the global exception filter and
 * the admin rate-limit endpoint).
 */
@Global()
@Module({
  providers: [AppLogger, RateLimitMonitor],
  exports: [AppLogger, RateLimitMonitor],
})
export class CommonModule {}
