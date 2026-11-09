import * as THREE from 'three';
import type { Stage, GameHandle } from '../core/Stage';
import { Campfire } from '../camp/Campfire';
import { LobbyUI } from '../ui/LobbyUI';

/** Лобби: лесной лагерь с костром, ожидание и отсчёт. */
export class LobbyStage implements Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private campfire: Campfire;
  private ui: LobbyUI;
  private time = 0;
  private countdown = 0;
  private starting = false;
  private playerPos = new THREE.Vector3(0, 0, 0);

  constructor(private handle: GameHandle) {
    this.scene.fog = new THREE.FogExp2(0x0d1713, 0.022);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(6, 4.2, 11);
    this.camera.lookAt(0, 1.4, 0);

    const hemi = new THREE.HemisphereLight(0x4a6a7a, 0x121a10, 0.55);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xa8bcd8, 0.75);
    moon.position.set(-18, 34, 14);
    this.scene.add(moon);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(40, 32),
      new THREE.MeshLambertMaterial({ color: 0x22301f }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Палатки
    const tentMat = new THREE.MeshLambertMaterial({ color: 0x584a34 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.6;
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.3, 5), tentMat);
      tent.position.set(Math.cos(a) * 7.5, 1.15, Math.sin(a) * 7.5);
      tent.castShadow = true;
      this.scene.add(tent);
    }

    // Брёвна у костра
    const logMat = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 6), logMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(Math.cos(a) * 3.4, 0.22, Math.sin(a) * 3.4);
      log.rotation.y = -a;
      this.scene.add(log);
    }

    this.campfire = new Campfire(this.scene, new THREE.Vector3(0, 0, 0));

    // Деревья вокруг лагеря
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 6, 5);
    trunkGeo.translate(0, 3, 0);
    const leafGeo = new THREE.ConeGeometry(2, 5.5, 6);
    leafGeo.translate(0, 5.8, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x241d16 }), 60);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x1b2a1e }), 60);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 22;
      const s = 0.8 + Math.random() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
      m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    }
    this.scene.add(trunks, leaves);

    this.ui = new LobbyUI(handle.screens ? document.getElementById('ui-root')! : document.getElementById('ui-root')!, {
      onCount: () => {
        this.handle.audio.uiClick();
      },
      onClass: (c) => {
        this.handle.setPlayerClass(c);
        this.handle.audio.uiClick();
      },
      onReady: () => {
        this.handle.audio.uiClick();
      },
      onStart: () => this.beginCountdown(),
      onBack: () => this.handle.toMenu(),
    });
    this.ui.show();
  }

  private beginCountdown(): void {
    if (this.starting) return;
    this.starting = true;
    this.countdown = 3.2;
    this.handle.audio.uiClick();
  }

  update(dt: number): void {
    this.time += dt;
    this.campfire.update(dt, this.playerPos);

    this.camera.position.set(Math.sin(this.time * 0.12) * 2.5 + 6, 4.2 + Math.sin(this.time * 0.3) * 0.15, 11);
    this.camera.lookAt(0, 1.6, 0);

    if (this.starting) {
      this.countdown -= dt;
      this.ui.setCountdown(Math.max(0, this.countdown));
      if (this.countdown <= 0) {
        this.starting = false;
        this.ui.close();
        this.handle.toGame();
      }
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.ui.close();
    this.campfire.dispose();
    this.scene.clear();
  }
}
