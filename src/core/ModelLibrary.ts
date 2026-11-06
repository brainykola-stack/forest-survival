import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export interface ModelEntry {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  source: string;
  license: string;
}

export interface ModelInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  play: (name: string, fade?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

/**
 * Загрузчик внешних GLB-моделей. Пока грузятся — игра работает на процедурных
 * примитивах, после загрузки новые объекты берут готовую модель.
 */
export class ModelLibrary {
  private entries = new Map<string, ModelEntry>();
  private failed = new Set<string>();
  private pending: Promise<void> | null = null;

  get loaded(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): ModelEntry | null {
    return this.entries.get(key) ?? null;
  }

  /** Загружает все модели один раз. Ошибки не ломают игру. */
  loadAll(): Promise<void> {
    if (this.pending) return this.pending;
    const base = import.meta.env.BASE_URL;
    const jobs: Array<[string, string]> = [
      ['stag', `${base}assets/models/Stag.glb`],
      ['deer', `${base}assets/models/Deer.glb`],
      ['wolf', `${base}assets/models/Wolf.glb`],
      ['fox', `${base}assets/models/Fox.glb`],
      ['bull', `${base}assets/models/Bull.glb`],
      ['axe', `${base}assets/models/Axe_tool.glb`],
      ['torch', `${base}assets/models/Torch_item.glb`],
      ['shotgun', `${base}assets/models/Shotgun.glb`],
      ['knife', `${base}assets/models/Knife_tool.glb`],
    ];
    this.pending = Promise.all(
      jobs.map(async ([key, url]) => {
        try {
          const gltf = await new GLTFLoader().loadAsync(url);
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          this.entries.set(key, {
            scene: gltf.scene,
            animations: gltf.animations,
            source: 'Quaternius — Ultimate Animated Animal Pack',
            license: 'CC0 1.0',
          });
        } catch (err) {
          this.failed.add(key);
          console.warn('model load failed:', key, err);
        }
      }),
    ).then(() => undefined);
    return this.pending;
  }

  /**
   * Клон модели с готовым микшером анимаций.
   * mode 'height' — нормировать по высоте (животные, ставятся на землю),
   * mode 'longest' — по самой длинной оси (предметы в руках).
   */
  create(key: string, target: number, mode: 'height' | 'longest' = 'height'): ModelInstance | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    const root = cloneSkinned(entry.scene) as THREE.Group;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
      // Скелет выходит за границы bind-позы — иначе модель может пропадать.
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });

    // Нормализация размера. Для скелетных моделей Box3.setFromObject врёт
    // (меши отмасштабированы скином), поэтому меряем по костям.
    root.updateMatrixWorld(true);
    const before = measureHeight(root);
    const scale =
      mode === 'longest'
        ? (before.maxDim > 0.0001 ? target / before.maxDim : 1)
        : (before.height > 0.0001 ? target / before.height : 1);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);

    if (mode === 'height') {
      // Разворачиваем модель так, чтобы голова смотрела в +Z — это «вперёд» игры.
      const head = findHead(root);
      if (head) {
        const hp = head.getWorldPosition(new THREE.Vector3());
        const centerZ = before.centerZ * scale;
        if (hp.z < centerZ) root.rotation.y = Math.PI;
        root.updateMatrixWorld(true);
      }

      const after = measureHeight(root);
      root.position.y -= after.minY;
    } else {
      // Предмет в руке: центрируем, чтобы он вращался вокруг своей середины.
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      root.position.sub(center);
    }

    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of entry.animations) {
      actions.set(shortName(clip.name), mixer.clipAction(clip));
    }
    let current = '';

    const play = (name: string, fade = 0.22): void => {
      if (name === current) return;
      const next = actions.get(name);
      if (!next) return;
      const prev = current ? actions.get(current) : undefined;
      next.reset().setEffectiveWeight(1).fadeIn(fade).play();
      if (prev && prev !== next) prev.fadeOut(fade);
      current = name;
    };

    return {
      root,
      mixer,
      play,
      update: (dt: number) => mixer.update(dt),
      dispose: () => {
        // Геометрия и материалы общие с шаблоном: их нельзя уничтожать,
        // иначе следующая копия модели окажется пустой.
        mixer.stopAllAction();
        root.removeFromParent();
      },
    };
  }

  failedKeys(): string[] {
    return [...this.failed];
  }
}

/** "AnimalArmature|Attack_Headbutt" → "Attack_Headbutt" */
function shortName(clipName: string): string {
  const i = clipName.lastIndexOf('|');
  return i >= 0 ? clipName.slice(i + 1) : clipName;
}

function findHead(root: THREE.Object3D): THREE.Object3D | null {
  let head: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!head && o.name && /^head$/i.test(o.name)) head = o;
  });
  if (head) return head;
  root.traverse((o) => {
    if (!head && o.name && /head/i.test(o.name)) head = o;
  });
  return head;
}

/** Высота и центр по костям (или по геометрии, если скелета нет). */
function measureHeight(root: THREE.Object3D): {
  height: number;
  minY: number;
  centerZ: number;
  maxDim: number;
} {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let bones = 0;
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) {
      box.expandByPoint(o.getWorldPosition(v));
      bones++;
    }
  });
  if (bones === 0) {
    box.setFromObject(root);
  }
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return {
    height: size.y,
    minY: box.min.y,
    centerZ: center.z,
    maxDim: Math.max(size.x, size.y, size.z),
  };
}

export const modelLibrary = new ModelLibrary();
