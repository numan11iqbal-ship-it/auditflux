CREATE TABLE `audit_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditRunId` int NOT NULL,
	`category` varchar(64) NOT NULL,
	`passCount` int NOT NULL DEFAULT 0,
	`warnCount` int NOT NULL DEFAULT 0,
	`failCount` int NOT NULL DEFAULT 0,
	`naCount` int NOT NULL DEFAULT 0,
	`score` int,
	CONSTRAINT `audit_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`overallScore` int,
	`passCount` int NOT NULL DEFAULT 0,
	`warnCount` int NOT NULL DEFAULT 0,
	`failCount` int NOT NULL DEFAULT 0,
	`naCount` int NOT NULL DEFAULT 0,
	`dataSourcesJson` text NOT NULL,
	`sanitizedPayloadJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`primaryUrl` varchar(2048) NOT NULL,
	`urlsJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`backendProxyUrl` varchar(2048),
	`entitlementTier` enum('Free','Pro','Enterprise') NOT NULL DEFAULT 'Free',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_settings_userId_unique` UNIQUE(`userId`)
);
