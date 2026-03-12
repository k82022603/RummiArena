import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getInfo', () => {
    it('서비스 정보를 반환해야 한다', () => {
      const info = appController.getInfo();
      expect(info.name).toBe('RummiArena AI Adapter');
      expect(info.version).toBeDefined();
      expect(info.description).toBeDefined();
    });
  });
});
