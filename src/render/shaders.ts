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
vec2 p=vec2(gl_FragCoord.x,a.y-gl_FragCoord.y);vec2 local=p-a.zw;
local/=1.-c.z*.06;
vec2 axis=normalize(c.xy+vec2(.0001));local-=axis*dot(local,axis)*min(length(c.xy)*.06,.16);
vec2 q=abs(local)-b.xy+vec2(b.z);float sdf=length(max(q,0.))+min(max(q.x,q.y),0.)-b.z;
vec3 base=sampleScene(p);
float outside=max(sdf,0.);float shadow=exp(-outside/23.)*.12*(1.-smoothstep(-2.,1.,sdf));
float wake=exp(-pow((length((p-a.zw-vec2(c.x,c.y)*8.)/vec2(1.3,.5))-b.x*1.05)/18.,2.))*.055*(.25+d.z);
base=base*(1.-shadow)+vec3(wake);
if(sdf<1.5){
vec2 n=local/max(b.xy,vec2(1.));float r=clamp(length(n),0.,1.);float bend=(b.w-1.)*(.15+.65*pow(r,3.));
vec2 refracted=p-local*bend+vec2(c.x,c.y)*2.;
float frost=d.x*9.;vec3 glass=sampleScene(refracted)*.4;
glass+=(sampleScene(refracted+vec2(frost,0.))+sampleScene(refracted-vec2(frost,0.))+sampleScene(refracted+vec2(0.,frost))+sampleScene(refracted-vec2(0.,frost)))*.15;
float edge=exp(-abs(sdf)/1.3);float rim=exp(-abs(sdf+5.)/4.);float fresnel=pow(r,5.);
float light=clamp(dot(normalize(local+vec2(.01)),normalize(vec2(-.65,-.85))),0.,1.);
glass=mix(glass,vec3(.93),fresnel*.09+d.x*.18);glass+=vec3(edge*(.18+.38*light)+rim*light*.1);glass-=vec3(exp(-abs(sdf+1.8)/1.1)*.09*(1.-light));
glass+=vec3(exp(-pow((n.x+.36)/.18,2.)-pow((n.y+.68)/.08,2.))*.13);
if(d.y>.5)glass=sampleScene(p);color=vec4(mix(base,glass,1.-smoothstep(-.8,1.2,sdf)),1.);
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
fn sampleScene(p:vec2f)->vec3f { return textureSampleLevel(scene,smp,clamp(p/u.a.xy,vec2f(.001),vec2f(.999)),0.).rgb; }
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
let p=pos.xy;var local=(p-u.a.zw)/(1.-u.c.z*.06);let axis=normalize(u.c.xy+vec2f(.0001));local-=axis*dot(local,axis)*min(length(u.c.xy)*.06,.16);
let q=abs(local)-u.b.xy+vec2f(u.b.z);let sdf=length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-u.b.z;
var base=sampleScene(p);let outside=max(sdf,0.);let shadow=exp(-outside/23.)*.12*(1.-smoothstep(-2.,1.,sdf));
let wake=exp(-pow((length((p-u.a.zw-u.c.xy*8.)/vec2f(1.3,.5))-u.b.x*1.05)/18.,2.))*.055*(.25+u.d.z);base=base*(1.-shadow)+vec3f(wake);
if(sdf<1.5){let n=local/max(u.b.xy,vec2f(1.));let r=clamp(length(n),0.,1.);let bend=(u.b.w-1.)*(.15+.65*pow(r,3.));let refracted=p-local*bend+u.c.xy*2.;let frost=u.d.x*9.;
var glass=sampleScene(refracted)*.4;glass+=(sampleScene(refracted+vec2f(frost,0.))+sampleScene(refracted-vec2f(frost,0.))+sampleScene(refracted+vec2f(0.,frost))+sampleScene(refracted-vec2f(0.,frost)))*.15;
let edge=exp(-abs(sdf)/1.3);let rim=exp(-abs(sdf+5.)/4.);let fresnel=pow(r,5.);let light=clamp(dot(normalize(local+vec2f(.01)),normalize(vec2f(-.65,-.85))),0.,1.);
glass=mix(glass,vec3f(.93),fresnel*.09+u.d.x*.18);glass+=vec3f(edge*(.18+.38*light)+rim*light*.1);glass-=vec3f(exp(-abs(sdf+1.8)/1.1)*.09*(1.-light));glass+=vec3f(exp(-pow((n.x+.36)/.18,2.)-pow((n.y+.68)/.08,2.))*.13);
if(u.d.y>.5){glass=sampleScene(p);}return vec4f(mix(base,glass,1.-smoothstep(-.8,1.2,sdf)),1.);
}return vec4f(base,1.);
}`;
