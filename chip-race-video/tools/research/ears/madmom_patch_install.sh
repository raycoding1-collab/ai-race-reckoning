#!/bin/bash
# Reproducible madmom 0.16.1 install for Python 3.13 + numpy 2.x (sdist from PyPI, patched). usage: madmom_patch_install.sh <workdir> <pip>
set -e
W="$1"; PIP="$2"; rm -rf "$W"; mkdir -p "$W"; cd "$W"
$PIP install -q Cython mido setuptools wheel
$PIP download -q --no-deps --no-build-isolation madmom==0.16.1
tar xzf madmom-0.16.1.tar.gz && cd madmom-0.16.1
grep -rlE 'np\.(float|int|bool)\b|scipy\.ndimage\.filters' --include=*.py --include=*.pyx . | xargs sed -i -E 's/\bnp\.(float|int|bool)\b/\1/g; s/scipy\.ndimage\.filters/scipy.ndimage/g'
sed -i 's/from collections import MutableSequence/from collections.abc import MutableSequence/' madmom/processors.py
sed -i 's/np\.in1d/np.isin/g' madmom/features/beats_hmm.py madmom/evaluation/notes.py
sed -i 's/best = np.argmax(np.asarray(results)\[:, 1\])/best = int(np.argmax([r[1] for r in results]))/' madmom/features/downbeats.py
$PIP install -q --no-deps --no-build-isolation --force-reinstall .
echo "madmom patched build OK"
