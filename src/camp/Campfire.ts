import * as THREE from 'three';

/** Костёр: топливо, пламя, дым, свет и звук. */
export class Campfire {
  readonly group = new THREE.Group();
  fuel = 100;
  lit = true;
  readonly maxFuel = 100;
  readonly position: THREE.Vector3;

  private light: THREE.PointLight;
  private flame: THREE.Mesh;
  private flame2: THREE.Mesh;
  private embers: THREE.Points;
  private emberData: Float32Array;
  private emberLife: Float32Array;
  private smoke: THREE.Points;
  private smokeData: Float32Array;
  private time = 0;
  private crackleTimer = 0;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.position = position.clone();
    this.group.position.copy(position);
    scene.add(this.group);

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x62605a });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stoneMat);
      stone.position.set(Math.cos(a) * 1.05, 0.12, Math.sin(a) * 1.05);
      stone.rotation.set(Math.random(), Math.random(), Math.random());
      stone.castShadow = true;
      this.group.add(stone);
    }

    const logMat = new THREE.MeshLambertMaterial({ color: 0x3b2a1c });
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 5), logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI;
      log.position.y = 0.18 + i * 0.06;
      this.group.add(log);
    }

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.92 });
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.5, 7), flameMat);
    this.flame.position.y = 1.05;
    this.group.add(this.flame);

    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 });
    this.flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.0, 6), innerMat);
    this.flame2.position.y = 0.85;
    this.group.add(this.flame2);

    this.light = new THREE.PointLight(0xff9a3c, 14, 22, 1.8);
    this.light.position.y = 1.2;
    this.light.castShadow = false;
    this.group.add(this.light);

    // Искры
    const emberCount = 46;
    this.emberData = new Float32Array(emberCount * 3);
    this.emberLife = new Float32Array(emberCount);
    for (let i = 0; i < emberCount; i++) {
      this.emberLife[i] = Math.random();
      this.emberData[i * 3] = (Math.random() - 0.5) * 0.5;
      this.emberData[i * 3 + 1] = Math.random() * 2;
      this.emberData[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(this.emberData, 3));
    this.embers = new THREE.Points(
      eg,
      new THREE.PointsMaterial({ color: 0xffa040, size: 0.06, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.group.add(this.embers);

    // Дым
    const smokeCount = 30;
    this.smokeData = new Float32Array(smokeCount * 3);
    for (let i = 0; i < smokeCount; i++) {
      this.smokeData[i * 3] = (Math.random() - 0.5) * 0.6;
      this.smokeData[i * 3 + 1] = 1.2 + Math.random() * 4;
      this.smokeData[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokeData, 3));
    this.smoke = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0x8a8a86, size: 0.55, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.group.add(this.smoke);
  }

  get intensity(): number {
    if (!this.lit) return 0;
    return Math.max(0.12, Math.min(1, this.fuel / 40));
  }

  addFuel(amount: number): void {
    this.fuel = Math.min(this.maxFuel, this.fuel + amount);
    this.lit = true;
  }

  relight(): boolean {
    if (this.fuel <= 0) return false;
    this.lit = true;
    return true;
  }

  /** Возвращает true, когда костёр только что погас. */
  update(dt: number, playerPos: THREE.Vector3): { justDied: boolean; crackle: boolean } {
    this.time += dt;
    let justDied = false;
    if (this.lit) {
      this.fuel -= dt * 100 / 260; // ~4.3 минуты на полном топливе
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.lit = false;
        justDied = true;
      }
    }

    const inten = this.intensity;
    const flicker = 0.85 + Math.sin(this.time * 13.3) * 0.07 + Math.sin(this.time * 7.1) * 0.05;
    this.light.intensity = this.lit ? (6 + inten * 12) * flicker : 0;
    this.light.distance = 12 + inten * 12;

    this.flame.visible = this.lit;
    this.flame2.visible = this.lit;
    if (this.lit) {
      const s = 0.55 + inten * 0.75;
      this.flame.scale.set(s, s * (0.9 + Math.sin(this.time * 9) * 0.12), s);
      this.flame2.scale.set(s, s * (1.0 + Math.sin(this.time * 11 + 1) * 0.15), s);
      this.flame.rotation.y += dt * 1.5;
    }

    // Искры
    const ep = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.emberLife.length; i++) {
      this.emberLife[i] -= dt * 0.55;
      if (this.emberLife[i] <= 0) {
        this.emberLife[i] = 1;
        this.emberData[i * 3] = (Math.random() - 0.5) * 0.8;
        this.emberData[i * 3 + 1] = 0.6;
        this.emberData[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      }
      this.emberData[i * 3 + 1] += dt * (1.2 + this.emberLife[i]);
      this.emberData[i * 3] += Math.sin(this.time * 3 + i) * dt * 0.2;
      ep.setY(i, this.emberData[i * 3 + 1] * (this.lit ? 1 : 0));
      ep.setX(i, this.emberData[i * 3]);
      ep.setZ(i, this.emberData[i * 3 + 2]);
    }
    ep.needsUpdate = true;

    // Дым
    const sp = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      let y = sp.getY(i) + dt * 0.7;
      if (y > 6.5) y = 1.2;
      sp.setY(i, y);
      sp.setX(i, sp.getX(i) + Math.sin(this.time * 0.8 + i) * dt * 0.15);
    }
    sp.needsUpdate = true;

    this.crackleTimer -= dt;
    const crackle = this.crackleTimer <= 0 && this.lit && playerPos.distanceTo(this.position) < 16;
    if (crackle) this.crackleTimer = 0.25 + Math.random() * 0.9;

    return { justDied, crackle };
  }

  /** Радиус, в котором огонь даёт защиту и свет. */
  safeRadius(): number {
    return this.lit ? 7 + this.intensity * 5 : 0;
  }

  static build(pos: THREE.Vector3): Campfire {
    return new Campfire(new THREE.Scene(), pos);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        (o.geometry as THREE.BufferGeometry).dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}
