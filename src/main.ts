import './styles.css';
import { Engine } from './core/Engine';
import { GameRenderPipeline } from './render/RenderPipeline';
import { Arena } from './world/Arena';
import { RagdollDummy } from './actors/RagdollDummy';
import { PlayerWeaponController } from './weapons/PlayerWeapon';
import { LocationalDamageManager } from './combat/LocationalDamageManager';
import { GoreSystem } from './gore/GoreSystem';
import { HUD } from './ui/HUD';
import { installTestHarness } from './debug/TestHarness';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;

  const engine = await Engine.create(canvas);
  const hud = new HUD(engine, uiRoot);

  const pipeline = new GameRenderPipeline(engine);
  const arena = new Arena(engine);
  await arena.build();
  await pipeline.init();
  engine.setPipeline(pipeline);

  const dummy = new RagdollDummy(engine, { position: arena.dummySpawn, facing: arena.dummyFacing });
  engine.addSystem(dummy, 10);

  const player = new PlayerWeaponController(engine, { spawn: arena.playerSpawn, lookAt: arena.dummySpawn });
  engine.addSystem(player, 0);

  const damage = new LocationalDamageManager(engine, [dummy]);
  engine.addSystem(damage, 20);

  const gore = new GoreSystem(engine);
  await gore.init();
  engine.addSystem(gore, 30);

  engine.addSystem(hud, 100);

  // Global debug keys.
  engine.addSystem({
    update: () => {
      if (engine.input.wasPressed('KeyR')) {
        dummy.reset();
        player.reset();
      }
    },
  }, -10);

  installTestHarness({ engine, arena, dummy, player, damage, gore, hud, pipeline });

  canvas.addEventListener('click', () => engine.input.requestPointerLock());
  hud.setLoaded();
  engine.events.emit('log', { text: 'Arena ready — click to engage', level: 'system' });
  engine.start();
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
