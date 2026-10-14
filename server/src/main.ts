import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      process.env.CLIENT_URL ?? 'http://localhost:5173',
      'http://localhost:4173',
      'http://127.0.0.1:5173',
    ],
    credentials: true,
  });
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 3001);
}

await bootstrap();
