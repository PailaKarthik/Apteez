import { Global, Module } from '@nestjs/common';
import { AppLogger } from './logger/app-logger';

/** Global shared providers: logger (every other provider can inject it). */
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class CommonModule {}
