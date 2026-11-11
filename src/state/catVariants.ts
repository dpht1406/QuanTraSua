export type CatVariantId = 'tabby' | 'calico' | 'ginger' | 'gray' | 'black' | 'white';

export type CatAccessory = 'none' | 'bow' | 'hat' | 'glasses' | 'scarf';

export interface CatVariant {
  readonly id: CatVariantId;
  readonly name: string;
  readonly furColor: number;
  readonly patchColor: number;
  readonly accessory: CatAccessory;
  readonly outfitColor: number;
}

// 6 biến thể mèo chibi mặc định dùng chung cho khách, nhân viên và người chơi
export const CAT_VARIANTS: readonly CatVariant[] = [
  {
    id: 'tabby',
    name: 'Mèo mướp',
    furColor: 0xf3a85c,
    patchColor: 0xb95b22,
    accessory: 'hat',
    outfitColor: 0xa2c9a6,
  },
  {
    id: 'calico',
    name: 'Mèo tam thể',
    furColor: 0xfff7ec,
    patchColor: 0xe8863c,
    accessory: 'bow',
    outfitColor: 0xf6b0bc,
  },
  {
    id: 'ginger',
    name: 'Mèo vàng',
    furColor: 0xf9cc6b,
    patchColor: 0xfff1c9,
    accessory: 'scarf',
    outfitColor: 0x9ad0e6,
  },
  {
    id: 'gray',
    name: 'Mèo xám',
    furColor: 0xa9b4c2,
    patchColor: 0xdce3eb,
    accessory: 'glasses',
    outfitColor: 0xf8b88b,
  },
  {
    id: 'black',
    name: 'Mèo đen',
    furColor: 0x362f33,
    patchColor: 0x5b5156,
    accessory: 'none',
    outfitColor: 0xe8c77b,
  },
  {
    id: 'white',
    name: 'Mèo trắng',
    furColor: 0xfffaf2,
    patchColor: 0xf4d6dc,
    accessory: 'bow',
    outfitColor: 0xc9b6e4,
  },
] as const;

// Chọn biến thể xác định và lặp vòng theo chỉ số (hỗ trợ cả số âm)
export function pickVariant(index: number): CatVariant {
  const n = CAT_VARIANTS.length;
  if (!Number.isFinite(index)) return CAT_VARIANTS[0];
  const i = Math.trunc(index);
  return CAT_VARIANTS[((i % n) + n) % n];
}

// Lấy thông tin biến thể theo id, rơi về biến thể đầu nếu không khớp
export function getCatVariant(id: CatVariantId): CatVariant {
  return CAT_VARIANTS.find((v) => v.id === id) ?? CAT_VARIANTS[0];
}
