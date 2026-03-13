import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { MoveModule } from './move/move.module';

/**
 * RummiArena AI Adapter 루트 모듈.
 *
 * ConfigModule.forRoot()를 통해 .env 파일에서 환경변수를 로드한다.
 * isGlobal: true로 설정하여 모든 모듈에서 ConfigService를 별도 import 없이 사용 가능하다.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // .env 파일이 없어도 에러 없이 진행 (환경변수로 주입 가능)
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    HealthModule,
    MoveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
