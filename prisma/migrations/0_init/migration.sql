-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "userId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyFeeFen" INTEGER NOT NULL DEFAULT 0,
    "smsIncluded" INTEGER NOT NULL DEFAULT 0,
    "unitPriceFen" INTEGER NOT NULL DEFAULT 5,
    "maxUsers" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "planId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "currentPeriodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" DATETIME,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "type" TEXT NOT NULL DEFAULT 'sms',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCostFen" INTEGER NOT NULL DEFAULT 5,
    "totalCostFen" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "amountFen" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issuedAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "userId" TEXT,
    "amountFen" INTEGER NOT NULL,
    "smsQuantity" INTEGER NOT NULL,
    "planCode" TEXT,
    "provider" TEXT NOT NULL,
    "tradeNo" TEXT,
    "outTradeNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payUrl" TEXT,
    "rawResponse" TEXT,
    "paidAt" DATETIME,
    "failReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SendJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "campaignId" TEXT NOT NULL,
    "phase" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MessageAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "recipientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'started',
    "requestJson" TEXT,
    "responseJson" TEXT,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageAttempt_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "mobile" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "eventTypes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OutboundEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "name" TEXT,
    "mobile" TEXT NOT NULL,
    "province" TEXT,
    "carrier" TEXT,
    "isBlacklist" BOOLEAN NOT NULL DEFAULT false,
    "consentSource" TEXT,
    "consentAt" DATETIME,
    "unsubscribedAt" DATETIME,
    "videoCapable" TEXT,
    "vars" TEXT,
    "checkStatus" TEXT NOT NULL DEFAULT 'pending',
    "batchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CustomerBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "name" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "valid" INTEGER NOT NULL DEFAULT 0,
    "checkStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "landingUrl" TEXT,
    "reportStatus" TEXT NOT NULL DEFAULT 'draft',
    "reportSubmittedAt" DATETIME,
    "reportReviewedAt" DATETIME,
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "code" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "trackId" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text_sms',
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "complianceStatus" TEXT NOT NULL DEFAULT 'pending',
    "blockedReason" TEXT,
    "scheduledAt" DATETIME,
    "total" INTEGER NOT NULL DEFAULT 0,
    "valid" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "quietHours" BOOLEAN NOT NULL DEFAULT true,
    "autoRollout" BOOLEAN NOT NULL DEFAULT false,
    "testRatio" INTEGER NOT NULL DEFAULT 20,
    "rolledOut" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SmsTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT,
    "variantId" TEXT,
    "mobile" TEXT NOT NULL,
    "extno" TEXT NOT NULL,
    "sendStatus" TEXT NOT NULL DEFAULT 'pending',
    "deliveryStatus" TEXT,
    "failReason" TEXT,
    "phase" TEXT NOT NULL DEFAULT 'test',
    "intentTag" TEXT,
    "followStatus" TEXT NOT NULL DEFAULT 'new',
    "dealValue" REAL,
    "followNote" TEXT,
    "followedAt" DATETIME,
    "assignedTo" TEXT,
    "nextFollowAt" DATETIME,
    "followResult" TEXT,
    "visited" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Recipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Recipient_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CampaignVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "recipientId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "actor" TEXT NOT NULL DEFAULT '运营',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowLog_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'A',
    "templateId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CampaignVariant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignVariant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SmsTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryReport_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MoMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "recipientId" TEXT,
    "mobile" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "matchedAttr" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SegmentPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "name" TEXT NOT NULL,
    "batchId" TEXT,
    "provinces" TEXT,
    "carriers" TEXT,
    "onlyIntent" BOOLEAN NOT NULL DEFAULT false,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "AppUser_tenantId_role_idx" ON "AppUser"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_tenantId_email_key" ON "AppUser"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "AppSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AppSession_tenantId_expiresAt_idx" ON "AppSession"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CreditLedger_tenantId_createdAt_idx" ON "CreditLedger"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_tenantId_refType_refId_idx" ON "CreditLedger"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_createdAt_idx" ON "UsageRecord"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_tenantId_type_refType_refId_key" ON "UsageRecord"("tenantId", "type", "refType", "refId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_outTradeNo_key" ON "PaymentOrder"("outTradeNo");

-- CreateIndex
CREATE INDEX "PaymentOrder_tenantId_status_idx" ON "PaymentOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_provider_status_idx" ON "PaymentOrder"("provider", "status");

-- CreateIndex
CREATE INDEX "SendJob_tenantId_campaignId_idx" ON "SendJob"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "SendJob_tenantId_status_idx" ON "SendJob"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageAttempt_idempotencyKey_key" ON "MessageAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MessageAttempt_tenantId_recipientId_idx" ON "MessageAttempt"("tenantId", "recipientId");

-- CreateIndex
CREATE INDEX "MessageAttempt_tenantId_status_idx" ON "MessageAttempt"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Suppression_tenantId_reason_idx" ON "Suppression"("tenantId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_tenantId_mobile_key" ON "Suppression"("tenantId", "mobile");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_status_idx" ON "WebhookEndpoint"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OutboundEvent_tenantId_status_createdAt_idx" ON "OutboundEvent"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_mobile_idx" ON "Customer"("mobile");

-- CreateIndex
CREATE INDEX "Customer_tenantId_mobile_idx" ON "Customer"("tenantId", "mobile");

-- CreateIndex
CREATE INDEX "SmsTemplate_tenantId_reportStatus_idx" ON "SmsTemplate"("tenantId", "reportStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE INDEX "ShortLink_tenantId_trackId_idx" ON "ShortLink"("tenantId", "trackId");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_status_idx" ON "Campaign"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_extno_key" ON "Recipient"("extno");

-- CreateIndex
CREATE INDEX "Recipient_campaignId_idx" ON "Recipient"("campaignId");

-- CreateIndex
CREATE INDEX "Recipient_tenantId_mobile_idx" ON "Recipient"("tenantId", "mobile");

-- CreateIndex
CREATE INDEX "Recipient_followStatus_idx" ON "Recipient"("followStatus");

-- CreateIndex
CREATE INDEX "Recipient_intentTag_followStatus_idx" ON "Recipient"("intentTag", "followStatus");

-- CreateIndex
CREATE INDEX "Recipient_tenantId_intentTag_followStatus_idx" ON "Recipient"("tenantId", "intentTag", "followStatus");

-- CreateIndex
CREATE INDEX "FollowLog_recipientId_createdAt_idx" ON "FollowLog"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowLog_tenantId_createdAt_idx" ON "FollowLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowLog_createdAt_idx" ON "FollowLog"("createdAt");

-- CreateIndex
CREATE INDEX "CampaignVariant_campaignId_idx" ON "CampaignVariant"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignVariant_tenantId_campaignId_idx" ON "CampaignVariant"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "DeliveryReport_tenantId_reportedAt_idx" ON "DeliveryReport"("tenantId", "reportedAt");

-- CreateIndex
CREATE INDEX "MoMessage_recipientId_receivedAt_idx" ON "MoMessage"("recipientId", "receivedAt");

-- CreateIndex
CREATE INDEX "MoMessage_tenantId_mobile_receivedAt_idx" ON "MoMessage"("tenantId", "mobile", "receivedAt");

-- CreateIndex
CREATE INDEX "SegmentPreset_tenantId_createdAt_idx" ON "SegmentPreset"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SegmentPreset_createdAt_idx" ON "SegmentPreset"("createdAt");

