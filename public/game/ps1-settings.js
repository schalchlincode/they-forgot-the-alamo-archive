// Keep rendering controls separate from gameplay state.
export const ps1Settings = {
  lowResolution: true,
  internalHeight: 240,
  vertexSnap: true,
  colorDither: true,
  distanceFog: true,
  fogColor: 0x312b2a,
  fogNear: 13,
  fogFar: 25,
};

export function internalSize(width, height) {
  const shortSide = Math.max(1, Math.min(width, height));
  const scale = ps1Settings.internalHeight / shortSide;
  return {
    width: Math.max(240, Math.round(width * scale)),
    height: Math.max(240, Math.round(height * scale)),
  };
}
