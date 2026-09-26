import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/** Transactional email (Resend). Global: auth + notifications share it. */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
