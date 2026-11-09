import * as THREE from 'three';

/**
 * Низкополигональный Олень-монстр по референсу: двуногое худое тело,
 * огромные белые глаза с чёрными зрачками, распахнутая пасть, ветвистые рога,
 * длинные руки с когтями и длинные ноги с копытами.
 *
 * Геометрия оригинальная, собрана кодом по точным координатам.
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

const FUR = 0x5d3620;
const FUR_DARK = 0x3f2417;
const CLAW = 0x141110;
const HORN = 0x201a17;
const EYE_WHITE = 0xf7f3e8;
const PUPIL = 0x090909;
const MOUTH = 0x1d0a0b;
const TONGUE = 0xb2555a;

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

function sphere(r: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Цилиндр между двумя точками — так рога и конечности собираются точно. */
function bone(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, color: number): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, 6);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

/** Ветвистый рог: основной стержень и отростки вперёд-вверх. */
function buildAntler(sign: number): THREE.Group {
  const g = new THREE.Group();
  // Координаты локальные для головы: рога растут от её верха.
  const base = new THREE.Vector3(sign * 0.13, 0.34, 0.0);
  const mid = new THREE.Vector3(sign * 0.3, 0.74, -0.05);
  const top = new THREE.Vector3(sign * 0.44, 1.18, -0.12);
  g.add(bone(base, mid, 0.07, 0.05, HORN));
  g.add(bone(mid, top, 0.05, 0.028, HORN));

  const tines: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(sign * 0.18, 0.46, 0.04), new THREE.Vector3(sign * 0.5, 0.7, 0.38)],
    [new THREE.Vector3(sign * 0.25, 0.64, 0.0), new THREE.Vector3(sign * 0.72, 0.9, 0.16)],
    [new THREE.Vector3(sign * 0.32, 0.84, -0.03), new THREE.Vector3(sign * 0.8, 1.08, -0.08)],
    [new THREE.Vector3(sign * 0.39, 1.02, -0.07), new THREE.Vector3(sign * 0.66, 1.32, -0.24)],
    [new THREE.Vector3(sign * 0.42, 1.12, -0.09), new THREE.Vector3(sign * 0.32, 1.42, -0.32)],
  ];
  for (const [from, to] of tines) {
    g.add(bone(from, to, 0.045, 0.018, HORN));
  }
  return g;
}

export function buildDeerMonster(): DeerParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Ноги: бедро от таза вниз, голень, копыто. Стойка прямая.
  const legs: DeerLimb[] = [];
  for (const sign of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sign * 0.22, 1.62, 0.02);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.82, 6), mat(FUR));
    thigh.position.y = -0.41;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.82;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.68, 6), mat(FUR_DARK));
    shin.position.y = -0.34;
    shin.castShadow = true;
    knee.add(shin);
    // Копыто из двух половинок.
    knee.add(box(0.13, 0.16, 0.26, CLAW, -0.05, -0.72, 0.06));
    knee.add(box(0.13, 0.16, 0.26, CLAW, 0.05, -0.72, 0.06));

    hip.add(knee);
    body.add(hip);
    legs.push({ upper: hip, lower: knee });
  }

  // Таз и торс: узкая талия, широкий корпус, лёгкая сутулость.
  body.add(box(0.62, 0.5, 0.5, FUR, 0, 1.72, 0));
  const torso = box(0.72, 0.78, 0.52, FUR, 0, 2.24, 0.02);
  torso.rotation.x = 0.1;
  body.add(torso);
  body.add(box(0.86, 0.56, 0.58, FUR, 0, 2.66, 0.04));
  // Клочья шерсти на груди и плечах.
  body.add(box(0.5, 0.28, 0.12, FUR_DARK, 0, 2.6, 0.34));

  // Руки: плечо, предплечье, три когтя.
  const arms: DeerLimb[] = [];
  for (const sign of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sign * 0.5, 2.7, 0.04);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.95, 6), mat(FUR));
    upper.position.y = -0.47;
    upper.rotation.z = sign * 0.12;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.95;
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.9, 6), mat(FUR_DARK));
    fore.position.y = -0.45;
    fore.castShadow = true;
    elbow.add(fore);
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 5), mat(CLAW));
      claw.position.set((i - 1) * 0.09, -1.02, 0.04);
      claw.rotation.x = Math.PI * 0.94;
      claw.rotation.z = (i - 1) * 0.22;
      elbow.add(claw);
    }
    shoulder.add(elbow);
    body.add(shoulder);
    arms.push({ upper: shoulder, lower: elbow });
  }

  // Шея и голова. Голова крупная относительно тела.
  const neck = new THREE.Group();
  neck.position.set(0, 2.88, 0.1);
  neck.rotation.x = 0.3;
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.5, 6), mat(FUR));
  neckMesh.position.y = 0.25;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.12);
  neck.add(head);

  // Череп и морда.
  head.add(box(0.52, 0.5, 0.52, FUR, 0, 0.1, 0));
  head.add(box(0.36, 0.3, 0.42, FUR_DARK, 0, -0.06, 0.34));
  // Тёмная пасть и язык.
  head.add(box(0.3, 0.24, 0.34, MOUTH, 0, -0.08, 0.42));
  head.add(box(0.16, 0.04, 0.24, TONGUE, 0, -0.16, 0.4));

  // Нижняя челюсть на шарнире — открывается в атаке.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.16);
  jaw.add(box(0.32, 0.12, 0.5, FUR_DARK, 0, -0.06, 0.22));
  jaw.add(box(0.26, 0.05, 0.42, MOUTH, 0, 0.0, 0.22));
  head.add(jaw);

  // Огромные белые глаза навыкате с чёрными зрачками.
  for (const sign of [-1, 1]) {
    const eye = sphere(0.17, EYE_WHITE, sign * 0.2, 0.18, 0.24);
    head.add(eye);
    const pupil = sphere(0.085, PUPIL, sign * 0.21, 0.17, 0.38);
    head.add(pupil);
  }

  // Уши.
  const ears: THREE.Object3D[] = [];
  for (const sign of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 4), mat(FUR_DARK));
    ear.position.set(sign * 0.3, 0.4, 0.02);
    ear.rotation.z = sign * 1.0;
    head.add(ear);
    ears.push(ear);
  }

  head.add(buildAntler(-1));
  head.add(buildAntler(1));

  body.add(neck);
  return { root, body, head, jaw, legs, arms, ears };
}

export type DeerAnimState = 'idle' | 'walk' | 'chase' | 'attack' | 'flee';

/** Процедурная анимация: шаг, погоня, выпад, испуг. */
export function animateDeerMonster(parts: DeerParts, time: number, speed: number, state: DeerAnimState): void {
  const moving = Math.min(1, speed / 3);
  const fast = state === 'chase' || state === 'flee';
  const freq = fast ? 9.5 : 5.5;
  const swing = Math.sin(time * freq) * (fast ? 0.8 : 0.45) * Math.max(0.12, moving);

  parts.legs.forEach((leg, i) => {
    const phase = i === 0 ? swing : -swing;
    leg.upper.rotation.x = phase;
    leg.lower.rotation.x = Math.max(0, -phase) * 1.2;
  });

  parts.arms.forEach((arm, i) => {
    const phase = i === 0 ? -swing : swing;
    arm.upper.rotation.x = state === 'attack' ? -1.4 : phase * 0.8;
    arm.lower.rotation.x = state === 'attack' ? -0.7 : -0.2 - Math.abs(phase) * 0.25;
  });

  parts.body.position.y = Math.abs(Math.sin(time * freq)) * 0.045 * moving;
  parts.body.rotation.x = fast ? 0.14 : 0.04;
  parts.body.rotation.z = Math.sin(time * freq * 0.5) * 0.025 * moving;

  parts.head.rotation.x = state === 'attack' ? -0.5 : Math.sin(time * 1.4) * 0.06;
  parts.head.rotation.y = state === 'idle' ? Math.sin(time * 0.6) * 0.3 : 0;

  // Пасть: приоткрыта в погоне, распахнута в атаке.
  parts.jaw.rotation.x = state === 'attack' ? 0.8 : (state === 'chase' ? 0.22 : 0) + Math.max(0, Math.sin(time * 1.8)) * 0.1;

  const earBack = state === 'flee' ? -0.9 : 0;
  parts.ears.forEach((ear) => {
    ear.rotation.x = earBack;
  });
}
