#!/bin/bash
# Build a throwaway conda-forge env (CPU PyTorch + libfluidsynth) with micromamba. Research only.
S=/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands
export MAMBA_ROOT_PREFIX=$S/mamba/root
export TIMEFORMAT='mamba create wall=%R s user=%U s'
time $S/mamba/micromamba create -y -p $S/mamba/env -c conda-forge --override-channels \
  python=3.13 'pytorch=*=cpu*' fluidsynth numpy scipy > $S/mamba/create.log 2>&1
echo DONE >> $S/mamba/create.log
