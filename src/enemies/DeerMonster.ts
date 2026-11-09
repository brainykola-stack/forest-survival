import * as THREE from 'three';

/**
 * Низкополигональный Олень-монстр, собранный кодом по референсу:
 * огромные ветвистые рога, белые глаза с чёрными зрачками, распахнутая пасть,
 * коричневая шерсть, длинные руки с чёрными когтями и длинные ноги.
 * Модель оригинальная: повторяет силуэт и настроение, а не чужие файлы.
 */

export interface DeerLimb {
  upper: THREE.Group;
  lower: THREE.Group;
}

export interface DeerParts {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  legs: DeerLimb[];
  arms: DeerLimb[];
  ears: THREE.Object3D[];
}

const FUR = 0x5a3520;
const FUR_DARK = 0x41261a;
const CLAW = 0x141110;
const HORN = 0x211a16;
const EYE_WHITE = 0xf3efe4;
const PUPIL = 0x0a0a0a;
const MOUTH = 0x2a0f10;

function mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function limbSegment(len: number, radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius, len, 6), mat(color));
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  return mesh;
}

/** Ветвистые рога: три уровня отростков. */
function buildAntler(sign: number): THREE.Group {
  const hornMat = mat(HORN);
  const group = new THREE.Group();

  const addBranch = (parent: THREE.Object3D, len: number, radius: number, x: number, y: number, z: number, rx: number, rz: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius, len, 5), hornMat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const base = addBranch(group, 0.9, 0.09, sign * 0.12, 0.4, 0, 0.25, sign * 0.55);
  for (let i = 0; i < 3; i++) {
    addBranch(base, 0.75 - i * 0.12, 0.06, sign * (0.25 + i * 0.1), 0.35 + i * 0.05, 0, -0.2 + i * 0.25, sign * (0.9 + i * 0.12));
    addBranch(base, 0.6 - i * 0.1, 0.05, sign * (0.1 + i * 0.12), 0.5 - i * 0.1, 0.1 + i * 0.08, 0.5, sign * 0.5);
  }
  addBranch(group, 0.55, 0.06, sign * 0.35, 0.75, 0.25, 0.6, sign * 0.9);
  return group;
}

export function buildDeerMonster(): DeerParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Корпус: вытянутый, с небольшим наклоном вперёд.
  const torso = box(0.95, 1.25, 1.5, FUR, 0, 2.35, 0);
  torso.rotation.x = 0.12;
  body.add(torso);
  body.add(box(1.1, 0.9, 1.0, FUR_DARK, 0, 1.75, 0.05));

  // Ноги: бедро — колено — копыто.
  const legs: DeerLimb[] = [];
  for (const sign of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sign * 0.35, 1.8, 0.1);
    const thigh = limbSegment(1.0, 0.17, FUR);
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -1.0;
    const shin = limbSegment(0.95, 0.11, FUR_DARK);
    knee.add(shin);
    const hoof = box(0.26, 0.18, 0.42, CLAW, 0, -1.02, 0.1);
    knee.add(hoof);
    hip.add(knee);

    body.add(hip);
    legs.push({ upper: hip, lower: knee });
  }

  // Руки: длинные, с когтями.
  const arms: DeerLimb[] = [];
  for (const sign of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sign * 0.62, 2.75, 0.1);
    shoulder.rotation.z = sign * 0.22;
    const upper = limbSegment(1.05, 0.12, FUR);
    upper.rotation.z = sign * 0.15;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -1.05;
    const fore = limbSegment(0.95, 0.09, FUR_DARK);
    elbow.add(fore);
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.42, 5), mat(CLAW));
      claw.position.set((i - 1) * 0.11, -1.0, 0.02);
      claw.rotation.x = Math.PI * 0.92;
      claw.rotation.z = (i - 1) * 0.18;
      elbow.add(claw);
    }
    shoulder.add(elbow);
    body.add(shoulder);
    arms.push({ upper: shoulder, lower: elbow });
  }

  // Шея и голова.
  const neck = new THREE.Group();
  neck.position.set(0, 2.95, 0.15);
  neck.rotation.x = 0.35;
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.95, 6), mat(FUR));
  neckMesh.position.y = 0.45;
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 1.0;
  neck.add(head);

  const skull = box(0.72, 0.66, 0.82, FUR, 0, 0.1, 0.05);
  head.add(skull);
  // Вытянутая морда и тёмная пасть.
  head.add(box(0.5, 0.34, 0.62, FUR_DARK, 0, -0.08, 0.5));
  head.add(box(0.42, 0.34, 0.5, MOUTH, 0, -0.24, 0.52));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.3, 0.3);
  const jawMesh = box(0.42, 0.16, 0.55, FUR_DARK, 0, -0.05, 0.25);
  jaw.add(jawMesh);
  head.add(jaw);

  // Огромные белые глаза с чёрными зрачками.
  for (const sign of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(EYE_WHITE));
    eye.position.set(sign * 0.24, 0.2, 0.42);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(PUPIL));
    pupil.position.set(sign * 0.26, 0.19, 0.58);
    head.add(pupil);
  }

  // Уши.
  const ears: THREE.Object3D[] = [];
  for (const sign of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 4), mat(FUR_DARK));
    ear.position.set(sign * 0.38, 0.52, 0.05);
    ear.rotation.z = sign * 0.7;
    head.add(ear);
    ears.push(ear);
  }

  // Рога.
  head.add(buildAntler(-1));
  head.add(buildAntler(1));

  body.add(neck);
  root.position.y = 0;

  return { root, body, head, jaw, legs, arms, ears };
}

export type DeerAnimState = 'idle' | 'walk' | 'chase' | 'attack' | 'flee';

/** Процедурная анимация: шаг, погоня, выпад, испуг. */
export function animateDeerMonster(parts: DeerParts, time: number, speed: number, state: DeerAnimState): void {
  const moving = Math.min(1, speed / 3);
  const fast = state === 'chase' || state === 'flee';
  const freq = fast ? 9.5 : 5.5;
  const swing = Math.sin(time * freq) * (fast ? 0.85 : 0.5) * Math.max(0.15, moving);

  parts.legs.forEach((leg, i) => {
    const phase = i === 0 ? swing : -swing;
    leg.upper.rotation.x = phase;
    leg.lower.rotation.x = Math.max(0, -phase) * 1.1;
  });

  parts.arms.forEach((arm, i) => {
    const phase = i === 0 ? -swing : swing;
    arm.upper.rotation.x = state === 'attack' ? -1.5 : phase * 0.7;
    arm.lower.rotation.x = state === 'attack' ? -0.9 : -0.25 - Math.abs(phase) * 0.3;
  });

  // Корпус: покачивание и наклон при погоне.
  parts.body.position.y = Math.abs(Math.sin(time * freq)) * 0.05 * moving;
  parts.body.rotation.x = fast ? 0.16 : 0.05;
  parts.body.rotation.z = Math.sin(time * freq * 0.5) * 0.03 * moving;

  // Голова: осматривается в покое, тянется вперёд в атаке.
  parts.head.rotation.x = state === 'attack' ? -0.55 : Math.sin(time * 1.4) * 0.08;
  parts.head.rotation.y = state === 'idle' ? Math.sin(time * 0.6) * 0.35 : 0;

  // Пасть распахивается в атаке и при погоне.
  parts.jaw.rotation.x = state === 'attack' ? 0.75 : Math.max(0, Math.sin(time * 2.2)) * 0.2 + (state === 'chase' ? 0.25 : 0);

  // Уши прижимаются от света.
  const earBack = state === 'flee' ? -0.8 : 0;
  parts.ears.forEach((ear) => {
    ear.rotation.x = earBack;
  });
}
