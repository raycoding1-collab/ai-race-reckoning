function run_all()
%RUN_ALL Run the R1 models, write the TINA netlists and the results.
%   Netlists go to engineering/tina, results to engineering/out. Runs
%   unchanged in MATLAB and GNU Octave.

here = fileparts(mfilename('fullpath'));
root = fileparts(here);
out = fullfile(root, 'out');
if ~exist(out, 'dir')
    mkdir(out);
end

p = r1_params();
b = budgets(p);

% Netlists for TINA and ngspice
write_netlists(p, root);

% Impedance against package capacitor count
f = logspace(3, 9, 601);   % same points as .AC DEC 100 1k 1G
scales = [0 0.25 0.5 1 2];
z = zeros(numel(scales), numel(f));
for k = 1:numel(scales)
    z(k, :) = abs(pdn_impedance(p, f, scales(k)));
end
caps = round(scales * (p.ptop.n + p.pland.n));
fid = fopen(fullfile(out, 'pdn_impedance.csv'), 'w');
fprintf(fid, 'freq_hz,target_uohm');
fprintf(fid, ',caps_%d_uohm', caps);
fprintf(fid, '\n');
fprintf(fid, ['%.6g,%.4g' repmat(',%.4g', 1, numel(scales)) '\n'], ...
    [f; 1e6 * [repmat(b.z_target, 1, numel(f)); z]]);
fclose(fid);

% Peaks: 1-10 MHz is the package capacitors' band; above 10 MHz the
% package inductance resonates with the die's own capacitance.
mid = f >= 1e6 & f <= 1e7;
high = f > 1e7;
[peak, k] = max(z(scales == 1, :));
b.z_peak = peak;
b.z_peak_hz = f(k);
over = f(z(scales == 1, :) > b.z_target);
b.z_over_from_hz = min([over inf]);
b.caps_sweep = caps;
b.z_peak_1_10mhz_sweep = max(z(:, mid), [], 2).';
b.z_peak_above_10mhz_sweep = max(z(:, high), [], 2).';

fid = fopen(fullfile(out, 'budgets.json'), 'w');
fprintf(fid, '%s\n', jsonencode(b));
fclose(fid);

fprintf('Core current        %6.0f A (step %.0f A)\n', b.i_core, b.i_step);
fprintf('Target impedance    %6.1f uohm\n', b.z_target * 1e6);
fprintf('Peak impedance      %6.1f uohm at %.3g MHz\n', b.z_peak * 1e6, b.z_peak_hz / 1e6);
fprintf('Above target from   %6.3g MHz\n', b.z_over_from_hz / 1e6);
fprintf('Package caps        %s\n', sprintf('%7d', caps));
fprintf('  1-10 MHz peak     %s uohm\n', sprintf('%7.0f', b.z_peak_1_10mhz_sweep * 1e6));
fprintf('  >10 MHz peak      %s uohm\n', sprintf('%7.0f', b.z_peak_above_10mhz_sweep * 1e6));
fprintf('Power/ground balls  %6d of %d (%.0f %%)\n', b.power_ground_balls, b.balls, 100 * b.power_ground_share);
fprintf('Heat flux           %6.0f W/cm2\n', b.heat_flux_w_cm2);
fprintf('Junction, air       %6.0f C (limit %d)\n', b.tj_air_c, p.t_limit_c);
fprintf('Junction, liquid    %6.0f C\n', b.tj_liquid_c);
fprintf('Server / cluster    %6.0f kW / %.0f MW = %.0f homes\n', b.server_kw, b.cluster_mw, b.homes);
end
