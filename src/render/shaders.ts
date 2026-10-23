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
// Static value noise gives the amber sphere fine inclusions without an idle loop.
float solarHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float solarNoise(vec2 p){vec2 i=floor(p),t=fract(p);t=t*t*(3.-2.*t);return mix(mix(solarHash(i),solarHash(i+vec2(1.,0.)),t.x),mix(solarHash(i+vec2(0.,1.)),solarHash(i+vec2(1.)),t.x),t.y);}
vec3 orb(vec2 p,vec3 background){
if(g.y<.001||f.z<1.)return background;
vec2 delta=p-f.xy;float cs=cos(g.x),sn=sin(g.x);
vec2 stretch=vec2(1./f.w,sqrt(f.w));
vec2 q=vec2(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y)*stretch;
float dist=length(q),r=dist/f.z;
vec2 lightDir=vec2(cos(e.y),sin(e.y));
vec2 localLight=vec2(cs*lightDir.x+sn*lightDir.y,-sn*lightDir.x+cs*lightDir.y)*stretch;
float shadowDistance=length(q+localLight*f.z*.48)-f.z;
float outside=smoothstep(-.6*d.w,1.2*d.w,dist-f.z);
float shadow=exp(-max(shadowDistance,0.)/(f.z*.22))*.19*outside*g.y;
vec3 base=background*(1.-vec3(1.,.96,.88)*shadow);
float halo=exp(-pow(max(dist-f.z,0.)/(f.z*.48),2.))*.12*outside*g.y;
base+=vec3(1.,.38,.045)*halo;
if(r>1.03)return base;
vec2 n=q/f.z;float z=sqrt(max(.001,1.-min(dot(n,n),1.)));
vec2 sphereNormal=n*stretch;
vec3 normal=normalize(vec3(cs*sphereNormal.x-sn*sphereNormal.y,sn*sphereNormal.x+cs*sphereNormal.y,z));
vec3 light=normalize(vec3(lightDir*.75,.9));
float key=max(dot(normal,light),0.);
float reflection=pow(key,72.)*.85+pow(key,9.)*.13;
float fresnel=.04+.96*pow(1.-z,5.);
vec2 grainUV=n/(z+.65);
float granules=solarNoise(grainUV*19.+solarNoise(grainUV*6.)*.8)-.5;
vec3 solar=mix(vec3(.82,.115,.008),vec3(1.,.56,.045),pow(z,.65));
vec3 transmitted=sampleGlass(a.zw+delta*mix(1.5,.45,z));
vec3 glass=mix(transmitted*vec3(1.,.51,.12),solar,.78);
glass*=.82+.18*key;glass+=vec3(1.,.51,.08)*granules*.11*z;
glass=mix(glass,vec3(1.,.75,.32),fresnel*.48);
glass+=vec3(1.,.96,.79)*reflection;
float edge=exp(-pow((r-.975)/.018,2.));
glass+=vec3(1.,.87,.49)*edge*(.06+.37*max(dot(normal.xy,lightDir),0.));
return mix(base,glass,g.y*(1.-smoothstep(.98,1.02,r)));
}
${splashGLSL}
void main(){
vec2 p=vec2(gl_FragCoord.x,a.y-gl_FragCoord.y),local=p-a.zw;
local/=1.-c.z*.06;
vec2 axis=normalize(c.xy+vec2(.0001));local-=axis*dot(local,axis)*min(length(c.xy)*.06,.16);
vec4 surface=liquidField(local,b.xy,b.z,h.z);float sdf=surface.x;
vec3 base=sampleScene(p);float ratio=d.w;
// Screen derivatives follow every island's actual contour, including tiny droplets.
vec2 edgeNormal=normalize(vec2(dFdx(sdf),-dFdy(sdf))+vec2(.00001));
float aa=clamp(fwidth(sdf),.65*ratio,1.5*ratio);
vec2 lightDir=vec2(cos(e.y),sin(e.y));
float f0=pow((b.w-1.)/(b.w+1.),2.);
float material=d.y>.5?0.:min(1.,sqrt(f0)*5.);
float relief=material*(1.-e.w);
float size=min(b.x,b.y)*surface.w;
float bevel=clamp(size*.065,.8*ratio,7.*ratio)*mix(1.,.35,e.w);
if(sdf>-aa&&sdf<64.*ratio&&relief>.001){
float outside=smoothstep(-aa,aa,sdf);
float shadow=(liquidShadow(local,b.xy,b.z,h.z,lightDir,ratio)+exp(-max(sdf,0.)/(1.5*ratio))*.08)*outside*relief;
base*=1.-vec3(1.,.96,.88)*shadow;
float caustic=exp(-pow((sdf-3.*ratio)/(2.2*ratio),2.))*max(dot(edgeNormal,-lightDir),0.)*.025*outside*relief;
base+=vec3(1.,.88,.65)*caustic;
}
if(sdf<1.5*ratio){
vec2 n=mix(surface.yz,edgeNormal*min(length(surface.yz),1.),smoothstep(-bevel*2.,0.,sdf));float r=clamp(length(n),0.,1.);
vec2 slope=n*.78*mix(1.,.2,e.w)/max(1.,length(n));float z=sqrt(max(.06,1.-dot(slope,slope)));
vec3 normal=normalize(vec3(slope,z));vec3 ray=refract(vec3(0.,0.,-1.),normal,1./b.w);
vec2 offset=clamp(ray.xy/max(.2,-ray.z)*c.w*ratio*e.x*.72,vec2(-c.w*ratio*.5),vec2(c.w*ratio*.5));
float portalBend=mix(1.,.3+.7*smoothstep(.6,1.,r),e.z);
vec2 refracted=p+offset*portalBend*surface.w+c.xy*ratio*2.+ripple(p);float frost=d.x*(3.+e.x*12.)*ratio*mix(1.,.18+.82*smoothstep(.12,.85,d.x),e.z);
vec3 glass=sampleGlass(refracted)*.4;
glass+=(sampleGlass(refracted+vec2(frost,0.))+sampleGlass(refracted-vec2(frost,0.))+sampleGlass(refracted+vec2(0.,frost))+sampleGlass(refracted-vec2(0.,frost)))*.15;
float fresnel=b.w<=1.0001?0.:f0+(1.-f0)*pow(1.-normal.z,5.);
vec3 light=normalize(vec3(cos(e.y)*.85,sin(e.y)*.85,.8));
float spec=pow(max(dot(reflect(vec3(0.,0.,-1.),normal),light),0.),mix(95.,9.,d.x));
float facing=dot(edgeNormal,lightDir);
float edge=exp(-pow((sdf+.25*ratio)/(.75*ratio),2.));
float shoulder=exp(-pow((sdf+bevel*.46)/(bevel*.55),2.));
float inner=exp(-pow((sdf+bevel*.98)/(bevel*.23+.3*ratio),2.));
float key=smoothstep(-.3,.85,facing),fill=smoothstep(-.4,.9,-facing);
glass=mix(glass,vec3(.96,.975,1.),min(.3,fresnel*.75+d.x*.12));
glass*=1.-material*inner*(.035+.105*fill);
glass=mix(glass,vec3(.94,.97,1.),shoulder*(.035+.18*key)*material*(1.-d.x*.45));
glass+=vec3(1.,.98,.92)*material*(edge*(.06+.46*key)+shoulder*pow(max(facing,0.),10.)*.14);
glass+=vec3(spec*material*(.24+.08*d.z)*(1.-d.x*.5));
if(d.y>.5)glass=sampleGlass(p);
color=vec4(mix(base,glass,1.-smoothstep(-aa,aa,sdf)),1.);
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
fn solarHash(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn solarNoise(p:vec2f)->f32{let i=floor(p);var t=fract(p);t=t*t*(3.-2.*t);return mix(mix(solarHash(i),solarHash(i+vec2f(1.,0.)),t.x),mix(solarHash(i+vec2f(0.,1.)),solarHash(i+vec2f(1.)),t.x),t.y);}
fn orb(p:vec2f,background:vec3f)->vec3f{
if(u.g.y<.001||u.f.z<1.){return background;}
let delta=p-u.f.xy;let cs=cos(u.g.x);let sn=sin(u.g.x);
let stretch=vec2f(1./u.f.w,sqrt(u.f.w));
let q=vec2f(cs*delta.x+sn*delta.y,-sn*delta.x+cs*delta.y)*stretch;
let dist=length(q);let r=dist/u.f.z;
let lightDir=vec2f(cos(u.e.y),sin(u.e.y));
let localLight=vec2f(cs*lightDir.x+sn*lightDir.y,-sn*lightDir.x+cs*lightDir.y)*stretch;
let shadowDistance=length(q+localLight*u.f.z*.48)-u.f.z;
let outside=smoothstep(-.6*u.d.w,1.2*u.d.w,dist-u.f.z);
let shadow=exp(-max(shadowDistance,0.)/(u.f.z*.22))*.19*outside*u.g.y;
var base=background*(1.-vec3f(1.,.96,.88)*shadow);
let halo=exp(-pow(max(dist-u.f.z,0.)/(u.f.z*.48),2.))*.12*outside*u.g.y;
base+=vec3f(1.,.38,.045)*halo;
if(r>1.03){return base;}
let n=q/u.f.z;let z=sqrt(max(.001,1.-min(dot(n,n),1.)));
let sphereNormal=n*stretch;
let normal=normalize(vec3f(cs*sphereNormal.x-sn*sphereNormal.y,sn*sphereNormal.x+cs*sphereNormal.y,z));
let light=normalize(vec3f(lightDir*.75,.9));let key=max(dot(normal,light),0.);
let reflection=pow(key,72.)*.85+pow(key,9.)*.13;
let fresnel=.04+.96*pow(1.-z,5.);
let grainUV=n/(z+.65);let granules=solarNoise(grainUV*19.+solarNoise(grainUV*6.)*.8)-.5;
let solar=mix(vec3f(.82,.115,.008),vec3f(1.,.56,.045),pow(z,.65));
let transmitted=sampleGlass(u.a.zw+delta*mix(1.5,.45,z));
var glass=mix(transmitted*vec3f(1.,.51,.12),solar,.78);
glass*=.82+.18*key;glass+=vec3f(1.,.51,.08)*granules*.11*z;
glass=mix(glass,vec3f(1.,.75,.32),fresnel*.48);
glass+=vec3f(1.,.96,.79)*reflection;
let edge=exp(-pow((r-.975)/.018,2.));
glass+=vec3f(1.,.87,.49)*edge*(.06+.37*max(dot(normal.xy,lightDir),0.));
return mix(base,glass,u.g.y*(1.-smoothstep(.98,1.02,r)));
}
@fragment fn fsBackground(@builtin(position) pos:vec4f)->@location(0) vec4f {return vec4f(sampleScene(pos.xy),1.);}
${splashWGSL}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
let p=pos.xy;var local=(p-u.a.zw)/(1.-u.c.z*.06);
let axis=normalize(u.c.xy+vec2f(.0001));local-=axis*dot(local,axis)*min(length(u.c.xy)*.06,.16);
let surface=liquidField(local,u.b.xy,u.b.z,u.h.z);let sdf=surface.x;
var base=sampleScene(p);let ratio=u.d.w;
let edgeNormal=normalize(vec2f(dpdx(sdf),dpdy(sdf))+vec2f(.00001));
let aa=clamp(fwidth(sdf),.65*ratio,1.5*ratio);
let lightDir=vec2f(cos(u.e.y),sin(u.e.y));
let f0=pow((u.b.w-1.)/(u.b.w+1.),2.);
let material=select(min(1.,sqrt(f0)*5.),0.,u.d.y>.5);
let relief=material*(1.-u.e.w);
let size=min(u.b.x,u.b.y)*surface.w;
let bevel=clamp(size*.065,.8*ratio,7.*ratio)*mix(1.,.35,u.e.w);
if(sdf> -aa&&sdf<64.*ratio&&relief>.001){
let outside=smoothstep(-aa,aa,sdf);
let shadow=(liquidShadow(local,u.b.xy,u.b.z,u.h.z,lightDir,ratio)+exp(-max(sdf,0.)/(1.5*ratio))*.08)*outside*relief;
base*=1.-vec3f(1.,.96,.88)*shadow;
let caustic=exp(-pow((sdf-3.*ratio)/(2.2*ratio),2.))*max(dot(edgeNormal,-lightDir),0.)*.025*outside*relief;
base+=vec3f(1.,.88,.65)*caustic;
}
if(sdf<1.5*ratio){let n=mix(surface.yz,edgeNormal*min(length(surface.yz),1.),smoothstep(-bevel*2.,0.,sdf));let r=clamp(length(n),0.,1.);let slope=n*.78*mix(1.,.2,u.e.w)/max(1.,length(n));
let z=sqrt(max(.06,1.-dot(slope,slope)));let normal=normalize(vec3f(slope,z));let ray=refract(vec3f(0.,0.,-1.),normal,1./u.b.w);
let offset=clamp(ray.xy/max(.2,-ray.z)*u.c.w*ratio*u.e.x*.72,vec2f(-u.c.w*ratio*.5),vec2f(u.c.w*ratio*.5));
let portalBend=mix(1.,.3+.7*smoothstep(.6,1.,r),u.e.z);
let refracted=p+offset*portalBend*surface.w+u.c.xy*ratio*2.+ripple(p);let frost=u.d.x*(3.+u.e.x*12.)*ratio*mix(1.,.18+.82*smoothstep(.12,.85,u.d.x),u.e.z);
var glass=sampleGlass(refracted)*.4;
glass+=(sampleGlass(refracted+vec2f(frost,0.))+sampleGlass(refracted-vec2f(frost,0.))+sampleGlass(refracted+vec2f(0.,frost))+sampleGlass(refracted-vec2f(0.,frost)))*.15;
let fresnel=select(f0+(1.-f0)*pow(1.-normal.z,5.),0.,u.b.w<=1.0001);
let light=normalize(vec3f(cos(u.e.y)*.85,sin(u.e.y)*.85,.8));
let spec=pow(max(dot(reflect(vec3f(0.,0.,-1.),normal),light),0.),mix(95.,9.,u.d.x));
let facing=dot(edgeNormal,lightDir);
let edge=exp(-pow((sdf+.25*ratio)/(.75*ratio),2.));
let shoulder=exp(-pow((sdf+bevel*.46)/(bevel*.55),2.));
let inner=exp(-pow((sdf+bevel*.98)/(bevel*.23+.3*ratio),2.));
let key=smoothstep(-.3,.85,facing);let fill=smoothstep(-.4,.9,-facing);
glass=mix(glass,vec3f(.96,.975,1.),min(.3,fresnel*.75+u.d.x*.12));
glass*=1.-material*inner*(.035+.105*fill);
glass=mix(glass,vec3f(.94,.97,1.),shoulder*(.035+.18*key)*material*(1.-u.d.x*.45));
glass+=vec3f(1.,.98,.92)*material*(edge*(.06+.46*key)+shoulder*pow(max(facing,0.),10.)*.14);
glass+=vec3f(spec*material*(.24+.08*u.d.z)*(1.-u.d.x*.5));
if(u.d.y>.5){glass=sampleGlass(p);}return vec4f(orb(p,mix(base,glass,1.-smoothstep(-aa,aa,sdf))),1.);
}return vec4f(orb(p,base),1.);
}`;

export const glBackground = `#version 300 es
precision highp float;
uniform sampler2D scene; uniform vec4 a; out vec4 color;
void main(){color=texture(scene,vec2(gl_FragCoord.x,a.y-gl_FragCoord.y)/a.xy);}`;
