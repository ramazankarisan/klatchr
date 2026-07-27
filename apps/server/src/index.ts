import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * Server entrypoint: a standalone Nest application context (no HTTP platform —
 * the only surface is the WebSocket gateway, which boots on `onApplicationBootstrap`
 * and closes on shutdown). Rooms live in this process's memory and are discarded
 * when empty (rule 7).
 */
export async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
}

await bootstrap();
