-- Notify reviewers when a contribution is submitted (inbox fan-out target).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRIBUTION_SUBMITTED';
