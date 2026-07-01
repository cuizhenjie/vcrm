import { db } from "./db";
import { currentTenantId } from "./tenant";

export async function emitOutboundEvent(type: string, payload: unknown, tenantId = currentTenantId()) {
  return db.outboundEvent.create({
    data: {
      tenantId,
      type,
      payloadJson: JSON.stringify(payload),
      status: "pending",
    },
  });
}

