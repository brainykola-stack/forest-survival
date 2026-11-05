import * as THREE from 'three';
import { TIME } from '../core/Config';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 groundColor;
  uniform float offset;
  varying vec3 vDir;
  void main() {
    float h = normalize(vDir).y;
    vec3 sky = mix(horizonColor, topColor, smoothstep(0.0, 0.55, h));
    vec3 col = mix(sky, groundColor, smoothstep(0.0, -0.25, h));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export type DayPhase = 'day' | 'night';

/** Цикл суток: небо, солнце, луна, звёзды, туман и плавные переходы. */
export class DayNight {
  phase: DayPhase = 'day';
  time = 0; // секунды внутри текущей фазы
  nightLevel = 0;
  cycleIndex = 0;

  private sky: THREE.Mesh;
  private skyUniforms: {
    topColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
    groundColor: { value: THREE.Color };
    offset: { value: number };
  };
  private sun: THREE.DirectionalLight;
  private moon: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private stars: THREE.Points;
  private moonMesh: THREE.Mesh;
  private sunMesh: THREE.Mesh;
  private clouds: THREE.Mesh[] = [];
  private fog: THREE.FogExp2;

  private dayLen: number;
  private nightLen: number;
  private speed = 1;
  /** Множитель длительности ночи: особые ночи длятся дольше. */
  private nightScale = 1;

  constructor(
    private scene: THREE.Scene,
    private nightSecondsPerNight = 1,
  ) {
    this.dayLen = TIME.daySeconds;
    this.nightLen = TIME.nightSeconds;
    void this.nightSecondsPerNight;

    this.fog = new THREE.FogExp2(0x8fa48b, 0.012);
    scene.fog = this.fog;

    const uniforms = {
      topColor: { value: new THREE.Color(0x5f86ad) },
      horizonColor: { value: new THREE.Color(0xb9c7b0) },
      groundColor: { value: new THREE.Color(0x2a3326) },
      offset: { value: 0 },
    };
    this.skyUniforms = uniforms;
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 24, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.name = 'sky';
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9fb6e0, 0.0);
    scene.add(this.moon);
    scene.add(this.moon.target);

    this.hemi = new THREE.HemisphereLight(0xbcd2c0, 0x2c3326, 0.55);
    scene.add(this.hemi);

    // Звёзды
    const starGeo = new THREE.BufferGeometry();
    const count = 1400;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(520);
      if (v.y < 10) v.y = Math.abs(v.y) + 10;
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.8, transparent: true, opacity: 0, sizeAttenuation: true, fog: false }),
    );
    this.stars.name = 'stars';
    scene.add(this.stars);

    // Луна
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(11, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xd8e4ff, fog: false }),
    );
    this.moonMesh.name = 'moon';
    scene.add(this.moonMesh);

    // Солнце — видимый диск, чтобы день ощущался днём.
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(16, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false, transparent: true, opacity: 0.95 }),
    );
    this.sunMesh.name = 'sun';
    scene.add(this.sunMesh);

    // Облака: плоские мягкие формы, медленно плывут по небу.
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xdde4e9,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat.clone());
      const angle = (i / 9) * Math.PI * 2 + Math.random();
      const radius = 120 + Math.random() * 140;
      cloud.position.set(Math.cos(angle) * radius, 95 + Math.random() * 45, Math.sin(angle) * radius);
      cloud.scale.set(34 + Math.random() * 30, 7 + Math.random() * 4, 22 + Math.random() * 18);
      cloud.rotation.y = Math.random() * Math.PI;
      this.clouds.push(cloud);
      scene.add(cloud);
    }
  }

  get isNight(): boolean {
    return this.phase === 'night';
  }

  get phaseLength(): number {
    return this.phase === 'day' ? this.dayLen : this.nightLen * this.nightScale;
  }

  setNightScale(scale: number): void {
    this.nightScale = Math.max(0.5, Math.min(3, scale));
  }

  get phaseProgress(): number {
    return this.time / this.phaseLength;
  }

  setSpeed(mult: number): void {
    this.speed = Math.max(0.1, mult);
  }

  /** Пропустить остаток текущей фазы (отладка/тест). */
  skipPhase(): void {
    this.time = this.phaseLength - 0.01;
  }

  /** Восстановить время из сохранения. */
  setTime(phase: DayPhase, time: number): void {
    this.phase = phase;
    this.time = Math.max(0, Math.min(this.phaseLength - 1, time));
    this.applyVisuals();
  }

  private advancePhase(): void {
    if (this.phase === 'day') {
      this.phase = 'night';
      this.time = 0;
      this.cycleIndex++;
    } else {
      this.phase = 'day';
      this.time = 0;
      this.cycleIndex++;
    }
  }

  update(dt: number): { justBecameNight: boolean; justBecameDay: boolean } {
    let justBecameNight = false;
    let justBecameDay = false;
    this.time += dt * this.speed;
    while (this.time >= this.phaseLength) {
      this.time -= this.phaseLength;
      const wasDay = this.phase === 'day';
      this.advancePhase();
      if (wasDay) justBecameNight = true;
      else justBecameDay = true;
    }

    const dusk = TIME.duskSeconds;
    const dawn = TIME.dawnSeconds;
    let level: number;
    if (this.phase === 'day') {
      const left = this.dayLen - this.time;
      level = left < dusk ? 1 - left / dusk : 0;
      level = Math.max(0, Math.min(1, level));
    } else {
      const left = this.nightLen - this.time;
      level = left < dawn ? left / dawn : 1;
      level = Math.max(0, Math.min(1, level));
    }
    this.nightLevel = level;

    // Облака плывут независимо от времени суток.
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 1.4;
      if (cloud.position.x > 330) cloud.position.x = -330;
    }

    this.applyVisuals();
    return { justBecameNight, justBecameDay };
  }

  private applyVisuals(): void {
    const n = this.nightLevel;
    const duskFactor = n * (1 - n) * 4; // максимум на границе

    const dayTop = new THREE.Color(0x6a93bd);
    const nightTop = new THREE.Color(0x04060d);
    const dayHorizon = new THREE.Color(0xc2cfb8);
    const nightHorizon = new THREE.Color(0x0d1620);
    const duskColor = new THREE.Color(0xb9702f);

    const top = dayTop.clone().lerp(nightTop, n);
    const horizon = dayHorizon.clone().lerp(nightHorizon, n).lerp(duskColor, duskFactor * 0.5);
    const ground = new THREE.Color(0x2a3326).lerp(new THREE.Color(0x080b09), n);

    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.horizonColor.value.copy(horizon);
    this.skyUniforms.groundColor.value.copy(ground);

    this.fog.color.copy(horizon).multiplyScalar(0.85);
    this.fog.density = 0.009 + n * 0.016;

    this.sun.intensity = (1 - n) * 2.3;
    this.sun.color.setRGB(1.0, 0.94 - n * 0.25, 0.82 - n * 0.2);
    this.moon.intensity = n * 0.55;
    this.hemi.intensity = 0.6 - n * 0.42;
    this.hemi.color.setRGB(0.72 - n * 0.4, 0.82 - n * 0.45, 0.75 - n * 0.2);

    // Положение солнца и луны по дуге
    const dayT = this.phase === 'day' ? this.time / this.dayLen : 1;
    const sunAngle = Math.PI * Math.min(1, dayT);
    const sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle), 0.35).normalize();
    this.sun.position.copy(sunDir).multiplyScalar(120);
    this.sun.target.position.set(0, 0, 0);

    const nightT = this.phase === 'night' ? this.time / this.nightLen : 0;
    const moonAngle = Math.PI * nightT;
    const moonDir = new THREE.Vector3(Math.cos(moonAngle), Math.sin(moonAngle) * 0.8 + 0.15, -0.3).normalize();
    this.moon.position.copy(moonDir).multiplyScalar(120);
    this.moon.target.position.set(0, 0, 0);

    // Солнце: тот же диск, что и луна, но днём.
    this.sunMesh.position.copy(sunDir).multiplyScalar(430);
    (this.sunMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - n * 1.5);
    this.sunMesh.visible = n < 0.78;

    for (const cloud of this.clouds) {
      (cloud.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - n * 0.85);
    }

    this.moonMesh.position.copy(moonDir).multiplyScalar(420);
    (this.moonMesh.material as THREE.MeshBasicMaterial).opacity = 1;
    this.moonMesh.visible = n > 0.05;

    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, n * 1.1 - 0.1);
  }

  /** Часы для HUD: 06:00 — рассвет, 21:00 — ночь. */
  clockLabel(): string {
    const dayProgress = this.phase === 'day' ? this.time / this.dayLen : 1 + this.time / this.nightLen;
    const hours = 6 + dayProgress * 18; // 06:00 → 24:00
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Направление на ключевой источник света для бликов. */
  keyDirection(): THREE.Vector3 {
    return this.sun.position.clone().normalize();
  }

  dispose(): void {
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.moonMesh.geometry.dispose();
    (this.moonMesh.material as THREE.Material).dispose();
    for (const cloud of this.clouds) {
      cloud.geometry.dispose();
      (cloud.material as THREE.Material).dispose();
      this.scene.remove(cloud);
    }
    this.clouds = [];
    this.sunMesh.geometry.dispose();
    (this.sunMesh.material as THREE.Material).dispose();
    this.scene.remove(this.sky, this.stars, this.moonMesh, this.sunMesh, this.sun, this.moon, this.hemi, this.sun.target, this.moon.target);
  }
}
