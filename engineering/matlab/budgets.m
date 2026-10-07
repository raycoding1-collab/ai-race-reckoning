function b = budgets(p)
%BUDGETS Current, impedance, ball, thermal and cluster figures for R1.

% Current and target impedance
b.i_core = p.board_power_w * p.core_share / p.v_core;
b.i_step = p.step_fraction * b.i_core;
b.z_target = p.v_core * p.tolerance / b.i_step;

% Ball grid
b.balls = p.bga_grid^2 - p.bga_hole^2;
b.die_area_mm2 = p.die_w_mm * p.die_d_mm;
b.balls_per_rail_em = ceil(b.i_core / p.ball_i_max);          % electromigration
b.balls_per_rail_ir = ceil(2 * b.i_core * p.ball_r / p.ir_budget_v);
b.balls_per_rail = max(b.balls_per_rail_em, b.balls_per_rail_ir);
b.power_ground_balls = 2 * b.balls_per_rail;
b.power_ground_share = b.power_ground_balls / b.balls;
b.ir_drop_v = 2 * b.i_core * p.ball_r / b.balls_per_rail;

% Thermal
b.heat_flux_w_cm2 = p.board_power_w * p.core_share / (b.die_area_mm2 / 100);
r_pkg = p.r_jc + p.r_tim2;
b.tj_air_c = p.air_inlet_c + p.board_power_w * (r_pkg + p.air_r);
b.tj_liquid_c = p.liquid_inlet_c + p.board_power_w * (r_pkg + p.liquid_r);

% Cluster scale
b.server_kw = (p.server_accels * p.board_power_w + p.server_other_w) / 1000;
b.cluster_mw = p.cluster_accels * p.accel_server_w * p.pue / 1e6;
b.home_kw = p.home_kwh_year / (365 * 24);
b.homes = b.cluster_mw * 1000 / b.home_kw;
end
