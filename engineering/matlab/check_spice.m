function check_spice()
%CHECK_SPICE Compare the SPICE results with the MATLAB model.
%   Reads what ngspice/run.sp (or TINA, exported the same way) wrote to
%   out/raw, checks every simulated impedance against pdn_impedance, and
%   writes the load step waveforms and figures to out. Errors if SPICE
%   and MATLAB disagree by more than 1 %.

root = fileparts(fileparts(mfilename('fullpath')));
raw = fullfile(root, 'out', 'raw');
out = fullfile(root, 'out');
p = r1_params();
b = budgets(p);
cases = r1_cases(p);

% Impedance: SPICE against MATLAB
for c = cases(strcmp({cases.kind}, 'ac'))
    d = read_wrdata(fullfile(raw, [c.name '.txt']));
    zm = abs(pdn_impedance(p, d(1, :), c.cap_scale));
    err = max(abs(d(2, :) - zm) ./ zm);
    fprintf('%-28s SPICE vs MATLAB within %.2g %%\n', c.name, 100 * err);
    if err > 0.01
        error('check_spice:mismatch', '%s differs from the MATLAB model by %.2g %%', c.name, 100 * err);
    end
end

% Load steps: resample to 10 ns and measure
tran = cases(strcmp({cases.kind}, 'tran'));
t = 0:10e-9:60e-6;
v = zeros(numel(tran), numel(t));
before = t > 15e-6 & t < 20e-6;
after = t > 50e-6;
window = t >= 20e-6;
s = struct('i_from', b.i_core - b.i_step, 'i_to', b.i_core, ...
    'budget', p.v_core * p.tolerance, 'cases', struct([]));
for k = 1:numel(tran)
    d = read_wrdata(fullfile(raw, [tran(k).name '.txt']));
    [tt, keep] = unique(d(1, :));
    v(k, :) = interp1(tt, d(2, keep), t);
    r = struct('name', tran(k).name, 'rise_s', tran(k).rise_s, ...
        'pkg_caps', round((p.ptop.n + p.pland.n) * tran(k).cap_scale), ...
        'v_before', mean(v(k, before)), 'v_after', mean(v(k, after)), ...
        'v_min', min(v(k, window)));
    r.undershoot = r.v_after - r.v_min;
    r.within_budget = r.undershoot <= s.budget;
    s.cases = [s.cases r];
    fprintf('%-28s %4.0f ns ramp, %3d caps: dips %5.1f mV below settled (budget %.0f mV)\n', ...
        r.name, 1e9 * r.rise_s, r.pkg_caps, 1e3 * r.undershoot, 1e3 * s.budget);
end

% Waveforms around the step, every 10 ns for 2 us, then every 100 ns
keep = (t >= 19e-6 & t <= 21e-6) | mod(round(t / 10e-9), 10) == 0;
fid = fopen(fullfile(out, 'load_step.csv'), 'w');
fprintf(fid, 'time_us');
fprintf(fid, ',%s_mv', tran.name);
fprintf(fid, '\n');
fprintf(fid, ['%.2f' repmat(',%.2f', 1, numel(tran)) '\n'], [t(keep) * 1e6; v(:, keep) * 1e3]);
fclose(fid);

fid = fopen(fullfile(out, 'load_step.json'), 'w');
fprintf(fid, '%s\n', jsonencode(s));
fclose(fid);
end

function d = read_wrdata(file)
% ngspice wrdata with wr_singlescale and wr_vecnames: a header, then two columns
fid = fopen(file, 'r');
if fid < 0
    error('check_spice:missing', 'No SPICE output at %s; run ngspice/run.sp first', file);
end
fgetl(fid);
d = fscanf(fid, '%f', [2 inf]);
fclose(fid);
end
