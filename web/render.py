#!/usr/bin/env python3
# Datapath geometry measured from references/single-cycle-datapath.png via extract.py,
# in the reference's own 795x475 pixel space so render.png overlays it 1:1.
import json, sys, re, cairosvg

src = open("trace.js").read()
raw = re.sub(r",(\s*])", r"\1", src[src.index("["):src.rindex("]")+1])
TRACE = json.loads(raw)

# ---------- geometry (measured, reference pixel space) ----------
# boxes: x,y,w,h,title,tx,ty[,title2,tx2,ty2]
BOXES = [
  [88,153,19,61,"PC",97,187],
  [127,145,26,14,"+4",140,156],
  [128,209,41,114,"IMEM",148,222],
  [242,187,106,167,"RegFile",295,203],
  [290,362,44,31,"Imm",312,376,"Gen",312,388],
  [422,249,57,31,"Branch",450,261,"Comp",450,276],
  [614,203,84,190,"DMEM",656,220],
]
# clock triangles (small ^ at clocked-element bottoms): x,y base
CLK = [[328,354],[681,393]]
# ALU chevron: left edge x533 (notch at y262-279), point at right
ALU = "M533,188 L576,215 L576,327 L533,354 L533,280 L544,271 L533,262 Z"
MUX = {
 "pcsel":{"pts":"58,155 69,160 69,204 58,209","idx":[["0",63.5,174],["1",63.5,197]]},
 "asel" :{"pts":"491.5,198 502.5,203 502.5,247 491.5,251","idx":[["1",497,218],["0",497,240]]},
 "bsel" :{"pts":"491.5,291 502.5,296 502.5,339 491.5,343","idx":[["0",497,310],["1",497,333]]},
 "wbsel":{"pts":"748,238 762,243 762,319 748,324","idx":[["1",755,263],["2",755,285],["0",755,307]]},
}
# arrowheads (x,y,dir): r=right l=left u=up d=down. component inputs + feedback-bus flow direction
ARROWS=[(88,181,"r"),(128,274,"r"),(242,215,"r"),(242,257,"r"),(242,289,"r"),(242,324,"r"),
 (290,377,"r"),(422,257,"r"),(422,271,"r"),(491.5,214,"r"),(491.5,236,"r"),(491.5,306,"r"),(491.5,329,"r"),
 (533,225,"r"),(533,317,"r"),(614,255,"r"),(614,359,"r"),(748,259,"r"),(748,281,"r"),(748,303,"r"),
 (58,170,"r"),(58,193,"r"),(140,159,"u"),
 (64,206.5,"u"),(497,249,"u"),(497,341,"u"),(556,340,"u"),(755,322,"u"),
 (261,354,"u"),(312,393,"u"),(427,280,"u"),(636,393,"u"),
 (192,425,"d"),(451,425,"d"),(473,425,"d")]
# feedback-bus flow direction: large OPEN chevrons (reference style, hollow not filled)
CHEV=[(464,94,"l"),(568,110,"l"),(623,110,"r"),(598,166,"u"),(164,126,"r"),(117,126,"l")]
# text: x,y,text,cls,anchor
TEXT = [
  [383,40,"Single-Cycle Datapath Diagram","title","middle"],
  [165,260,"inst","port","end"],[129,278,"addr","port","start"],
  [243,218,"wdata","port","start"],[243,260,"rd","port","start"],[243,292,"rs1","port","start"],[243,327,"rs2","port","start"],[244,349,"RegWEn","port","start"],
  [344,239,"rdata1","port","end"],[344,309,"rdata2","port","end"],
  [615,259,"addr","port","start"],[615,362,"wdata","port","start"],[694,306,"rdata","port","end"],[616,389,"MemRW","port","start"],
  [538,229,"A","port","middle",11],[538,321,"B","port","middle",11],[561,274,"ALU","lbl","middle",14],
  [55,167,"PC+4","sig","end"],[55,190,"ALU","sig","end"],
  [745,255,"ALU","sig","end"],[745,277,"PC+4","sig","end"],[745,299,"Mem","sig","end"],
  [196,253,"inst[11:7]","bit","start"],[196,285,"inst[19:15]","bit","start"],[196,320,"inst[24:20]","bit","start"],[196,373,"inst[31:7]","bit","start"],
  [395,91,"wdata","sig","middle"],[395,107,"ALU","sig","middle"],[395,123,"PC+4","sig","middle"],[396,176,"PC","sig","middle"],
]
# bottom control: xCenter,w,label,sig,topY[,targetX]
CTRL = [
  [73,47,"PCSel","PCSel",425],[206,63,"inst[31:0]","",426],[261,46,"RegWEn","RegWEn",354],
  [312,56,"ImmSel","ImmSel",393],[427,24,"BrUn","BrUn",280],[451,24,"BrEq","BrEq",280],
  [473,21,"BrLT","BrLt",280],[497,26,"BSel","BSel",425],[523,26,"ASel","ASel",425],
  [556,40,"ALUSel","ALUSel",340],[636,46,"MemRW","MemRW",393],[755,38,"WBSel","WBSel",322],
]
# custom select-wire paths matching the reference: PCSel & BSel straight, ASel jogs at y275
SELWIRES=[[[64,425],[64,206.5]],[[523,425],[523,275],[497,275],[497,249]],[[497,425],[497,341]]]
# bottom-bar dividers (incl. bar ends 50 & 771); labels are centered within their box, wires stay component-aligned
BARDIVS=[40,88,160,224,238,284,340,415,439,463,484,510,536,576,613,659,736,774]
def boxcenter(x):
    for i in range(len(BARDIVS)-1):
        if BARDIVS[i]<=x<=BARDIVS[i+1]: return (BARDIVS[i]+BARDIVS[i+1])/2.0
    return x
# wires: pts, signal, [vx,vy]
WIRES = [
  ([[69,181],[88,181]],"NextPC",[71,176]),
  ([[107,179],[447,179],[447,214],[491.5,214]],"PC",[250,174]),
  ([[140,179],[140,159]],"PC",None),
  ([[113,179],[113,274],[127,274]],"PC",None),
  ([[140,145],[140,126]],"PCp4",None),
  ([[23,126],[706,126]],"PCp4",None),
  ([[23,126],[23,170],[57,170]],"PCp4",None),
  ([[706,126],[706,281],[748,281]],"PCp4",None),
  ([[14,110],[713,110]],"ALU",None),
  ([[14,110],[14,193],[57,193]],"ALU",None),
  ([[713,110],[713,259],[748,259]],"ALU",None),
  ([[576,255],[598,255],[598,110]],"ALU",None),
  ([[598,255],[614,255]],"ALU",[601,250]),
  ([[169,257],[242,257]],"inst",None),
  ([[192,257],[192,426]],"inst",None),
  ([[192,289],[242,289]],"inst",None),
  ([[192,324],[242,324]],"inst",None),
  ([[192,377],[290,377]],"inst",None),
  ([[348,236],[491.5,236]],"rd1",[416,231]),
  ([[401,236],[401,257],[422,257]],"rd1",None),
  ([[348,306],[491.5,306]],"rd2",[416,301]),
  ([[401,306],[401,271],[422,271]],"rd2",None),
  ([[480,306],[480,359],[614,359]],"rd2",None),
  ([[335,378],[401,378],[401,329],[491.5,329]],"imm",[355,373]),
  ([[502.5,225],[533,225]],"A",[515,220]),
  ([[502.5,317],[533,317]],"B",[515,312]),
  ([[698,303],[748,303]],"mem",[705,298]),
  ([[762,281],[779,281],[779,94],[206,94],[206,215],[242,215]],"wdata",[430,90]),
]
JUNC=[[140,179],[113,179],[192,257],[192,289],[192,324],[192,377],[401,236],[401,306],[480,306],[598,255]]
TAPS=[[140,126],[598,110]]   # bidirectional bus taps: dot + outward chevrons

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
.box{fill:none;stroke:#222;stroke-width:1.1}.alu{fill:none;stroke:#222;stroke-width:1.1}
.mux{fill:none;stroke:#222;stroke-width:1.1}.mux.fire{stroke:#cf222e;stroke-width:1.6}
.wire{stroke:#222;stroke-width:1.1;fill:none}.wire.on{stroke:#1a7f37;stroke-width:1.5}
.title{font:700 22px Inter,sans-serif;text-anchor:middle;fill:#1a1a1a}
.lbl{font:16px Inter,sans-serif;fill:#1a1a1a}.lbl2{font:13px Inter,sans-serif;fill:#1a1a1a}.port{font:500 10px Inter,sans-serif;fill:#1a1a1a}
.bit{font:500 7px Inter,sans-serif;fill:#333}.idx{font:400 12px Inter,sans-serif;fill:#1a1a1a}
.sig{font:500 9px Inter,sans-serif;fill:#1a1a1a}.ctl{font:700 8px Inter,sans-serif;fill:#1a1a1a;text-anchor:middle}
.val{font:700 8px Consolas,monospace;fill:#1a7f37}
"""
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
CW={"title":10.5,"lbl":7.8,"lbl2":6.3,"port":5.5,"bit":3.3,"idx":7.0,"sig":5.0,"ctl":4.0}
def T(x,y,s,cls,anchor="start",fs=None):
    st=' style="font-size:%gpx"'%fs if fs else ''
    return '<text class="%s" x="%g" y="%g" text-anchor="%s"%s>%s</text>'%(cls,x,y,anchor,st,esc(s))
# per-box-label font-size overrides (px): reference sizes labels to its box; Inter is wider than the
# reference font, so these match the reference label/box ratios. Others keep the class default.
BFS={"IMEM":13.8,"PC":10,"+4":12,"Branch":10,"Comp":10}
def tap(x,y):   # filled circle where a riser meets a bus, as in the reference
    return '<circle cx="%g" cy="%g" r="2.5" fill="#222"/>'%(x,y)
def arrow(x,y,d):   # small filled arrowhead at a component input
    if d=="r":   p=(x-5,y-2.5,x,y,x-5,y+2.5)
    elif d=="l": p=(x+5,y-2.5,x,y,x+5,y+2.5)
    elif d=="u": p=(x-2.5,y+5,x,y,x+2.5,y+5)
    else:        p=(x-2.5,y-5,x,y,x+2.5,y-5)
    return '<polygon points="%g,%g %g,%g %g,%g" fill="#222"/>'%p
def chevron(x,y,d):   # large open chevron (feedback-bus flow), hollow strokes like the reference
    if d=="r":   a=((x-6,y-6),(x,y),(x-6,y+6))
    elif d=="l": a=((x+6,y-6),(x,y),(x+6,y+6))
    elif d=="u": a=((x-6,y+6),(x,y),(x+6,y+6))
    else:        a=((x-6,y-6),(x,y),(x+6,y-6))
    return '<polyline points="%s" fill="none" stroke="#222" stroke-width="1.3"/>'%(' '.join('%g,%g'%p for p in a))
def shorten_end(pts):   # pull a wire end back into its arrowhead so the wire never pokes past the tip
    pts=[list(p) for p in pts]
    if len(pts)<2: return pts
    for idx,adj in ((0,1),(len(pts)-1,len(pts)-2)):
        px,py=pts[idx]
        if any(abs(px-a[0])<=1.5 and abs(py-a[1])<=1.5 for a in ARROWS):
            qx,qy=pts[adj]; dx,dy=px-qx,py-qy; dd=(dx*dx+dy*dy)**0.5
            if dd>0:
                k=min(3.5,dd)/dd; pts[idx]=[px-dx*k,py-dy*k]
    return pts
def wpath(pts):
    p=shorten_end(pts); return "M"+" L".join("%g,%g"%(q[0],q[1]) for q in p)

def build_svg(t=None):
    o=['<svg viewBox="0 0 795 475" xmlns="http://www.w3.org/2000/svg" style="background:#fff">']
    o.append("<style>%s</style>"%CSS)
    for i,(pts,s,vp) in enumerate(WIRES):
        d=wpath(pts)
        on=" on" if (t and uval(t,s)!=0) else ""
        o.append('<path id="w%d" class="wire%s" d="%s"/>'%(i,on,d))
        if vp:
            txt=""
            if t:
                v=uval(t,s)
                if v!=0: txt=hexs(v) if s in("PC","PCp4","inst") else str(signed(v))
            o.append('<text id="v%d" class="val" x="%g" y="%g">%s</text>'%(i,vp[0],vp[1],esc(txt)))
    for b in BOXES:
        o.append('<rect class="box" x="%g" y="%g" width="%g" height="%g"/>'%(b[0],b[1],b[2],b[3]))
        bc="lbl" if b[4] in("IMEM","RegFile","DMEM") else "lbl2"
        o.append(T(b[5],b[6],b[4],bc,"middle",BFS.get(b[4])))
        if len(b)>7: o.append(T(b[8],b[9],b[7],bc,"middle",BFS.get(b[7])))
    for c in CLK: o.append('<path class="box" d="M%g,%g l5,-12 l5,12 z"/>'%(c[0],c[1]))
    o.append('<path class="box" d="M88,214 L97.5,197 L107,214"/>')  # PC clock triangle: base corners on the box bottom corners (no gap)
    o.append('<path class="alu" d="%s"/>'%ALU)
    for k,m in MUX.items():
        fire=" fire" if (t and k=="pcsel" and t["PCSel"]==1) else ""
        o.append('<polygon id="mux_%s" class="mux%s" points="%s"/>'%(k,fire,m["pts"]))
        for lab,x,y in m["idx"]: o.append(T(x,y,lab,"idx","middle"))
    for tx in TEXT:
        o.append(T(tx[0],tx[1],tx[2],tx[3],tx[4],tx[5] if len(tx)>5 else None))
    o.append('<rect class="box" x="40" y="425" width="734" height="14"/>')
    for dx in BARDIVS[1:-1]:
        o.append('<path class="box" d="M%g,425 L%g,439"/>'%(dx,dx))
    for c in CTRL:
        o.append(T(boxcenter(c[0]),435,c[2],"ctl","middle"))
        if not c[3]: continue   # label-only box (inst[31:0]): no control wire stub
        tgt=c[5] if len(c)>5 else c[0]
        if tgt==c[0]:
            o.append('<path class="wire" d="%s"/>'%wpath([[c[0],425],[c[0],c[4]]]))
        else:
            o.append('<path class="wire" d="%s"/>'%wpath([[c[0],425],[c[0],c[4]+7],[tgt,c[4]+7],[tgt,c[4]]]))
    for pts in SELWIRES:
        o.append('<path class="wire" d="%s"/>'%wpath(pts))
    for j in JUNC:
        o.append('<circle cx="%g" cy="%g" r="2" fill="#222"/>'%(j[0],j[1]))
    for x,y in TAPS:
        o.append(tap(x,y))
    for x,y,d in ARROWS:
        o.append(arrow(x,y,d))
    for x,y,d in CHEV:
        o.append(chevron(x,y,d))
    o.append("</svg>")
    return "\n".join(o)

def frame(t):
    on=[i for i,(p,s,vp) in enumerate(WIRES) if uval(t,s)!=0]
    vals={i:(hexs(uval(t,s)) if s in("PC","PCp4","inst") else str(signed(uval(t,s)))) for i,(p,s,vp) in enumerate(WIRES) if vp and uval(t,s)!=0}
    return {"on":on,"vals":vals,"fire":t["PCSel"]==1,"asm":disasm(t["exi"])+"   PC="+hexs(t["expc"]),"cyc":t["cyc"]}
FRAMES=[{"on":[],"vals":{},"fire":False,"asm":"ready - press play","cyc":0}]+[frame(t) for t in TRACE]

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
svg{width:100%;height:auto;display:block;max-width:1100px;margin:0 auto}
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
    import base64
    ff=""
    for w,fn in [(400,"Regular"),(700,"Bold")]:
        try:
            d=base64.b64encode(open("/usr/share/fonts/opentype/inter/Inter-%s.otf"%fn,"rb").read()).decode()
            ff+="@font-face{font-family:'Inter';font-weight:%d;font-style:normal;src:url(data:font/otf;base64,%s) format('opentype')}\n"%(w,d)
        except Exception: pass
    head=HEAD.replace("<style>","<style>\n"+ff,1)
    html=head+svg+"\n<script>\nconst FRAMES="+json.dumps(FRAMES,separators=(",",":"))+";\n"+JS+"\n</script>\n</body></html>"
    open("datapath.html","w").write(html)
    print("wrote datapath.html (",len(FRAMES),"cycles, font",len(ff)//1024,"KB )")

cyc = int(sys.argv[1]) if len(sys.argv)>1 else 6
svg = build_svg(None if cyc==0 else TRACE[cyc-1])
cairosvg.svg2png(bytestring=svg.encode(), write_to="render.png", output_width=1600, background_color="white")
# render at 2x and downscale so sub-1.4px strokes survive (cairosvg blurs thin lines below threshold at 1x)
import io as _io
from PIL import Image as _PImg
_p2x=cairosvg.svg2png(bytestring=build_svg(None).encode(), output_width=1590, background_color="white")
_PImg.open(_io.BytesIO(_p2x)).convert("RGB").resize((795,475),_PImg.LANCZOS).save("mine795.png")
print("wrote render.png for cycle", cyc, "(", len(WIRES), "wires )")
build_html()
