export const glVertex = `#version 300 es
precision highp float;
const vec2 verts[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(verts[gl_VertexID],0.,1.);}`;
export const glFragment = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform vec4 a; uniform vec4 b; uniform vec4 c; uniform vec4 d; uniform vec4 e;
out vec4 color;
vec3 sampleScene(vec2 p){return texture(scene,clamp(p/a.xy,vec2(.001),vec2(.999))).rgb;}
void main(){
vec2 p=vec2(gl_FragCoord.x,a.y-gl_FragCoord.y),local=p-a.zw;
local/=1.-c.z*.06;
vec2 axis=normalize(c.xy+vec2(.0001));local-=axis*dot(local,axis)*min(length(c.xy)*.06,.16);
vec2 q=abs(local)-b.xy+vec2(b.z);float sdf=length(max(q,0.))+min(max(q.x,q.y),0.)-b.z;
vec3 base=sampleScene(p);float ratio=d.w;
float shadow=exp(-max(sdf,0.)/(18.*ratio))*.065*smoothstep(-2.*ratio,2.*ratio,sdf);
vec2 wakeCenter=a.zw+vec2(cos(e.y),sin(e.y))*b.x*.2+c.xy*8.*ratio;
float wake=exp(-pow((length((p-wakeCenter)/vec2(1.25,.62))-b.x*.95)/(18.*ratio),2.))*.055*(.2+c.z+d.z);
base=base*(1.-shadow)+vec3(wake);
if(sdf<1.5*ratio){
vec2 n=local/max(b.xy,vec2(1.));float r=clamp(length(n),0.,1.);
vec2 slope=n*.78/max(1.,length(n));float z=sqrt(max(.06,1.-dot(slope,slope)));
vec3 normal=normalize(vec3(slope,z));vec3 ray=refract(vec3(0.,0.,-1.),normal,1./b.w);
vec2 offset=clamp(ray.xy/max(.2,-ray.z)*c.w*ratio*e.x*.72,vec2(-c.w*ratio*.5),vec2(c.w*ratio*.5));
vec2 refracted=p+offset+c.xy*ratio*2.;float frost=d.x*(3.+e.x*12.)*ratio;
vec3 glass=sampleScene(refracted)*.4;
glass+=(sampleScene(refracted+vec2(frost,0.))+sampleScene(refracted-vec2(frost,0.))+sampleScene(refracted+vec2(0.,frost))+sampleScene(refracted-vec2(0.,frost)))*.15;
float f0=pow((b.w-1.)/(b.w+1.),2.);float fresnel=b.w<=1.0001?0.:f0+(1.-f0)*pow(1.-normal.z,5.);
vec3 light=normalize(vec3(cos(e.y)*.85,sin(e.y)*.85,.8));
float spec=pow(max(dot(reflect(vec3(0.,0.,-1.),normal),light),0.),mix(95.,9.,d.x));
float edge=exp(-abs(sdf)/(1.15*ratio)),rim=exp(-abs(sdf+4.*ratio)/(3.*ratio));
float facing=max(dot(normalize(local+vec2(.001)),normalize(light.xy)),0.);
glass=mix(glass,vec3(.94),min(.3,fresnel*.75+d.x*.12));
glass+=vec3(spec*min(1.,sqrt(f0)*5.)*(.24+.08*d.z)*(1.-d.x*.5)+edge*(.11+.38*facing)+rim*facing*.07);
glass-=vec3(exp(-abs(sdf+1.8*ratio)/(1.1*ratio))*.07*(1.-facing));
if(d.y>.5)glass=sampleScene(p);
color=vec4(mix(base,glass,1.-smoothstep(-.8*ratio,1.2*ratio,sdf)),1.);
}else color=vec4(base,1.);
}`;
export const wgsl = `
struct Uniforms { a:vec4f,b:vec4f,c:vec4f,d:vec4f,e:vec4f };
@group(0) @binding(0) var<uniform> u:Uniforms;
@group(0) @binding(1) var scene:texture_2d<f32>;
@group(0) @binding(2) var smp:sampler;
@vertex fn vs(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
var verts=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(verts[index],0.,1.);
}
fn sampleScene(p:vec2f)->vec3f{return textureSampleLevel(scene,smp,clamp(p/u.a.xy,vec2f(.001),vec2f(.999)),0.).rgb;}
@fragment fn fsBackground(@builtin(position) pos:vec4f)->@location(0) vec4f {return vec4f(sampleScene(pos.xy),1.);}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
let p=pos.xy;var local=(p-u.a.zw)/(1.-u.c.z*.06);
let axis=normalize(u.c.xy+vec2f(.0001));local-=axis*dot(local,axis)*min(length(u.c.xy)*.06,.16);
let q=abs(local)-u.b.xy+vec2f(u.b.z);let sdf=length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-u.b.z;
var base=sampleScene(p);let ratio=u.d.w;
let shadow=exp(-max(sdf,0.)/(18.*ratio))*.065*smoothstep(-2.*ratio,2.*ratio,sdf);
let wakeCenter=u.a.zw+vec2f(cos(u.e.y),sin(u.e.y))*u.b.x*.2+u.c.xy*8.*ratio;
let wake=exp(-pow((length((p-wakeCenter)/vec2f(1.25,.62))-u.b.x*.95)/(18.*ratio),2.))*.055*(.2+u.c.z+u.d.z);
base=base*(1.-shadow)+vec3f(wake);
if(sdf<1.5*ratio){let n=local/max(u.b.xy,vec2f(1.));let slope=n*.78/max(1.,length(n));
let z=sqrt(max(.06,1.-dot(slope,slope)));let normal=normalize(vec3f(slope,z));let ray=refract(vec3f(0.,0.,-1.),normal,1./u.b.w);
let offset=clamp(ray.xy/max(.2,-ray.z)*u.c.w*ratio*u.e.x*.72,vec2f(-u.c.w*ratio*.5),vec2f(u.c.w*ratio*.5));
let refracted=p+offset+u.c.xy*ratio*2.;let frost=u.d.x*(3.+u.e.x*12.)*ratio;
var glass=sampleScene(refracted)*.4;
glass+=(sampleScene(refracted+vec2f(frost,0.))+sampleScene(refracted-vec2f(frost,0.))+sampleScene(refracted+vec2f(0.,frost))+sampleScene(refracted-vec2f(0.,frost)))*.15;
let f0=pow((u.b.w-1.)/(u.b.w+1.),2.);let fresnel=select(f0+(1.-f0)*pow(1.-normal.z,5.),0.,u.b.w<=1.0001);
let light=normalize(vec3f(cos(u.e.y)*.85,sin(u.e.y)*.85,.8));
let spec=pow(max(dot(reflect(vec3f(0.,0.,-1.),normal),light),0.),mix(95.,9.,u.d.x));
let edge=exp(-abs(sdf)/(1.15*ratio));let rim=exp(-abs(sdf+4.*ratio)/(3.*ratio));let facing=max(dot(normalize(local+vec2f(.001)),normalize(light.xy)),0.);
glass=mix(glass,vec3f(.94),min(.3,fresnel*.75+u.d.x*.12));glass+=vec3f(spec*min(1.,sqrt(f0)*5.)*(.24+.08*u.d.z)*(1.-u.d.x*.5)+edge*(.11+.38*facing)+rim*facing*.07);glass-=vec3f(exp(-abs(sdf+1.8*ratio)/(1.1*ratio))*.07*(1.-facing));
if(u.d.y>.5){glass=sampleScene(p);}return vec4f(mix(base,glass,1.-smoothstep(-.8*ratio,1.2*ratio,sdf)),1.);
}return vec4f(base,1.);
}`;

export const glBackground = `#version 300 es
precision highp float;
uniform sampler2D scene; uniform vec4 a; out vec4 color;
void main(){color=texture(scene,vec2(gl_FragCoord.x,a.y-gl_FragCoord.y)/a.xy);}`;
