/**
 * Зона защиты костра. Пока огонь горит, твари не заходят внутрь круга:
 * движение вдоль границы, а если враг оказался внутри — выталкивается наружу.
 */

export interface SafeZone {
  x: number;
  z: number;
  radius: number;
  active: boolean;
}

/** Изменяет направление движения, не давая пересечь границу зоны. */
export function steerAroundSafeZone(
  pos: { x: number; z: number },
  dir: { x: number; z: number },
  safe: SafeZone | null,
): { x: number; z: number } {
  if (!safe || !safe.active || safe.radius <= 0) return dir;

  const dx = pos.x - safe.x;
  const dz = pos.z - safe.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) {
    // Ровно в центре — уводим в любую сторону.
    return { x: 1, z: 0 };
  }

  const nx = dx / dist;
  const nz = dz / dist;

  // Враг уже внутри круга — выводим его наружу.
  if (dist < safe.radius - 0.4) {
    return { x: nx, z: nz };
  }

  // У границы убираем радиальную составляющую «внутрь», оставляя скольжение.
  const inward = dir.x * -nx + dir.z * -nz;
  if (inward > 0) {
    const x = dir.x + nx * inward;
    const z = dir.z + nz * inward;
    const len = Math.hypot(x, z);
    if (len < 0.0001) {
      // Движение строго внутрь — скользим по касательной.
      return { x: -nz, z: nx };
    }
    return { x: x / len, z: z / len };
  }
  return dir;
}
