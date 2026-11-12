import * as THREE from 'three';
import {
  CROSSWALK_WIDTH,
  CROSSWALK_XS,
  SHOP_FRONT_WALL_Z,
  STREET_BOUNDS,
  STREET_ROAD_Z,
  STREET_SIDEWALK_OPP_Z,
  STREET_SIDEWALK_SHOP_Z,
} from '../state/constantsStreet.ts';
import { PALETTE } from '../styles/palette.ts';
import { makePartBox } from './furniturePrimitives.ts';
import { getAsphaltTexture, getFacadeTexture, getSidewalkTexture } from './textures.ts';

interface FacadeBlockSpec {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
  color: number;
  variant: 0 | 1 | 2;
  awningColor?: number;
  awningDirZ?: 1 | -1;
}

const OPP_BUILDINGS: readonly FacadeBlockSpec[] = [
  { minX: -22.0, maxX: -14.5, minZ: 14.2, maxZ: 19.0, h: 7.4, color: 0xf4dcc8, variant: 1 },
  { minX: -14.5, maxX: -7.5, minZ: 14.2, maxZ: 19.0, h: 8.6, color: 0xe6efe3, variant: 0, awningColor: PALETTE.matchaGreen, awningDirZ: -1 },
  { minX: -7.5, maxX: -1.0, minZ: 14.2, maxZ: 19.0, h: 7.2, color: 0xfae6d2, variant: 2, awningColor: PALETTE.pinkBlush, awningDirZ: -1 },
  { minX: -1.0, maxX: 6.0, minZ: 14.2, maxZ: 19.0, h: 8.9, color: 0xf6eedf, variant: 1, awningColor: PALETTE.syrupPeach, awningDirZ: -1 },
  { minX: 6.0, maxX: 13.5, minZ: 14.2, maxZ: 19.0, h: 7.6, color: 0xeadff0, variant: 0, awningColor: PALETTE.matchaMint, awningDirZ: -1 },
  { minX: 13.5, maxX: 22.0, minZ: 14.2, maxZ: 19.0, h: 8.2, color: 0xf2dfd3, variant: 2 },
];

const SIDE_BUILDINGS: readonly FacadeBlockSpec[] = [
  { minX: -11.5, maxX: -5.2, minZ: -4.2, maxZ: 4.2, h: 7.2, color: 0xf3e4d4, variant: 0, awningColor: PALETTE.syrupPeach, awningDirZ: 1 },
  { minX: 5.2, maxX: 11.5, minZ: -4.2, maxZ: 4.2, h: 7.6, color: 0xe5eee3, variant: 1, awningColor: PALETTE.matchaGreen, awningDirZ: 1 },
  { minX: -22.0, maxX: -11.5, minZ: -4.2, maxZ: 4.2, h: 8.0, color: 0xf0ddd2, variant: 2 },
  { minX: 11.5, maxX: 22.0, minZ: -4.2, maxZ: 4.2, h: 7.4, color: 0xf5ebd8, variant: 0 },
  // Khối nhà cuối hai đầu đường (đóng kín tầm nhìn xa để không lộ rìa thế giới)
  { minX: -22.5, maxX: -17.5, minZ: 3.8, maxZ: 15.0, h: 8.4, color: 0xede2d6, variant: 2 },
  { minX: 17.5, maxX: 22.5, minZ: 3.8, maxZ: 15.0, h: 8.4, color: 0xebe6df, variant: 1 },
];

function addFacadeBlock(
  group: THREE.Group,
  shadowCasters: THREE.Object3D[],
  spec: FacadeBlockSpec,
): void {
  const w = spec.maxX - spec.minX;
  const d = spec.maxZ - spec.minZ;
  const cx = (spec.minX + spec.maxX) * 0.5;
  const cz = (spec.minZ + spec.maxZ) * 0.5;
  const body = makePartBox(w, spec.h, d, 'paint', spec.color, cx, spec.h * 0.5, cz, {
    map: getFacadeTexture(spec.variant),
    roughness: 0.88,
    outline: 0,
    castShadow: true,
    receiveShadow: true,
  });
  body.name = 'streetBuilding';
  group.add(body);
  shadowCasters.push(body);

  // Diềm mái nổi nhẹ tạo chiều sâu mặt tiền
  const roof = makePartBox(w + 0.16, 0.24, d + 0.16, 'paint', PALETTE.teaDark, cx, spec.h + 0.12, cz, {
    roughness: 0.82,
    outline: 0,
    castShadow: true,
    receiveShadow: true,
  });
  group.add(roof);
  shadowCasters.push(roof);

  if (spec.awningColor !== undefined && spec.awningDirZ !== undefined) {
    const edgeZ = spec.awningDirZ === 1 ? spec.maxZ + 0.34 : spec.minZ - 0.34;
    const awning = makePartBox(w - 0.8, 0.14, 0.68, 'fabric', spec.awningColor, cx, 2.75, edgeZ, {
      outline: 0,
      castShadow: true,
      receiveShadow: true,
    });
    awning.rotation.x = spec.awningDirZ * 0.18;
    group.add(awning);
    shadowCasters.push(awning);
  }
}

function addGroundAndRoad(group: THREE.Group): void {
  const spanW = 44;
  const sidewalkTex = getSidewalkTexture();
  const asphaltTex = getAsphaltTexture();

  const shopSidewalkD = STREET_SIDEWALK_SHOP_Z.maxZ - (SHOP_FRONT_WALL_Z);
  const shopSidewalkZ = (SHOP_FRONT_WALL_Z + STREET_SIDEWALK_SHOP_Z.maxZ) * 0.5;
  const shopSidewalk = makePartBox(spanW, 0.1, shopSidewalkD, 'paint', 0xffffff, 0, -0.05, shopSidewalkZ, {
    map: sidewalkTex,
    roughness: 0.86,
    outline: 0,
    castShadow: false,
    receiveShadow: true,
  });
  shopSidewalk.name = 'streetSidewalkShop';
  group.add(shopSidewalk);

  const oppSidewalkD = STREET_SIDEWALK_OPP_Z.maxZ - STREET_SIDEWALK_OPP_Z.minZ;
  const oppSidewalkZ = (STREET_SIDEWALK_OPP_Z.minZ + STREET_SIDEWALK_OPP_Z.maxZ) * 0.5;
  const oppSidewalk = makePartBox(spanW, 0.1, oppSidewalkD, 'paint', 0xffffff, 0, -0.05, oppSidewalkZ, {
    map: sidewalkTex,
    roughness: 0.86,
    outline: 0,
    castShadow: false,
    receiveShadow: true,
  });
  oppSidewalk.name = 'streetSidewalkOpp';
  group.add(oppSidewalk);

  const roadD = STREET_ROAD_Z.maxZ - STREET_ROAD_Z.minZ;
  const roadZ = (STREET_ROAD_Z.minZ + STREET_ROAD_Z.maxZ) * 0.5;
  const road = makePartBox(spanW, 0.1, roadD, 'paint', asphaltTex ? 0xffffff : 0x555963, 0, -0.05, roadZ, {
    map: asphaltTex,
    roughness: 0.9,
    outline: 0,
    castShadow: false,
    receiveShadow: true,
  });
  road.name = 'streetRoad';
  group.add(road);

  // Nền đất dưới chân nhà hai bên & đối diện để không lộ khoảng trống bên dưới
  const groundOpts = { roughness: 0.94, outline: 0, castShadow: false, receiveShadow: true };
  group.add(makePartBox(spanW, 0.1, 6.0, 'paint', 0xc9bfb2, 0, -0.05, STREET_SIDEWALK_OPP_Z.maxZ + 3.0, groundOpts));
  group.add(makePartBox(17.0, 0.1, 9.0, 'paint', 0xc9bfb2, -13.7, -0.05, -0.4, groundOpts));
  group.add(makePartBox(17.0, 0.1, 9.0, 'paint', 0xc9bfb2, 13.7, -0.05, -0.4, groundOpts));

  // Bờ lề chỉ hình ảnh (không collider để không vấp chân người chơi hoặc ghế)
  const curbOpts = { roughness: 0.8, outline: 0, castShadow: false, receiveShadow: true };
  group.add(makePartBox(spanW, 0.018, 0.14, 'paint', 0xc5bbb0, 0, -0.002, STREET_ROAD_Z.minZ - 0.07, curbOpts));
  group.add(makePartBox(spanW, 0.018, 0.14, 'paint', 0xc5bbb0, 0, -0.002, STREET_ROAD_Z.maxZ + 0.07, curbOpts));

  // Vạch tim đường đứt đoạn và 2 vạch băng qua đường tại CROSSWALK_XS
  const markOpts = { roughness: 0.72, outline: 0, castShadow: false, receiveShadow: true };
  for (let x = -18; x <= 18; x += 2.4) {
    group.add(makePartBox(1.2, 0.004, 0.12, 'paint', 0xf6db7e, x, 0.002, roadZ, markOpts));
  }
  for (const cx of CROSSWALK_XS) {
    for (let i = 0; i < 6; i++) {
      const sz = STREET_ROAD_Z.minZ + 0.45 + i * 0.82;
      const stripe = makePartBox(CROSSWALK_WIDTH - 0.16, 0.004, 0.42, 'paint', 0xf5f2eb, cx, 0.002, sz, markOpts);
      stripe.name = 'streetCrosswalkStripe';
      group.add(stripe);
    }
  }
}

function addStreetBarriers(group: THREE.Group, shadowCasters: THREE.Object3D[]): void {
  const { minX, maxX, minZ, maxZ } = STREET_BOUNDS;
  const spanZ = maxZ - minZ;
  const midZ = (minZ + maxZ) * 0.5;
  for (const sideX of [minX - 0.12, maxX + 0.12]) {
    const fence = new THREE.Group();
    fence.name = 'streetEndFence';
    fence.add(makePartBox(0.14, 0.16, spanZ, 'paint', 0xbab0a5, sideX, 0.08, midZ, { outline: 0 }));
    fence.add(makePartBox(0.06, 0.08, spanZ, 'wood', PALETTE.teaDark, sideX, 0.92, midZ, { outline: 0 }));
    fence.add(makePartBox(0.05, 0.06, spanZ, 'wood', PALETTE.teaBrown, sideX, 0.52, midZ, { outline: 0 }));
    for (let pz = minZ + 0.3; pz <= maxZ - 0.2; pz += 1.9) {
      fence.add(makePartBox(0.1, 1.0, 0.1, 'wood', PALETTE.teaDark, sideX, 0.5, pz, { outline: 0 }));
    }
    group.add(fence);
    shadowCasters.push(fence);
  }
}

// Dựng nền đường, vỉa hè, vạch kẻ, mái hiên quán, hàng rào rìa và dãy nhà đối diện/hai bên
export function buildStreetBuildings(): { group: THREE.Group; shadowCasters: THREE.Object3D[] } {
  const group = new THREE.Group();
  group.name = 'streetBuildingsAndRoad';
  const shadowCasters: THREE.Object3D[] = [];

  addGroundAndRoad(group);

  // Mái hiên trang trí phía trước quán trà sữa (cao > 2.6m để không che cửa sổ)
  const shopAwning = makePartBox(9.2, 0.12, 0.85, 'fabric', PALETTE.pinkBlush, 0, 2.82, SHOP_FRONT_WALL_Z + 0.54, {
    outline: 0,
    castShadow: true,
    receiveShadow: true,
  });
  shopAwning.rotation.x = 0.22;
  shopAwning.name = 'shopFrontAwning';
  group.add(shopAwning);
  shadowCasters.push(shopAwning);

  for (const spec of [...OPP_BUILDINGS, ...SIDE_BUILDINGS]) {
    addFacadeBlock(group, shadowCasters, spec);
  }
  addStreetBarriers(group, shadowCasters);

  return { group, shadowCasters };
}
