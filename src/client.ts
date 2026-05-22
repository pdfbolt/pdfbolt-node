import { DirectResource } from './resources/direct.js';
import { AsyncConversionsResource } from './resources/async.js';
import { SyncResource } from './resources/sync.js';
import { UsageResource } from './resources/usage.js';
import { PDFBoltHttpClient } from './http.js';
import { webhooks, Webhooks } from './webhooks.js';
import type { PDFBoltClientOptions } from './types.js';

export class PDFBolt {
  static readonly webhooks: Webhooks = webhooks;

  readonly direct: DirectResource;
  readonly sync: SyncResource;
  readonly asyncConversions: AsyncConversionsResource;
  readonly usage: UsageResource;

  constructor(options: PDFBoltClientOptions) {
    const http = new PDFBoltHttpClient(options);

    this.direct = new DirectResource(http);
    this.sync = new SyncResource(http);
    this.asyncConversions = new AsyncConversionsResource(http);
    this.usage = new UsageResource(http);
  }
}
