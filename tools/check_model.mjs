import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const file = process.argv[2] ?? 'public/assets/models/Stag.glb';
const buf = fs.readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
new GLTFLoader().parse(ab, '', (gltf) => {
  console.log('parsed OK, clips:', gltf.animations.length);
  const c = clone(gltf.scene);
  const box = new THREE.Box3().setFromObject(c);
  console.log('bbox min', box.min.toArray().map(n => +n.toFixed(4)));
  console.log('bbox max', box.max.toArray().map(n => +n.toFixed(4)));
  let head = null, bones = 0, meshes = 0;
  c.traverse(o => { if (o.isBone) bones++; if (o.isMesh) meshes++; if (!head && /head/i.test(o.name)) head = o; });
  console.log('bones:', bones, 'meshes:', meshes, 'head:', head ? head.name : 'NOT FOUND');
  console.log('clips:', gltf.animations.map(a => a.name.split('|').pop()).join(', '));
}, (err) => console.error('PARSE ERROR:', err?.message ?? err));
