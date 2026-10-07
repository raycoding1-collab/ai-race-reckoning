function z = pdn_impedance(p, f, cap_scale)
%PDN_IMPEDANCE Impedance seen by the die looking back into the supply.
%   z = PDN_IMPEDANCE(p, f) returns the complex impedance (ohm) at each
%   frequency in f (Hz) for the ladder
%
%     VRM -- board caps -- BGA -- package caps -- package -- die caps
%
%   with the regulator's reference treated as AC ground. cap_scale
%   multiplies the number of package capacitors (default 1).
%   The same ladder is written to the TINA netlists by write_netlists.

if nargin < 3
    cap_scale = 1;
end
w = 2 * pi * f(:).';
s = 1j * w;

z_vrm = p.vrm_r + s * p.vrm_l;
z_board = par(bank(p.bulk, s, 1), bank(p.bmlcc, s, 1));
z_pkgcaps = par(bank(p.ptop, s, cap_scale), bank(p.pland, s, cap_scale));
z_die = p.die_esr + 1 ./ (s * p.die_c);

z = par(z_vrm, z_board);
z = par(z + p.bga_r + s * p.bga_l, z_pkgcaps);
z = par(z + p.pkg_r + s * p.pkg_l, z_die);
end

function z = bank(c, s, scale)
% n identical capacitors in parallel
n = c.n * scale;
if n == 0
    z = inf(size(s));
else
    z = (c.esr + s * c.esl + 1 ./ (s * c.c)) / n;
end
end

function z = par(a, b)
z = 1 ./ (1 ./ a + 1 ./ b);
end
