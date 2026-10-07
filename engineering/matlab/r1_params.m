function p = r1_params()
%R1_PARAMS Every number the R1 models use, in one place.
%   Values marked SITE are the figures published on /chip/ (and the
%   dimensions in accelerator-anatomy/src/main.js). Values marked ASSUMED
%   are engineering estimates for a composite package of this class; they
%   are not taken from any specific product. Change them here and rerun
%   run_all; the TINA netlists are regenerated from this file.

% --- Package geometry (SITE) ---
p.die_w_mm = 24.7;            % compute die width
p.die_d_mm = 31.9;            % compute die depth
p.bga_grid = 60;              % 60 x 60 ball grid ...
p.bga_hole = 12;              % ... minus a 12 x 12 central keep-out
p.bga_pitch_mm = 1.0;
p.caps_top = 368;             % 0402 MLCCs on the top side
p.caps_land = 72;             % 0402 MLCCs on the land side

% --- Power (SITE: 1,000 W, core below 1 V) ---
p.board_power_w = 1000;
p.core_share = 0.90;          % ASSUMED: rest goes to HBM, SerDes, I/O rails
p.v_core = 0.80;              % ASSUMED: nominal core voltage
p.tolerance = 0.03;           % ASSUMED: +/-3 % allowed transient deviation
p.step_fraction = 0.50;       % ASSUMED: worst load step, as a share of max current
p.step_rise_s = 1e-6;         % SITE: "hundreds of amps within microseconds"
p.step_rise_sweep = [1e-6 50e-9 10e-9]; % ASSUMED: faster edges for comparison

% --- Voltage regulator, closed-loop output impedance (ASSUMED) ---
p.vrm_r = 20e-6;              % ohm, includes load-line
p.vrm_l = 30e-12;             % henry, sets the ~160 kHz regulation corner

% --- Capacitor banks: count, C (F), ESR (ohm), mounted ESL (H) (ASSUMED values) ---
p.bulk  = struct('n', 32,          'c', 470e-6, 'esr', 5e-3, 'esl', 800e-12); % board polymer
p.bmlcc = struct('n', 120,         'c', 22e-6,  'esr', 3e-3, 'esl', 500e-12); % board MLCC
p.ptop  = struct('n', p.caps_top,  'c', 2.2e-6, 'esr', 8e-3, 'esl', 120e-12); % package top
p.pland = struct('n', p.caps_land, 'c', 4.7e-6, 'esr', 6e-3, 'esl', 40e-12);  % package land side

% --- Interconnect (ASSUMED) ---
p.bga_r = 5e-6;               % board planes, socket and balls to package
p.bga_l = 3e-12;
p.pkg_r = 10e-6;              % substrate, C4 bumps, interposer, microbumps
p.pkg_l = 1e-12;
p.die_c = 40e-6;              % on-die plus interposer trench capacitance
p.die_esr = 60e-6;

% --- Ball currents (ASSUMED) ---
p.ball_r = 0.3e-3;            % ohm per ball including pads
p.ball_i_max = 0.8;           % A per ball, electromigration limit
p.ir_budget_v = 0.005;        % allowed static drop across the balls (power + ground)

% --- Thermal (ASSUMED) ---
p.t_limit_c = 95;             % maximum junction temperature
p.r_jc = 0.015;               % K/W, die to lid including TIM1
p.r_tim2 = 0.008;             % K/W, lid to cooler
p.air_r = 0.060;              % K/W, best-case air heatsink
p.air_inlet_c = 35;
p.liquid_r = 0.018;           % K/W, cold plate
p.liquid_inlet_c = 40;

% --- Cluster scale (SITE footnotes) ---
p.server_accels = 8;
p.server_other_w = 2000;      % processors, networking, fans
p.accel_server_w = 1200;      % per accelerator at server level
p.pue = 1.25;
p.cluster_accels = 100000;
p.home_kwh_year = 10800;      % US EIA average household
end
