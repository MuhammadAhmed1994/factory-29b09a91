import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config, configureApp } from './app.config';

// Written by the factory: the api boots AppModule from ./app.module, with the shared setup in
// configureApp (also used by the e2e tests). Feature modules are registered in app.module.ts.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(config.port);
}

void bootstrap();
