import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

export function configureApp(app: import('@nestjs/common').INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(',') });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const doc = new DocumentBuilder().setTitle('Salon API').setDescription('Phần mềm quản lý salon tóc — SE100').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API: http://localhost:${port}/api  ·  Swagger: http://localhost:${port}/api/docs`);
}

if (require.main === module) bootstrap();
