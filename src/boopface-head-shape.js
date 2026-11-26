import BoopFace, { registerAvatarExtension } from './boopface-extension-host.js';
import './boopface-head-roundness.js';

// Head shapes beyond the round-to-square scale. head-shape="hexagon" (or
// setHeadShape('hexagon')) moves every point of the head outline onto a
// polygon along its ray from the centre, the way setHeadRoundness moves them
// onto a superellipse. The skins, the clip, the drag wobble and the 3D head all
// draw from that one outline, so they follow. No attribute (or null) keeps the
// rounded head. Triangles are left out: the eyes don't fit inside one.

const CENTER = 120;

function regular(sides, rotation, cy, radius) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + index * 2 * Math.PI / sides;
    return { x: CENTER + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

// Each polygon in the 240-unit head space, sized to hold both eyes.
const OUTLINES = Object.freeze({
  diamond: regular(4, -Math.PI / 2, 120, 108),
  pentagon: regular(5, -Math.PI / 2, 124, 105),
  hexagon: regular(6, 0, 120, 104),
  octagon: regular(8, Math.PI / 8, 120, 106),
  shield: [{ x: 22, y: 30 }, { x: 218, y: 30 }, { x: 218, y: 140 }, { x: 120, y: 222 }, { x: 22, y: 140 }],
});

const HEAD_SHAPES = Object.freeze(Object.keys(OUTLINES));

// Where the ray from the centre through `point` leaves the polygon.
function project(polygon, point) {
  const angle = Math.atan2(point.y - CENTER, point.x - CENTER);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let nearest = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    const ex = to.x - from.x;
    const ey = to.y - from.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const along = ((from.x - CENTER) * ey - (from.y - CENTER) * ex) / denominator;
    const across = ((from.x - CENTER) * dy - (from.y - CENTER) * dx) / denominator;
    if (along > 0 && across >= 0 && across <= 1) nearest = Math.min(nearest, along);
  }
  return { x: CENTER + dx * nearest, y: CENTER + dy * nearest };
}

function wanted(instance) {
  const raw = String(instance.getAttribute('head-shape') || '').trim().toLowerCase();
  if (!raw || raw === 'none') return null;
  if (OUTLINES[raw]) return raw;
  if (instance._headShapeWarned !== raw) {
    instance._headShapeWarned = raw;
    console.warn(`boopface: unknown head-shape "${raw}"; use one of ${HEAD_SHAPES.join(', ')}.`);
  }
  return null;
}

function outline(instance, shape) {
  if (!instance._headShape || !instance._baseHeadPoints?.length) return;
  const points = instance._baseHeadPoints.map(point => project(OUTLINES[shape], point));
  instance._baseHeadPoints = points;
  instance._baseHeadPathD = instance._pointsToPath(points);
  if (instance._dragJelly?.active || instance._dragJelly?.returning) instance._applyHeadDeform?.();
  else instance._headShape.setAttribute('d', instance._baseHeadPathD);
}

const proto = BoopFace.prototype;
const setHeadRoundness = proto.setHeadRoundness;

function setPoints(instance, points) {
  instance._baseHeadPoints = points.map(point => ({ x: point.x, y: point.y }));
  instance._baseHeadPathD = instance._pointsToPath(instance._baseHeadPoints);
  instance._headShape.setAttribute('d', instance._baseHeadPathD);
}

// The roundness rebuilds the outline from scratch. Keep that rounded outline,
// so a shape can be taken off again, and draw the shape over it.
proto.setHeadRoundness = function(value) {
  setHeadRoundness.call(this, value);
  if (this._headRoundnessDefaultPoints?.length) {
    this._headShapeRound = this._baseHeadPoints.map(point => ({ x: point.x, y: point.y }));
  }
  if (this._headShapeApplied) outline(this, this._headShapeApplied);
  return this;
};

function apply(instance) {
  // Not drawn yet: the next frame tries again.
  if (!instance._headShape || !instance._baseHeadPoints?.length) return;
  const shape = wanted(instance);
  instance._headShapeAsked = instance.getAttribute('head-shape');
  instance._headShapeApplied = null;
  // Back to the rounded outline first, so a shape never stacks on another.
  // The first time, setHeadRoundness sets up the outline it measures from.
  if (instance._headShapeRound) setPoints(instance, instance._headShapeRound);
  else if (shape) instance.setHeadRoundness(instance.getHeadRoundness());
  instance._headShapeApplied = shape;
  if (shape) outline(instance, shape);
  instance._resumeFrames?.();
}

proto.setHeadShape = function(shape) {
  if (shape == null || shape === '' || shape === 'none') {
    this.removeAttribute('head-shape');
  } else {
    const name = String(shape).trim().toLowerCase();
    if (!OUTLINES[name]) throw new RangeError(`Unknown head shape: ${shape}. Use one of ${HEAD_SHAPES.join(', ')}.`);
    this.setAttribute('head-shape', name);
  }
  apply(this);
  this._resumeFrames?.();
  return this;
};

proto.getHeadShape = function() {
  return wanted(this);
};

registerAvatarExtension({
  name: 'head-shape',
  draw() {
    // An avatar that never had a shape is left alone.
    if ((this._headShapeAsked ?? null) !== this.getAttribute('head-shape')) apply(this);
  },
});

export { BoopFace, HEAD_SHAPES };
export default BoopFace;
