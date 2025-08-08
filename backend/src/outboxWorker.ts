import { PrismaClient } from '@prisma/client';
import mqtt from 'mqtt';

const MQTT_BROKER = process.env.MQTT_BROKER || 'localhost';
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

const prisma = new PrismaClient();
const client = mqtt.connect(`mqtt://${MQTT_BROKER}`);

async function publishMessage(topic: string, payload: any): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function processOutbox() {
  while (true) {
    const pending = await prisma.outbox.findMany({
      where: {
        sentAt: null,
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    for (const msg of pending) {
      try {
        await publishMessage(msg.topic, msg.payload);
        await prisma.outbox.update({
          where: { id: msg.id },
          data: { sentAt: new Date() },
        });
      } catch (err) {
        const retry = msg.retryCount + 1;
        const delay = Math.min(MAX_DELAY_MS, Math.pow(2, retry) * BASE_DELAY_MS);
        await prisma.outbox.update({
          where: { id: msg.id },
          data: {
            retryCount: retry,
            nextAttemptAt: new Date(Date.now() + delay),
          },
        });
        console.error(`Failed to publish message ${msg.id}`, err);
      }
    }

    await new Promise((res) => setTimeout(res, 1000));
  }
}

processOutbox().catch((e) => {
  console.error(e);
  process.exit(1);
});
