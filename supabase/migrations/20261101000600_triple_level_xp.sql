-- Every level needs 3x the XP: level 50 = 2,560,005 XP (at least 21.3 days at the daily cap).
update public.game_config set xp_base = 3000, xp_growth = 1005, updated_at = now() where id = 1;
