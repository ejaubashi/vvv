/** One liquid aperture. Every island samples the same scene coordinate system. */
export const SPLASH_DROPS = [
  // A slender sliver, a dominant island, a bead, a streak, a pebble and a speck.
  // Each has a distinct area and aspect ratio, within the shared media bounds.
  { x: -0.88, y: -0.43, rx: 0.055, ry: 0.13, angle: -0.65 },
  { x: 0.53, y: -0.83, rx: 0.18, ry: 0.105, angle: 0.24 },
  { x: 0.92, y: 0.12, rx: 0.056, ry: 0.056, angle: 0 },
  { x: 0.75, y: 0.7, rx: 0.123, ry: 0.045, angle: -0.65 },
  { x: -0.75, y: 0.67, rx: 0.09, ry: 0.125, angle: 0.35 },
  { x: -0.94, y: 0.1, rx: 0.024, ry: 0.04, angle: 0.5 },
] as const;

export function splashRadius(angle: number) {
  return (
    0.73 +
    0.065 * Math.sin(3 * angle + 0.55) +
    0.045 * Math.sin(5 * angle - 1.1) +
    0.025 * Math.cos(8 * angle + 0.4)
  );
}

function roundedDistance(
  x: number,
  y: number,
  hw: number,
  hh: number,
  round: number,
) {
  const qx = Math.abs(x) - hw + round,
    qy = Math.abs(y) - hh + round;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    round
  );
}

/** Signed field in CSS pixels, shared by the outline and the CPU hit test. */
export function liquidDistance(
  x: number,
  y: number,
  hw: number,
  hh: number,
  round: number,
  amount: number,
) {
  let distance = roundedDistance(x, y, hw, hh, round);
  if (amount <= 0.0001) return distance;
  const nx = x / hw,
    ny = y / hh,
    scale = Math.min(hw, hh);
  distance += amount * (1 - splashRadius(Math.atan2(ny, nx))) * scale;
  for (const drop of SPLASH_DROPS) {
    const dx = nx - drop.x * (0.75 + 0.25 * amount),
      dy = ny - drop.y * (0.75 + 0.25 * amount);
    const cs = Math.cos(drop.angle),
      sn = Math.sin(drop.angle);
    const qx = cs * dx + sn * dy,
      qy = -sn * dx + cs * dy;
    const rx = drop.rx * amount,
      ry = drop.ry * amount;
    const k0 = Math.hypot(qx / rx, qy / ry),
      k1 = Math.hypot(qx / (rx * rx), qy / (ry * ry));
    const ellipse = k0 < 0.0001 ? -Math.min(rx, ry) : (k0 * (k0 - 1)) / k1;
    distance = Math.min(distance, ellipse * scale);
  }
  return distance;
}

let cachedKey = "",
  cachedOutline = "";
/** SVG path for Canvas clipping and the native lens hit area. No image per piece. */
export function liquidOutline(
  width: number,
  height: number,
  round: number,
  amount: number,
) {
  const key = `${width},${height},${round},${amount}`;
  if (key === cachedKey) return cachedOutline;
  const hw = width / 2,
    hh = height / 2,
    scale = Math.min(hw, hh);
  const points: string[] = [];
  for (let i = 0; i < 128; i++) {
    const angle = (i / 128) * Math.PI * 2,
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    const inset = amount * (1 - splashRadius(angle)) * scale;
    let low = 0,
      high = 1.5;
    for (let step = 0; step < 13; step++) {
      const mid = (low + high) / 2;
      if (
        roundedDistance(cs * hw * mid, sn * hh * mid, hw, hh, round) + inset <
        0
      )
        low = mid;
      else high = mid;
    }
    const r = (low + high) / 2;
    points.push(
      `${i ? "L" : "M"}${(hw + cs * hw * r).toFixed(3)},${(hh + sn * hh * r).toFixed(3)}`,
    );
  }
  points.push("Z");
  if (amount > 0.0001)
    for (const drop of SPLASH_DROPS) {
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const px = Math.cos(angle) * drop.rx * amount,
          py = Math.sin(angle) * drop.ry * amount;
        const x =
          drop.x * (0.75 + 0.25 * amount) +
          px * Math.cos(drop.angle) -
          py * Math.sin(drop.angle);
        const y =
          drop.y * (0.75 + 0.25 * amount) +
          px * Math.sin(drop.angle) +
          py * Math.cos(drop.angle);
        points.push(
          `${i ? "L" : "M"}${(hw + x * hw).toFixed(3)},${(hh + y * hh).toFixed(3)}`,
        );
      }
      points.push("Z");
    }
  cachedKey = key;
  return (cachedOutline = points.join(" "));
}

const literal = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const radiusExpression = (angle: string) =>
  `0.73+0.065*sin(3.0*${angle}+0.55)+0.045*sin(5.0*${angle}-1.1)+0.025*cos(8.0*${angle}+0.4)`;
const derivativeExpression = (angle: string) =>
  `0.195*cos(3.0*${angle}+0.55)+0.225*cos(5.0*${angle}-1.1)-0.2*sin(8.0*${angle}+0.4)`;

export const splashGLSL = `
// Project and soften each primitive independently. A nearest-island size would
// create discontinuities where the large body's shadow meets a tiny droplet.
float liquidShadow(vec2 local,vec2 halfSize,float rounding,float amount,vec2 lightDir,float ratio){
float size=min(halfSize.x,halfSize.y);
vec2 shifted=local+lightDir*clamp(size*.07,1.2*ratio,14.*ratio);
vec2 q=abs(shifted)-halfSize+vec2(rounding);
float a=atan(shifted.y/halfSize.y,shifted.x/halfSize.x);
float distance=length(max(q,0.))+min(max(q.x,q.y),0.)-rounding+amount*(1.-(${radiusExpression("a")}))*size;
float shadow=exp(-max(distance,0.)/clamp(size*.055,ratio,12.*ratio))*.17;
if(amount>.0001){
${SPLASH_DROPS.map(
  (drop) => `{
float dropSize=size*${literal(Math.min(drop.rx, drop.ry))}*amount;
vec2 delta=(local+lightDir*clamp(dropSize*.07,1.2*ratio,14.*ratio))/halfSize-vec2(${literal(drop.x)},${literal(drop.y)})*(.75+.25*amount);
float cs=${literal(Math.cos(drop.angle))},sn=${literal(Math.sin(drop.angle))};
vec2 p=vec2(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y);
vec2 radii=vec2(${literal(drop.rx)},${literal(drop.ry)})*amount;
float k0=length(p/radii),k1=length(p/(radii*radii));
float distance=(k0<.0001?-min(radii.x,radii.y):k0*(k0-1.)/max(k1,.00001))*size;
float candidate=exp(-max(distance,0.)/clamp(dropSize*.055,ratio,12.*ratio))*.17;
shadow+=candidate*(1.-shadow);
}`,
).join("\n")}
}
return shadow;
}
vec4 liquidField(vec2 local,vec2 halfSize,float rounding,float amount){
vec2 q=abs(local)-halfSize+vec2(rounding);
float distance=length(max(q,0.))+min(max(q.x,q.y),0.)-rounding;
vec2 n=local/max(halfSize,vec2(1.));
vec4 field=vec4(distance,n,1.);
if(amount<.0001)return field;
float a=atan(n.y,n.x),bodyRadius=${radiusExpression("a")};
field.x+=amount*(1.-bodyRadius)*min(halfSize.x,halfSize.y);
vec2 tangent=vec2(-n.y,n.x)/max(length(n),.001);
float derivative=${derivativeExpression("a")};
field.yz=normalize(n-tangent*amount*derivative+vec2(.00001))*min(length(n)/mix(1.,bodyRadius,amount),1.);
${SPLASH_DROPS.map(
  (drop) => `{
vec2 delta=n-vec2(${literal(drop.x)},${literal(drop.y)})*(.75+.25*amount);
float cs=${literal(Math.cos(drop.angle))},sn=${literal(Math.sin(drop.angle))};
vec2 p=vec2(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y);
vec2 radii=vec2(${literal(drop.rx)},${literal(drop.ry)})*amount;
float k0=length(p/radii),k1=length(p/(radii*radii));
float ellipse=k0<.0001?-min(radii.x,radii.y):k0*(k0-1.)/max(k1,.00001);
float candidate=ellipse*min(halfSize.x,halfSize.y);
if(candidate<field.x){vec2 normal=normalize(p/(radii*radii)+vec2(.00001));field=vec4(candidate,vec2(cs*normal.x-sn*normal.y,sn*normal.x+cs*normal.y)*min(k0,1.),min(radii.x,radii.y));}
}`,
).join("\n")}
return field;
}`;

export const splashWGSL = `
fn liquidShadow(local:vec2f,halfSize:vec2f,rounding:f32,amount:f32,lightDir:vec2f,ratio:f32)->f32{
let size=min(halfSize.x,halfSize.y);
let shifted=local+lightDir*clamp(size*.07,1.2*ratio,14.*ratio);
let q=abs(shifted)-halfSize+vec2f(rounding);
let a=atan2(shifted.y/halfSize.y,shifted.x/halfSize.x);
let distance=length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-rounding+amount*(1.-(${radiusExpression("a")}))*size;
var shadow=exp(-max(distance,0.)/clamp(size*.055,ratio,12.*ratio))*.17;
if(amount>.0001){
${SPLASH_DROPS.map(
  (drop) => `{
let dropSize=size*${literal(Math.min(drop.rx, drop.ry))}*amount;
let delta=(local+lightDir*clamp(dropSize*.07,1.2*ratio,14.*ratio))/halfSize-vec2f(${literal(drop.x)},${literal(drop.y)})*(.75+.25*amount);
let cs=${literal(Math.cos(drop.angle))};let sn=${literal(Math.sin(drop.angle))};
let p=vec2f(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y);
let radii=vec2f(${literal(drop.rx)},${literal(drop.ry)})*amount;
let k0=length(p/radii);let k1=length(p/(radii*radii));
let distance=select(k0*(k0-1.)/max(k1,.00001),-min(radii.x,radii.y),k0<.0001)*size;
let candidate=exp(-max(distance,0.)/clamp(dropSize*.055,ratio,12.*ratio))*.17;
shadow+=candidate*(1.-shadow);
}`,
).join("\n")}
}
return shadow;
}
fn liquidField(local:vec2f,halfSize:vec2f,rounding:f32,amount:f32)->vec4f{
let q=abs(local)-halfSize+vec2f(rounding);
let distance=length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-rounding;
let n=local/max(halfSize,vec2f(1.));var field=vec4f(distance,n,1.);
if(amount<.0001){return field;}
let a=atan2(n.y,n.x);let bodyRadius=${radiusExpression("a")};
field.x+=amount*(1.-bodyRadius)*min(halfSize.x,halfSize.y);
let tangent=vec2f(-n.y,n.x)/max(length(n),.001);let derivative=${derivativeExpression("a")};
field=vec4f(field.x,normalize(n-tangent*amount*derivative+vec2f(.00001))*min(length(n)/mix(1.,bodyRadius,amount),1.),1.);
${SPLASH_DROPS.map(
  (drop) => `{
let delta=n-vec2f(${literal(drop.x)},${literal(drop.y)})*(.75+.25*amount);
let cs=${literal(Math.cos(drop.angle))};let sn=${literal(Math.sin(drop.angle))};
let p=vec2f(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y);
let radii=vec2f(${literal(drop.rx)},${literal(drop.ry)})*amount;
let k0=length(p/radii);let k1=length(p/(radii*radii));
var ellipse=k0*(k0-1.)/max(k1,.00001);if(k0<.0001){ellipse=-min(radii.x,radii.y);}
let candidate=ellipse*min(halfSize.x,halfSize.y);
if(candidate<field.x){let normal=normalize(p/(radii*radii)+vec2f(.00001));field=vec4f(candidate,vec2f(cs*normal.x-sn*normal.y,sn*normal.x+cs*normal.y)*min(k0,1.),min(radii.x,radii.y));}
}`,
).join("\n")}
return field;
}`;
