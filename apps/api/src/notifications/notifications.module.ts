import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsService } from './notifications.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { ReminderScheduler } from './reminder.scheduler';

/**
 * Web Push + email-fallback notifications and the hourly planner reminder loop.
 * `ScheduleModule.forRoot()` is registered once in AppModule so the `@Cron`
 * decorator on ReminderScheduler is picked up.
 */
@Module({
  imports: [EmailModule],
  controllers: [PushController],
  providers: [PushService, NotificationsService, ReminderScheduler],
  exports: [PushService, NotificationsService],
})
export class NotificationsModule {}
