import { splashGLSL, splashWGSL } from "./splash";

export const glVertex = `#version 300 es
precision highp float;
const vec2 verts[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(verts[gl_VertexID],0.,1.);}`;
export const glFragment = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform sampler2D room;
uniform vec4 a; uniform vec4 b; uniform vec4 c; uniform vec4 d; uniform vec4 e; uniform vec4 f; uniform vec4 g; uniform vec4 h;
out vec4 color;
vec3 sampleScene(vec2 p){return texture(scene,clamp(p/a.xy,vec2(.001),vec2(.999))).rgb;}
vec3 sampleGlass(vec2 p){if(e.z<.001)return sampleScene(p);vec2 pixels=vec2(textureSize(room,0));vec2 cover=pixels*max(2.*b.x/pixels.x,2.*b.y/pixels.y);vec2 uv=(p-a.zw)/cover+vec2(.5);return mix(sampleScene(p),texture(room,clamp(uv,vec2(.001),vec2(.999))).rgb,e.z);}
vec2 ripple(vec2 p){if(g.w<.001)return vec2(0.);vec2 delta=p-h.xy;float distance=length(delta);float band=(distance-g.z)/(22.*d.w);return delta/max(distance,1.)*sin((distance-g.z)/(6.*d.w))*exp(-band*band)*g.w*8.*d.w;}
vec3 orb(vec2 p,vec3 base){
if(g.y<.001||f.z<1.)return base;
vec2 delta=p-f.xy;float cs=cos(g.x),sn=sin(g.x);
vec2 q=vec2(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y);q*=vec2(1./f.w,sqrt(f.w));
float dist=length(q),r=dist/f.z;
float halo=exp(-max(dist-f.z,0.)/(11.*d.w))*.22*g.y*smoothstep(.94,1.12,r);
base=mix(base,vec3(1.,.48,.065),halo);
if(r>1.03)return base;
vec2 n=q/f.z;float z=sqrt(max(.001,1.-min(dot(n,n),1.)));
vec3 normal=normalize(vec3(n,z));vec3 glass=sampleGlass(a.zw+delta*mix(1.6,.5,z));
float rim=pow(1.-z,3.);float shine=pow(max(dot(normal,normalize(vec3(-.45,-.6,.8))),0.),65.);
vec3 solar=mix(vec3(1.,.19,.015),vec3(1.,.59,.10),pow(z,1.4));
float grain=sin(n.x*34.+sin(n.y*23.))*sin(n.y*41.)*.018*z;
glass=mix(glass*vec3(1.,.65,.25),solar,.64)+vec3(grain);
glass+=vec3(1.,.68,.23)*(.09+rim*.3)+vec3(1.,.91,.63)*shine*.62;
glass+=vec3(1.,.82,.33)*exp(-pow((r-.94)/.025,2.))*.32;
return mix(base,glass,g.y*(1.-smoothstep(.97,1.02,r)));
}
${splashGLSL}
void main(){
vec2 p=vec2(gl_FragCoord.x,a.y-gl_FragCoord.y),local=p-a.zw;
local/=1.-c.z*.06;
vec2 axis=normalize(c.xy+vec2(.0001));local-=axis*dot(local,axis)*min(length(c.xy)*.06,.16);
vec4 surface=liquidField(local,b.xy,b.z,h.z);float sdf=surface.x;
vec3 base=sampleScene(p);float ratio=d.w;
float shadow=exp(-max(sdf,0.)/(18.*ratio))*.065*smoothstep(-2.*ratio,2.*ratio,sdf);
vec2 wakeCenter=a.zw+vec2(cos(e.y),sin(e.y))*b.x*.2+c.xy*8.*ratio;
float wake=exp(-pow((length((p-wakeCenter)/vec2(1.25,.62))-b.x*.95)/(18.*ratio),2.))*.055*(.2+c.z+d.z);
base=base*(1.-shadow)+vec3(wake);
if(sdf<1.5*ratio){
vec2 n=surface.yz;float r=clamp(length(n),0.,1.);
vec2 slope=n*.78*mix(1.,.2,e.w)/max(1.,length(n));float z=sqrt(max(.06,1.-dot(slope,slope)));
vec3 normal=normalize(vec3(slope,z));vec3 ray=refract(vec3(0.,0.,-1.),normal,1./b.w);
vec2 offset=clamp(ray.xy/max(.2,-ray.z)*c.w*ratio*e.x*.72,vec2(-c.w*ratio*.5),vec2(c.w*ratio*.5));
float portalBend=mix(1.,.3+.7*smoothstep(.6,1.,r),e.z);
vec2 refracted=p+offset*portalBend*surface.w+c.xy*ratio*2.+ripple(p);float frost=d.x*(3.+e.x*12.)*ratio*mix(1.,.18+.82*smoothstep(.12,.85,d.x),e.z);
vec3 glass=sampleGlass(refracted)*.4;
glass+=(sampleGlass(refracted+vec2(frost,0.))+sampleGlass(refracted-vec2(frost,0.))+sampleGlass(refracted+vec2(0.,frost))+sampleGlass(refracted-vec2(0.,frost)))*.15;
float f0=pow((b.w-1.)/(b.w+1.),2.);float fresnel=b.w<=1.0001?0.:f0+(1.-f0)*pow(1.-normal.z,5.);
vec3 light=normalize(vec3(cos(e.y)*.85,sin(e.y)*.85,.8));
float spec=pow(max(dot(reflect(vec3(0.,0.,-1.),normal),light),0.),mix(95.,9.,d.x));
float edge=exp(-abs(sdf)/(1.15*ratio)),rim=exp(-abs(sdf+4.*ratio)/(3.*ratio));
float facing=max(dot(normalize(local+vec2(.001)),normalize(light.xy)),0.);
glass=mix(glass,vec3(.94),min(.3,fresnel*.75+d.x*.12));
glass+=vec3(spec*min(1.,sqrt(f0)*5.)*(.24+.08*d.z)*(1.-d.x*.5)+edge*(.11+.38*facing)+rim*facing*.07);
glass-=vec3(exp(-abs(sdf+1.8*ratio)/(1.1*ratio))*.07*(1.-facing));
if(d.y>.5)glass=sampleGlass(p);
color=vec4(mix(base,glass,1.-smoothstep(-.8*ratio,1.2*ratio,sdf)),1.);
}else color=vec4(base,1.);
color.rgb=orb(p,color.rgb);
}`;
export const wgsl = `
struct Uniforms { a:vec4f,b:vec4f,c:vec4f,d:vec4f,e:vec4f,f:vec4f,g:vec4f,h:vec4f };
@group(0) @binding(0) var<uniform> u:Uniforms;
@group(0) @binding(1) var scene:texture_2d<f32>;
@group(0) @binding(2) var smp:sampler;
@group(0) @binding(3) var room:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
var verts=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(verts[index],0.,1.);
}
fn sampleScene(p:vec2f)->vec3f{return textureSampleLevel(scene,smp,clamp(p/u.a.xy,vec2f(.001),vec2f(.999)),0.).rgb;}
fn sampleGlass(p:vec2f)->vec3f{if(u.e.z<.001){return sampleScene(p);}let pixels=vec2f(textureDimensions(room));let cover=pixels*max(2.*u.b.x/pixels.x,2.*u.b.y/pixels.y);let uv=(p-u.a.zw)/cover+vec2f(.5);return mix(sampleScene(p),textureSampleLevel(room,smp,clamp(uv,vec2f(.001),vec2f(.999)),0.).rgb,u.e.z);}
fn ripple(p:vec2f)->vec2f{if(u.g.w<.001){return vec2f(0.);}let delta=p-u.h.xy;let distance=length(delta);let band=(distance-u.g.z)/(22.*u.d.w);return delta/max(distance,1.)*sin((distance-u.g.z)/(6.*u.d.w))*exp(-band*band)*u.g.w*8.*u.d.w;}
fn orb(p:vec2f,background:vec3f)->vec3f{
if(u.g.y<.001||u.f.z<1.){return background;}
let delta=p-u.f.xy;let cs=cos(u.g.x);let sn=sin(u.g.x);
let q=vec2f(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y)*vec2f(1./u.f.w,sqrt(u.f.w));
let dist=length(q);let r=dist/u.f.z;
let halo=exp(-max(dist-u.f.z,0.)/(11.*u.d.w))*.22*u.g.y*smoothstep(.94,1.12,r);
let base=mix(background,vec3f(1.,.48,.065),halo);
if(r>1.03){return base;}
let n=q/u.f.z;let z=sqrt(max(.001,1.-min(dot(n,n),1.)));
let normal=normalize(vec3f(n,z));var glass=sampleGlass(u.a.zw+delta*mix(1.6,.5,z));
let rim=pow(1.-z,3.);let shine=pow(max(dot(normal,normalize(vec3f(-.45,-.6,.8))),0.),65.);
let solar=mix(vec3f(1.,.19,.015),vec3f(1.,.59,.10),pow(z,1.4));
let grain=sin(n.x*34.+sin(n.y*23.))*sin(n.y*41.)*.018*z;
glass=mix(glass*vec3f(1.,.65,.25),solar,.64)+vec3f(grain);
glass+=vec3f(1.,.68,.23)*(.09+rim*.3)+vec3f(1.,.91,.63)*shine*.62;
glass+=vec3f(1.,.82,.33)*exp(-pow((r-.94)/.025,2.))*.32;
return mix(base,glass,u.g.y*(1.-smoothstep(.97,1.02,r)));
}
@fragment fn fsBackground(@builtin(position) pos:vec4f)->@location(0) vec4f {return vec4f(sampleScene(pos.xy),1.);}
${splashWGSL}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
let p=pos.xy;var local=(p-u.a.zw)/(1.-u.c.z*.06);
let axis=normalize(u.c.xy+vec2f(.0001));local-=axis*dot(local,axis)*min(length(u.c.xy)*.06,.16);
let surface=liquidField(local,u.b.xy,u.b.z,u.h.z);let sdf=surface.x;
var base=sampleScene(p);let ratio=u.d.w;
let shadow=exp(-max(sdf,0.)/(18.*ratio))*.065*smoothstep(-2.*ratio,2.*ratio,sdf);
let wakeCenter=u.a.zw+vec2f(cos(u.e.y),sin(u.e.y))*u.b.x*.2+u.c.xy*8.*ratio;
let wake=exp(-pow((length((p-wakeCenter)/vec2f(1.25,.62))-u.b.x*.95)/(18.*ratio),2.))*.055*(.2+u.c.z+u.d.z);
base=base*(1.-shadow)+vec3f(wake);
if(sdf<1.5*ratio){let n=surface.yz;let r=clamp(length(n),0.,1.);let slope=n*.78*mix(1.,.2,u.e.w)/max(1.,length(n));
let z=sqrt(max(.06,1.-dot(slope,slope)));let normal=normalize(vec3f(slope,z));let ray=refract(vec3f(0.,0.,-1.),normal,1./u.b.w);
let offset=clamp(ray.xy/max(.2,-ray.z)*u.c.w*ratio*u.e.x*.72,vec2f(-u.c.w*ratio*.5),vec2f(u.c.w*ratio*.5));
let portalBend=mix(1.,.3+.7*smoothstep(.6,1.,r),u.e.z);
let refracted=p+offset*portalBend*surface.w+u.c.xy*ratio*2.+ripple(p);let frost=u.d.x*(3.+u.e.x*12.)*ratio*mix(1.,.18+.82*smoothstep(.12,.85,u.d.x),u.e.z);
var glass=sampleGlass(refracted)*.4;
glass+=(sampleGlass(refracted+vec2f(frost,0.))+sampleGlass(refracted-vec2f(frost,0.))+sampleGlass(refracted+vec2f(0.,frost))+sampleGlass(refracted-vec2f(0.,frost)))*.15;
let f0=pow((u.b.w-1.)/(u.b.w+1.),2.);let fresnel=select(f0+(1.-f0)*pow(1.-normal.z,5.),0.,u.b.w<=1.0001);
let light=normalize(vec3f(cos(u.e.y)*.85,sin(u.e.y)*.85,.8));
let spec=pow(max(dot(reflect(vec3f(0.,0.,-1.),normal),light),0.),mix(95.,9.,u.d.x));
let edge=exp(-abs(sdf)/(1.15*ratio));let rim=exp(-abs(sdf+4.*ratio)/(3.*ratio));let facing=max(dot(normalize(local+vec2f(.001)),normalize(light.xy)),0.);
glass=mix(glass,vec3f(.94),min(.3,fresnel*.75+u.d.x*.12));glass+=vec3f(spec*min(1.,sqrt(f0)*5.)*(.24+.08*u.d.z)*(1.-u.d.x*.5)+edge*(.11+.38*facing)+rim*facing*.07);glass-=vec3f(exp(-abs(sdf+1.8*ratio)/(1.1*ratio))*.07*(1.-facing));
if(u.d.y>.5){glass=sampleGlass(p);}return vec4f(orb(p,mix(base,glass,1.-smoothstep(-.8*ratio,1.2*ratio,sdf))),1.);
}return vec4f(orb(p,base),1.);
}`;

export const glBackground = `#version 300 es
precision highp float;
uniform sampler2D scene; uniform vec4 a; out vec4 color;
void main(){color=texture(scene,vec2(gl_FragCoord.x,a.y-gl_FragCoord.y)/a.xy);}`;
