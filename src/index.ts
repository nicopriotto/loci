import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { LociSystem } from './app.js';
import { initDemo } from './demo.js';
import { mountStudio } from './studio/studio.js';

mountStudio();

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(LociSystem);
  initDemo(world.getSystem(LociSystem)!);
  if (import.meta.env.DEV) void import('./dev/performer.js').then((m) => m.installPerformer(world));
});
