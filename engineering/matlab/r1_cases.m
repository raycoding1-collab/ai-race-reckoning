function c = r1_cases(p)
%R1_CASES The circuits simulated in SPICE, one netlist each.
%   kind is 'ac' (impedance sweep) or 'tran' (load step); cap_scale
%   multiplies the package capacitor count; rise_s is the load step's
%   rise time. file is relative to the engineering folder.

c = struct('name', {}, 'kind', {}, 'cap_scale', {}, 'rise_s', {}, 'file', {});
c(end + 1) = one('pdn_ac', 'ac', 1, 0, 'tina/r1_pdn_ac.cir');
c(end + 1) = one('load_step', 'tran', 1, p.step_rise_s, 'tina/r1_load_step.cir');
c(end + 1) = one('pdn_ac_no_pkg_caps', 'ac', 0, 0, 'tina/variants/r1_pdn_ac_no_pkg_caps.cir');
for rise = p.step_rise_sweep
    for scale = [1 0]
        tag = sprintf('%gns', rise * 1e9);
        if scale == 0
            tag = [tag '_no_pkg_caps']; %#ok<AGROW>
        end
        if rise == p.step_rise_s && scale == 1
            continue   % the main load_step case
        end
        c(end + 1) = one(['load_step_' tag], 'tran', scale, rise, ...
            ['tina/variants/r1_load_step_' tag '.cir']); %#ok<AGROW>
    end
end
end

function s = one(name, kind, cap_scale, rise_s, file)
s = struct('name', name, 'kind', kind, 'cap_scale', cap_scale, 'rise_s', rise_s, 'file', file);
end
