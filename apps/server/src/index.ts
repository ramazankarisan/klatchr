import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * Server entrypoint: a standalone Nest application context (no HTTP platform —
 * the only surface is the WebSocket gateway, which boots on `onApplicationBootstrap`
 * and closes on shutdown). Rooms live in this process's memory and are discarded
 * when empty (the no-persistence rule).
 */
export async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  // Last resort, installed only once the server is up — a failed boot (a taken port)
  // must still crash with a non-zero exit so the supervisor sees it. After that, every
  // room lives in this process, so a stray throw must not end them all: log it and
  // keep serving. The socket wiring already guards each message; this catches what
  // slips past (a timer callback, a library).
  process.on('uncaughtException', (error) => console.error('[klatchr] uncaught', error));
  process.on('unhandledRejection', (error) => console.error('[klatchr] unhandled', error));
}

await bootstrap();
