import { defineScheduled } from 'void';
import { env } from 'void/env';
import { createRelayApi } from '../src/server/relay';
import { cleanupExpiredRelays } from '../src/server/services/cleanup';

export const cron = '0 * * * *';

function secret(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
}

export default defineScheduled(async (controller) => {
  const relay = createRelayApi({
    accountId: secret('CF_ACCOUNT_ID', env.CF_ACCOUNT_ID),
    apiToken: secret('CF_API_TOKEN', env.CF_API_TOKEN),
  });
  await cleanupExpiredRelays(relay, controller.scheduledTime);
});
