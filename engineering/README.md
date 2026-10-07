# R1 engineering models: MATLAB and TINA

Electrical and thermal models of the R1 accelerator package shown at
[`/chip/`](../chip/). They check the page's claims (1,000 W, over 1,000 A,
440 decoupling capacitors, 3,456 solder balls, liquid cooling, cluster power)
against simple physics.

- `matlab/` contains the models. They run unchanged in **MATLAB** and **GNU Octave**
  and need no toolboxes.
- `tina/` contains the power delivery circuits as SPICE netlists. They import into
  **TINA** / **TINA-TI** and run in **ngspice**.
- MATLAB writes the netlists from the same parameter file, so the circuit and the
  model always describe the same hardware. The check script then confirms that
  SPICE and MATLAB agree.

## Run it

**MATLAB or Octave**

```matlab
cd engineering/matlab
run_all        % budgets, impedance sweep, regenerates tina/ and ngspice/run.sp
check_spice    % after the SPICE step below: compares SPICE with MATLAB
```

**TINA / TINA-TI**: import `tina/r1_pdn_ac.cir` or `tina/r1_load_step.cir`
through TINA's SPICE netlist import (under File › Import; the menu wording
varies between TINA versions). Then run the AC or transient analysis and plot
`die`.

- `r1_pdn_ac` drives 1 A of AC current into the die node, so the voltage there
  reads directly as impedance in ohms.
- The load steps use the Gear integration method (`.OPTIONS METHOD=GEAR`). If
  TINA ignores that line, choose Gear in its analysis settings: the default
  trapezoidal method stalls on this stiff circuit.
- `tina/variants/` holds the same circuits with no package capacitors and with
  faster load steps.

**Everything at once, without MATLAB or TINA**:

```sh
sudo apt install octave ngspice
engineering/run.sh
```

`run.sh` does four things:

1. Rejects Octave-only syntax so the code stays MATLAB-compatible.
2. Runs `run_all` in Octave.
3. Runs every netlist in ngspice (`ngspice/run.sp`).
4. Runs `check_spice`, which fails if SPICE and MATLAB disagree by more than 1 %.

The `engineering` GitHub workflow runs the same script on every change. It also
checks that the committed netlists match `r1_params.m`.

## Files

| File | What it does |
|---|---|
| `matlab/r1_params.m` | Every number used. `SITE` marks figures from /chip/; `ASSUMED` marks engineering estimates |
| `matlab/budgets.m` | Core current, target impedance, ball count, junction temperature, cluster power |
| `matlab/pdn_impedance.m` | Impedance the die sees through regulator → board capacitors → balls → package capacitors → package → die |
| `matlab/r1_cases.m` | The list of SPICE cases |
| `matlab/write_netlists.m` | Writes `tina/**/*.cir` and `ngspice/run.sp` |
| `matlab/check_spice.m` | Compares SPICE with MATLAB and writes the load step results |
| `out/budgets.json`, `out/pdn_impedance.csv` | MATLAB results |
| `out/load_step.json`, `out/load_step.csv` | Load step results (`out/raw/` holds the full SPICE output and is not committed) |

## Results

From the current parameters:

| Claim on /chip/ | Model |
|---|---|
| "well over 1,000 A" | 1,125 A on the core rail (900 W at 0.8 V) |
| "most balls carry power and ground" | 2,814 of 3,456 balls (81 %) at 0.8 A per ball |
| Liquid cooling | 114 W/cm² at the die. Best-case air reaches 118 °C at the junction, over the 95 °C limit; a cold plate holds it to 81 °C |
| 10 kW per server, 150 MW per 100,000 accelerators, about 120,000 homes | 10 kW, 150 MW, 121,667 homes |
| 440 capacitors keep the voltage stable | See below |

### Power delivery

The target impedance is 42.7 µΩ: a ±3 % window on 0.8 V across a 562 A step.

**The package capacitors lower the 1–10 MHz peak:**

| Package capacitors | 0 | 110 | 220 | 440 | 880 |
|---|---|---|---|---|---|
| Peak, 1–10 MHz (µΩ) | 1,944 | 250 | 180 | 115 | 77 |
| Peak, above 10 MHz (µΩ) | 1,559 | 344 | 348 | 358 | 368 |

- Above 10 MHz the package inductance resonates with the die's own
  capacitance, so adding package capacitors does not help there.
- Impedance stays above target from about 110 kHz upward.

**How far the voltage dips after a 562 A step depends on how fast the load ramps:**

| Ramp | Dip with 440 caps | Dip with none | Budget |
|---|---|---|---|
| 1 µs | 17 mV | 17 mV | 24 mV |
| 50 ns | 25 mV | 136 mV | 24 mV |
| 10 ns | 50 mV | 197 mV | 24 mV |

Each dip is measured from the voltage the rail settles at after the step.

- At the microsecond ramps the /chip/ page describes, the regulator and board
  handle the step.
- Faster ramps need the package capacitors: they cut the dip by four to five
  times.
- A 10 ns ramp overshoots the budget even with all 440 fitted. That is why
  accelerators ramp their load deliberately and detect droops on the die,
  rather than relying on capacitors alone.

## Limits

- R1 is a composite, and the `ASSUMED` values are plausible for its class
  rather than measured from any product.
- The circuit is lumped: each bank of capacitors is one branch.
- The regulator is a resistance and inductance standing in for its control
  loop.
- Change `r1_params.m` and rerun to see how sensitive each result is.
