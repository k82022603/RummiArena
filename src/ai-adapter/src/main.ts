import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // class-validator를 전역 파이프로 등록
  // whitelist: DTO에 정의되지 않은 필드는 자동 제거
  // forbidNonWhitelisted: 허용되지 않은 필드가 있으면 400 에러
  // transform: 요청 데이터를 DTO 클래스 인스턴스로 자동 변환
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 글로벌 예외 필터: 모든 에러 응답을 통일된 형식으로 변환
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // CORS 설정 (Game Server에서 호출하므로 내부 서비스간 통신)
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:8080',
    ],
    methods: ['GET', 'POST'],
  });

  const port = process.env.PORT ?? 8081;
  await app.listen(port);
  console.log(`AI Adapter Service running on port ${port}`);
}

bootstrap();
