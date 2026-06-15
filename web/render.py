#!/usr/bin/env python3
# Single source of truth for the datapath diagram geometry.
# Renders a static PNG (for inspection) and can regenerate datapath.html.
import json, sys, re, cairosvg

src = open("trace.js").read()
raw = src[src.index("["):src.rindex("]")+1]
raw = re.sub(r",(\s*])", r"\1", raw)   # drop trailing commas
TRACE = json.loads(raw)

# ---------- geometry ----------
# boxes: x,y,w,h,title,tx,ty[,title2,tx2,ty2]
BOXES = [
  [120,232,46,52,"PC",143,262],
  [188,204,38,28,"+4",207,222],
  [180,316,84,158,"IMEM",222,334],
  [354,300,168,226,"RegFile",438,324],
  [430,540,78,44,"Imm",469,558,"Gen",469,572],
  [624,394,92,44,"Branch",670,411,"Comp",670,425],
  [908,300,148,226,"DMEM",982,324],
]
CLK = [[150,278],[505,516],[1040,516]]
ALU = "M788,300 L840,300 L872,357 L872,373 L840,430 L788,430 L788,375 L806,365 L788,355 Z"
MUX = {
 "pcsel":{"pts":"30,222 70,236 70,276 30,290","idx":[["0",40,240],["1",40,272]]},
 "asel" :{"pts":"724,326 752,338 752,392 724,404","idx":[["1",730,344],["0",730,390]]},
 "bsel" :{"pts":"724,438 752,450 752,504 724,516","idx":[["0",730,456],["1",730,502]]},
 "wbsel":{"pts":"1126,366 1154,378 1154,452 1126,464","idx":[["1",1132,384],["2",1132,418],["0",1132,450]]},
}
# text: x,y,text,cls,anchor
TEXT = [
  [600,34,"Single-Cycle Datapath Diagram","title","middle"],
  [198,410,"addr","port","start"],[244,386,"inst","port","end"],
  [360,320,"wdata","port","start"],[360,388,"rd","port","start"],[360,432,"rs1","port","start"],[360,476,"rs2","port","start"],[360,518,"RegWEn","port","start"],
  [515,382,"rdata1","port","end"],[515,458,"rdata2","port","end"],
  [916,378,"addr","port","start"],[916,512,"wdata","port","start"],[1050,452,"rdata","port","end"],[982,548,"MemRW","port","middle"],
  [803,334,"A","port","middle"],[800,408,"B","port","middle"],[824,402,"ALU","lbl","middle"],
  [22,238,"PC+4","sig","end"],[22,274,"ALU","sig","end"],
  [1086,384,"ALU","sig","end"],[1086,418,"PC+4","sig","end"],[1086,450,"Mem","sig","end"],
  [300,378,"inst[11:7]","bit","start"],[300,422,"inst[19:15]","bit","start"],[300,466,"inst[24:20]","bit","start"],[300,556,"inst[31:7]","bit","start"],
  [586,128,"wdata","sig","middle"],[586,150,"ALU","sig","middle"],[586,172,"PC+4","sig","middle"],[586,254,"PC","sig","middle"],
]
# bottom control: xCenter,w,label,sig,topY
CTRL = [
  [104,60,"PCSel","PCSel",290],[300,128,"inst[31:0]","",624],[398,80,"RegWEn","RegWEn",518],
  [476,76,"ImmSel","ImmSel",584],[652,30,"BrUn","BrUn",438],[682,28,"BrEq","BrEq",438],
  [712,28,"BrLT","BrLt",438],[744,34,"BSel","BSel",516],[780,30,"ASel","ASel",404,738],
  [832,66,"ALUSel","ALUSel",430],[982,68,"MemRW","MemRW",526],[1140,80,"WBSel","WBSel",464],
]
# wires: pts, signal, [vx,vy]
WIRES = [
  ([[70,256],[120,256]],"NextPC",[90,250]),
  ([[166,258],[207,258]],"PC",None),
  ([[207,258],[207,232]],"PC",None),
  ([[207,204],[207,180]],"PCp4",None),
  ([[168,258],[168,410],[180,410]],"PC",None),
  ([[207,258],[715,258],[715,338],[724,338]],"PC",None),
  ([[264,386],[300,386]],"inst",None),
  ([[300,386],[300,624]],"inst",None),
  ([[300,386],[354,386]],"inst",None),
  ([[300,430],[354,430]],"inst",None),
  ([[300,474],[354,474]],"inst",None),
  ([[300,560],[430,560]],"inst",None),
  ([[522,382],[724,382],[724,388]],"rd1",[560,376]),
  ([[600,382],[600,400],[624,400]],"rd1",None),
  ([[522,458],[724,458],[724,456]],"rd2",[560,452]),
  ([[600,458],[600,432],[624,432]],"rd2",None),
  ([[640,458],[640,536],[890,536],[890,510],[908,510]],"rd2",None),
  ([[508,562],[724,562],[724,502]],"imm",[560,556]),
  ([[752,365],[772,365],[772,330],[788,330]],"A",[758,360]),
  ([[752,477],[770,477],[770,400],[788,400]],"B",[762,472]),
  ([[872,365],[885,365]],"ALU",None),
  ([[885,365],[885,150]],"ALU",None),
  ([[885,365],[885,378],[908,378]],"ALU",[892,372]),
  ([[1056,452],[1100,452],[1100,450],[1126,450]],"mem",[1070,446]),
  ([[1100,150],[1100,384],[1126,384]],"ALU",None),
  ([[1110,180],[1110,418],[1126,418]],"PCp4",None),
  ([[1154,415],[1175,415],[1175,128],[340,128],[340,320],[354,320]],"wdata",[652,124]),
  ([[885,150],[10,150],[10,274],[30,274]],"ALU",None),
  ([[207,180],[20,180],[20,238],[30,238]],"PCp4",None),
  ([[207,180],[1110,180]],"PCp4",None),
]
# junction dots where wires branch
JUNC=[[207,258],[168,258],[300,386],[300,430],[300,474],[300,560],[600,382],
      [600,458],[640,458],[885,365],[1100,150],[1110,180],[207,180]]

VALMAP={"NextPC":"NextPC","PC":"expc","PCp4":"expcp4","inst":"exi","rd1":"ReadData1","rd2":"ReadData2",
 "imm":"Immediate","A":"ASelOut","B":"BSelOut","ALU":"ALUResult","mem":"DataToReg","wdata":"WriteData"}
def uval(t,s): return int(t.get(VALMAP[s],0)) & 0xffffffff
def signed(v): return v-(1<<32) if v>=(1<<31) else v
def hexs(v): return "0x%08x"%(v&0xffffffff)
ABI=["zero","ra","sp","gp","tp","t0","t1","t2","s0","s1","a0","a1","a2","a3","a4","a5","a6","a7","s2","s3","s4","s5","s6","s7","s8","s9","s10","s11","t3","t4","t5","t6"]
def disasm(w):
    if w==0 or w==0x13: return "nop"
    op=w&127; rd=(w>>7)&31; f3=(w>>12)&7; rs1=(w>>15)&31; rs2=(w>>20)&31; sg=signed(w)>>20
    if op==0x33:
        m={0:"add",1:"sll",2:"slt",3:"sltu",4:"xor",5:"srl",6:"or",7:"and"}[f3]
        if f3==0 and (w>>30)&1: m="sub"
        if f3==5 and (w>>30)&1: m="sra"
        if ((w>>25)&127)==1: m=["mul","mulh","mulhsu","mulhu","div","divu","rem","remu"][f3]
        return "%s %s, %s, %s"%(m,ABI[rd],ABI[rs1],ABI[rs2])
    if op==0x13: return "%s %s, %s, %d"%({0:"addi",1:"slli",2:"slti",3:"sltiu",4:"xori",5:"srli",6:"ori",7:"andi"}[f3],ABI[rd],ABI[rs1],sg)
    if op==0x03: return "%s %s, %d(%s)"%({0:"lb",1:"lh",2:"lw",4:"lbu",5:"lhu"}[f3],ABI[rd],sg,ABI[rs1])
    if op==0x23: return "%s %s, (%s)"%({0:"sb",1:"sh",2:"sw"}[f3],ABI[rs2],ABI[rs1])
    if op==0x63: return "%s %s, %s"%({0:"beq",1:"bne",4:"blt",5:"bge",6:"bltu",7:"bgeu"}[f3],ABI[rs1],ABI[rs2])
    if op==0x6f: return "jal %s"%ABI[rd]
    if op==0x67: return "jalr %s, %s"%(ABI[rd],ABI[rs1])
    if op==0x37: return "lui %s"%ABI[rd]
    if op==0x17: return "auipc %s"%ABI[rd]
    return hexs(w)

CSS = """
.box{fill:none;stroke:#222;stroke-width:1.4}.alu{fill:none;stroke:#222;stroke-width:1.4}
.mux{fill:none;stroke:#222;stroke-width:1.4}.mux.fire{stroke:#cf222e;stroke-width:2.4}
.wire{stroke:#222;stroke-width:1.2;fill:none}.wire.on{stroke:#1a7f37;stroke-width:2}
.title{font:600 18px Arial;text-anchor:middle;fill:#1a1a1a}
.lbl{font:13px Arial;fill:#1a1a1a}.port{font:11px Arial;fill:#1a1a1a}
.bit{font:10px Arial;fill:#555}.idx{font:11px Arial;fill:#1a1a1a}
.sig{font:11px Arial;fill:#555}.ctl{font:10.5px Arial;fill:#1a1a1a;text-anchor:middle}
.val{font:700 10px Consolas,monospace;fill:#1a7f37}
"""
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
CW={"title":9.0,"lbl":7.0,"port":6.0,"bit":5.2,"idx":6.0,"sig":6.0,"ctl":5.5}
def T(x,y,s,cls,anchor="start"):
    s=esc(s); w=len(s)*CW.get(cls,6.0)
    rx=x-w/2 if anchor=="middle" else (x-w if anchor=="end" else x)
    return ('<rect x="%g" y="%g" width="%g" height="13" fill="#fff"/>'%(rx-1.5,y-11,w+3)
            +'<text class="%s" x="%d" y="%d" text-anchor="%s">%s</text>'%(cls,x,y,anchor,s))

def build_svg(t=None):
    o=['<svg viewBox="-32 0 1240 660" xmlns="http://www.w3.org/2000/svg" style="background:#fff">']
    o.append("<style>%s</style>"%CSS)
    for i,(pts,s,vp) in enumerate(WIRES):
        d="M"+" L".join("%d,%d"%(p[0],p[1]) for p in pts)
        on=" on" if (t and uval(t,s)!=0) else ""
        o.append('<path id="w%d" class="wire%s" d="%s"/>'%(i,on,d))
        if vp:
            txt=""
            if t:
                v=uval(t,s)
                if v!=0: txt=hexs(v) if s in("PC","PCp4","inst") else str(signed(v))
            o.append('<rect id="vb%d" x="%d" y="%d" width="38" height="12" fill="#fff" opacity="%d"/>'%(i,vp[0]-3,vp[1]-10,1 if txt else 0))
            o.append('<text id="v%d" class="val" x="%d" y="%d">%s</text>'%(i,vp[0],vp[1],esc(txt)))
    for b in BOXES:
        o.append('<rect class="box" x="%d" y="%d" width="%d" height="%d"/>'%(b[0],b[1],b[2],b[3]))
        o.append(T(b[5],b[6],b[4],"lbl","middle"))
        if len(b)>7: o.append(T(b[8],b[9],b[7],"lbl","middle"))
    for c in CLK: o.append('<path class="box" d="M%d,%d l8,-9 l8,9 z"/>'%(c[0],c[1]))
    o.append('<path class="alu" d="%s"/>'%ALU)
    for k,m in MUX.items():
        fire=" fire" if (t and k=="pcsel" and t["PCSel"]==1) else ""
        o.append('<polygon id="mux_%s" class="mux%s" points="%s"/>'%(k,fire,m["pts"]))
        for lab,x,y in m["idx"]: o.append(T(x,y,lab,"idx"))
    for tx in TEXT:
        o.append(T(tx[0],tx[1],tx[2],tx[3],tx[4]))
    for c in CTRL:
        x=c[0]-c[1]//2
        o.append('<rect class="box" x="%d" y="624" width="%d" height="22"/>'%(x,c[1]))
        o.append(T(c[0],639,c[2],"ctl","middle"))
        tgt=c[5] if len(c)>5 else c[0]
        if tgt==c[0]:
            o.append('<path class="wire" d="M%d,624 L%d,%d"/>'%(c[0],c[0],c[4]))
        else:
            o.append('<path class="wire" d="M%d,624 L%d,%d L%d,%d L%d,%d"/>'%(c[0],c[0],c[4]+12,tgt,c[4]+12,tgt,c[4]))
    for j in JUNC:
        o.append('<circle cx="%d" cy="%d" r="3" fill="#222"/>'%(j[0],j[1]))
    o.append("</svg>")
    return "\n".join(o)

def frame(t):
    on=[i for i,(p,s,vp) in enumerate(WIRES) if uval(t,s)!=0]
    vals={i:(hexs(uval(t,s)) if s in("PC","PCp4","inst") else str(signed(uval(t,s)))) for i,(p,s,vp) in enumerate(WIRES) if vp and uval(t,s)!=0}
    return {"on":on,"vals":vals,"fire":t["PCSel"]==1,"asm":disasm(t["exi"])+"   PC="+hexs(t["expc"]),"cyc":t["cyc"]}
FRAMES=[frame(t) for t in TRACE]

HEAD='''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>RISC-V datapath</title>
<style>
body{margin:0;background:#fff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif}
header{padding:10px 16px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
h1{font-size:14px;margin:0}
button{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:5px 11px;cursor:pointer;font:inherit;font-size:13px}
button:hover{border-color:#0969da}button.primary{background:#0969da;color:#fff;border-color:#0969da}
input[type=range]{width:120px;accent-color:#0969da}
.cyc{color:#0969da;font-weight:700;min-width:118px;font-size:13px}
.asm{color:#cf222e;font-weight:600;font-family:Consolas,monospace;font-size:13px}
svg{width:100%;height:auto;display:block}
</style></head><body>
<header><h1>RISC-V single-cycle datapath <span style="color:#777;font-weight:400">- your circuit, running live</span></h1>
<div style="display:flex;gap:7px;align-items:center">
<button id="reset">⟲ reset</button><button id="back">◀ step</button>
<button id="play" class="primary">▶ play</button><button id="fwd">step ▶</button>
<input type="range" id="speed" min="1" max="20" value="6"></div>
<div class="cyc" id="cyc">cycle 0</div><div class="asm" id="asm">&nbsp;</div></header>
'''
JS='''
const $=id=>document.getElementById(id);
function show(i){const f=FRAMES[i];
 $("cyc").textContent="cycle "+f.cyc+" / "+FRAMES.length;$("asm").textContent=f.asm;
 document.querySelectorAll(".wire").forEach(e=>e.classList.remove("on"));
 f.on.forEach(k=>{const e=$("w"+k);if(e)e.classList.add("on");});
 document.querySelectorAll("[id^=vb]").forEach(b=>b.setAttribute("opacity",0));
 document.querySelectorAll(".val").forEach(e=>e.textContent="");
 for(const k in f.vals){const e=$("v"+k);if(e)e.textContent=f.vals[k];const b=$("vb"+k);if(b)b.setAttribute("opacity",1);}
 const m=$("mux_pcsel");if(m)m.classList.toggle("fire",f.fire);}
let cur=0,timer=null;
function go(i){cur=Math.max(0,Math.min(FRAMES.length-1,i));show(cur);}
function pp(){const b=$("play");if(timer){clearInterval(timer);timer=null;b.textContent="▶ play";b.classList.add("primary");return;}
 b.textContent="❚❚ pause";b.classList.remove("primary");
 timer=setInterval(()=>{cur>=FRAMES.length-1?go(0):go(cur+1);},1100-$("speed").value*50);}
$("fwd").onclick=()=>go(cur+1);$("back").onclick=()=>go(cur-1);
$("reset").onclick=()=>{if(timer)pp();go(0);};$("play").onclick=pp;
$("speed").oninput=()=>{if(timer){pp();pp();}};
go(0);
'''
def build_html():
    svg=build_svg(None)
    html=HEAD+svg+"\n<script>\nconst FRAMES="+json.dumps(FRAMES,separators=(",",":"))+";\n"+JS+"\n</script>\n</body></html>"
    open("datapath.html","w").write(html)
    print("wrote datapath.html (",len(FRAMES),"cycles )")

cyc = int(sys.argv[1]) if len(sys.argv)>1 else 6
svg = build_svg(None if cyc==0 else TRACE[cyc-1])
cairosvg.svg2png(bytestring=svg.encode(), write_to="render.png", output_width=1900, background_color="white")
print("wrote render.png for cycle", cyc, "(", len(WIRES), "wires )")
build_html()
