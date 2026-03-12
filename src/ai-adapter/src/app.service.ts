import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo(): { name: string; version: string; description: string } {
    return {
      name: 'RummiArena AI Adapter',
      version: '0.0.1',
      description:
        'Multi-LLM adapter service for Rummikub game AI (OpenAI, Claude, DeepSeek, Ollama)',
    };
  }
}
