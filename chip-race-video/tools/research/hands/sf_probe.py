import time, resource, sys, os
import tinysoundfont
S="/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
banks={
       "FluidR3Mono_GM.sf3":f"{S}/dl/sf/FluidR3Mono_GM.sf3",
       "FluidR3_GM.sf2":f"{S}/dl/debx/fluidgm/usr/share/sounds/sf2/FluidR3_GM.sf2",
       "MuseScore_General_Full.sf3":f"{S}/dl/debx/msg/usr/share/sounds/sf3/MuseScore_General_Full.sf3"}
want=[0,4,11,24,38,39,46,48,49,50,52,53,54,88,89,90,91,94,95]
for name,p in banks.items():
    sz=os.path.getsize(p)/1e6
    r0=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
    t=time.perf_counter(); c=time.process_time()
    syn=tinysoundfont.Synth(samplerate=44100)
    try:
        sfid=syn.sfload(p)
    except Exception as e:
        print(f"{name}: LOAD FAIL {type(e).__name__} {e}"); continue
    dt=time.perf_counter()-t; dc=time.process_time()-c
    r1=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
    names={}
    for pr in want:
        try: names[pr]=(syn.sfpreset_name(sfid,0,pr) or "-")
        except Exception as e: names[pr]='?'
    kits={}
    for pr in (0,24,25,26,16):
        try: kits[pr]=(syn.sfpreset_name(sfid,128,pr) or "-")
        except Exception: pass
    # render speed: 8 notes polyphonic pad for 5 s
    syn.program_select(0,sfid,0,89 if name!="FluidR3Mono_GM.sf3" else 89)
    for k in (53,56,60,65,41,44,49,51): syn.noteon(0,k,100)
    t=time.perf_counter(); c=time.process_time()
    buf=syn.generate(44100*5)
    rt=time.perf_counter()-t; rc=time.process_time()-c
    print(f"{name:28s} {sz:6.1f} MB | load wall {dt:5.2f}s cpu {dc:5.2f}s | RSS +{r1-r0:5.0f} MB | render 5s x8 voices: {rt*1000:5.0f} ms wall ({5/rt:5.0f}x realtime)")
    print("    presets:", {k:v[:22] for k,v in names.items()})
    print("    drum kits (bank128):", {k:v[:18] for k,v in kits.items()})
