#!/bin/bash
S=/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands
mkdir -p $S/dl/git/full && cd $S/dl/git/full && rm -rf salamander
export TIMEFORMAT='salamander full clone wall=%R s'
time git clone -q --depth 1 https://github.com/sfzinstruments/SalamanderGrandPiano.git salamander > $S/dl/git/full/sal.log 2>&1
du -sh salamander | cut -f1 >> $S/dl/git/full/sal.log
echo CLONE_DONE >> $S/dl/git/full/sal.log
