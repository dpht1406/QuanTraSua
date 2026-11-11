export type ToolKind = 'broom' | 'mop';
export type ToolLocation = 'rack' | 'hand' | 'flying' | 'floor';
export type ToolLocations = Record<ToolKind, ToolLocation>;

// Tạo vị trí dụng cụ mặc định trên giá
export function createToolLocations(): ToolLocations {
  return { broom: 'rack', mop: 'rack' };
}

export function getLocation(t: ToolLocations, kind: ToolKind): ToolLocation {
  return t[kind];
}

export function setLocation(t: ToolLocations, kind: ToolKind, loc: ToolLocation): void {
  t[kind] = loc;
}

export function resetAllToRack(t: ToolLocations): void {
  t.broom = 'rack';
  t.mop = 'rack';
}
