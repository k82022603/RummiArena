import { Module } from '@nestjs/common';
import { CharacterService } from './character.service';

/**
 * AI 캐릭터 시스템 모듈.
 *
 * 6개 캐릭터 × 3 난이도 × 심리전 Level 0~3 프롬프트 생성을 담당한다.
 * CharacterService를 export하여 다른 모듈에서 주입 가능하게 한다.
 */
@Module({
  providers: [CharacterService],
  exports: [CharacterService],
})
export class CharacterModule {}
