import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isFree, levelForXp, PATH, REWARDS, setRewards, type Reward, type RewardKind } from './flightPath';
import { TRICK_POINTS } from './tricks';

/**
 * FPV Sim accounts (Supabase project "fpv-sim"). The publishable key is meant to be public: the
 * database only lets players read profiles and call add_xp / claim_reward, which check everything
 * on the server (supabase/migrations/).
 */
const SUPABASE_URL = 'https://qwlddgpkhrwbubgicerk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_q8Wn3xUVVGWiTbrFO4mGKQ_1o_AHLYN';

export interface Profile {
  id: string;
  username: string;
  xp: number;
}

export type AccountEvent = { type: 'changed' } | { type: 'levelup'; level: number; rewards: Reward[] } | { type: 'daycap' };

const CONFIG_CACHE = 'flysim.pathConfig';

interface ConfigRow {
  max_level: number;
  xp_base: number;
  xp_growth: number;
  per_day_cap: number;
  trick_points: Partial<typeof TRICK_POINTS>;
}

export class Account {
  private readonly sb: SupabaseClient;
  profile: Profile | null = null;
  claims = new Set<string>();
  private pendingXp = 0;
  private flushTimer = 0;
  private flushing = false;
  private listeners = new Set<(e: AccountEvent) => void>();
  /** XP that can still count today (null until known). */
  dayLeft: number | null = null;
  private dayCapShown = false;

  constructor() {
    this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'flysim.auth' },
    });
    this.applyCachedConfig();
    void this.loadConfig();
    this.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        this.profile = null;
        this.claims.clear();
        this.emit({ type: 'changed' });
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        // Outside the callback: Supabase calls in here would deadlock its auth lock.
        setTimeout(() => void this.load(session.user.id), 0);
      }
    });
  }

  // ---------------------------------------------------------------- balance from Supabase

  private applyConfig(cfg: ConfigRow, rewards: { id: string; kind: string; ref: string; level: number }[]): void {
    PATH.maxLevel = cfg.max_level;
    PATH.xpBase = cfg.xp_base;
    PATH.xpGrowth = cfg.xp_growth;
    PATH.perDayCap = cfg.per_day_cap;
    Object.assign(TRICK_POINTS, cfg.trick_points ?? {});
    setRewards(rewards);
  }

  private applyCachedConfig(): void {
    try {
      const c = JSON.parse(localStorage.getItem(CONFIG_CACHE) ?? 'null');
      if (c?.cfg && c?.rewards) this.applyConfig(c.cfg, c.rewards);
    } catch {
      // no cache yet
    }
  }

  /** The XP curve, caps, trick points and reward levels, as set in the Supabase project. */
  async loadConfig(): Promise<void> {
    const [cfg, rewards] = await Promise.all([
      this.sb.from('game_config').select('max_level, xp_base, xp_growth, per_day_cap, trick_points').eq('id', 1).single(),
      this.sb.from('rewards').select('id, kind, ref, level'),
    ]);
    if (cfg.error || rewards.error || !cfg.data || !rewards.data) return;
    this.applyConfig(cfg.data as ConfigRow, rewards.data);
    try {
      localStorage.setItem(CONFIG_CACHE, JSON.stringify({ cfg: cfg.data, rewards: rewards.data }));
    } catch {
      // storage full / blocked: fine, it reloads next time
    }
    this.emit({ type: 'changed' });
  }

  on(fn: (e: AccountEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: AccountEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  get signedIn(): boolean {
    return this.profile !== null;
  }

  get level(): number {
    return this.profile ? levelForXp(this.profile.xp + this.pendingXp) : 1;
  }

  /** XP including what hasn't reached the server yet. */
  get xp(): number {
    return (this.profile?.xp ?? 0) + this.pendingXp;
  }

  private async load(userId: string): Promise<void> {
    const [p, c] = await Promise.all([
      this.sb.from('profiles').select('id, username, xp').eq('id', userId).single(),
      this.sb.from('claims').select('reward_id'),
    ]);
    if (p.error || !p.data) return;
    this.profile = { id: p.data.id, username: p.data.username, xp: Number(p.data.xp) };
    this.claims = new Set((c.data ?? []).map((r: { reward_id: string }) => r.reward_id));
    const today = await this.sb.rpc('xp_today');
    this.dayLeft = today.error ? null : Number(today.data);
    this.emit({ type: 'changed' });
  }

  /** Creates the account. 'confirm' means an email was sent to confirm it before signing in. */
  async signUp(email: string, password: string, username: string): Promise<'ok' | 'confirm'> {
    const name = username.trim();
    if (!/^[A-Za-z0-9 ._|-]{2,20}$/.test(name)) throw new Error('User name: 2 to 20 letters, numbers, space or . _ - |');
    const free = await this.sb.rpc('username_available', { p_name: name });
    if (free.error) throw new Error(free.error.message);
    if (!free.data) throw new Error(`"${name}" is taken. Try another name.`);
    const { data, error } = await this.sb.auth.signUp({ email: email.trim(), password, options: { data: { username: name } } });
    if (error) throw new Error(error.message);
    return data.session ? 'ok' : 'confirm';
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message === 'Email not confirmed' ? 'Confirm your email first (check your inbox), then sign in.' : error.message);
  }

  async signOut(): Promise<void> {
    await this.flush();
    await this.sb.auth.signOut();
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim());
    if (error) throw new Error(error.message);
  }

  /** Points from tricks: added right away on screen, sent to the server in batches. */
  addXp(points: number): void {
    if (!this.profile || points <= 0) return;
    // Today's XP limit reached: tricks still score on screen, but no XP until tomorrow.
    if (this.dayLeft !== null) {
      const room = Math.max(0, this.dayLeft - this.pendingXp);
      if (room <= 0) {
        if (!this.dayCapShown) {
          this.dayCapShown = true;
          this.emit({ type: 'daycap' });
        }
        return;
      }
      points = Math.min(points, room);
    }
    const before = this.level;
    this.pendingXp += Math.round(points);
    const after = this.level;
    if (after > before) {
      const rewards = REWARDS.filter((r) => r.level > before && r.level <= after);
      this.emit({ type: 'levelup', level: after, rewards });
    }
    this.emit({ type: 'changed' });
    if (!this.flushTimer) this.flushTimer = window.setTimeout(() => void this.flush(), 8000);
  }

  /** Sends banked XP to the server (it caps how much counts per minute). */
  async flush(): Promise<void> {
    clearTimeout(this.flushTimer);
    this.flushTimer = 0;
    if (!this.profile || this.flushing || this.pendingXp <= 0) return;
    this.flushing = true;
    const amount = Math.min(5000, this.pendingXp);
    try {
      const { data, error } = await this.sb.rpc('add_xp', { p_amount: amount });
      if (!error && data?.[0] && this.profile) {
        this.pendingXp -= amount;
        this.profile.xp = Number(data[0].xp);
        if (data[0].day_left !== undefined) this.dayLeft = Number(data[0].day_left);
        // The server counted less (minute or day limit): drop what didn't count.
        if (data[0].granted !== undefined && Number(data[0].granted) < amount && this.dayLeft === 0) this.pendingXp = 0;
        this.emit({ type: 'changed' });
      }
    } finally {
      this.flushing = false;
      if (this.pendingXp > 0) this.flushTimer = window.setTimeout(() => void this.flush(), 8000);
    }
  }

  owns(kind: RewardKind, ref: string): boolean {
    return isFree(kind, ref) || this.claims.has(`${kind}:${ref}`);
  }

  canClaim(r: Reward): boolean {
    return this.signedIn && !this.claims.has(r.id) && this.level >= r.level;
  }

  async claim(r: Reward): Promise<void> {
    await this.flush();
    const { error } = await this.sb.rpc('claim_reward', { p_reward: r.id });
    if (error) throw new Error(error.message);
    this.claims.add(r.id);
    this.emit({ type: 'changed' });
  }
}
