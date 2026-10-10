import sys, os, numpy as np, soundfile as sf, pyworld as pw
sys.path.insert(0,'src'); import song
x,sr=sf.read('build/stems/vox_lead.wav'); x=x.astype(np.float64)
f0,t=pw.harvest(x,sr,frame_period=10,f0_floor=80,f0_ceil=800)
errs=[];miss=0;tot=0
for line in song.timeline():
    for w in line['words']:
        for n in w['notes']:
            m=n['midi']-12; a,b=n['t']+0.08,n['t']+n['dur']-0.05
            if b<=a: continue
            sel=f0[(t>=a)&(t<b)]; tot+=1
            v=sel[sel>0]
            if len(v)<2: miss+=1; continue
            errs.append(np.median(12*np.log2(v/440)+69)-m)
errs=np.array(errs)
print(f'notes {tot}, unvoiced {miss}, median abs err {np.median(np.abs(errs))*100:.1f} cents, >50c: {(np.abs(errs)>0.5).sum()}')
