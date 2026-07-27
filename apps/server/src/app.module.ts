import { Module } from '@nestjs/common';
import { SocketGateway } from './gateway.js';

/** The one module: it provides the WebSocket gateway, nothing else (rule: server is thin). */
@Module({ providers: [SocketGateway] })
export class AppModule {}
