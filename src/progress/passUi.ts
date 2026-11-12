import { getDrone } from '../drones/specs';
import type { Account } from './account';
import { levelProgress, PATH, rewardsAt, type Reward } from './flightPath';
import { getSkin } from './skins';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The Flight Path tab (account, Pilot Level, the 50 levels and their rewards) and the header chip. */
export class PassUi {
  private mode: 'signin' | 'signup' = 'signin';
  private busy = false;
  private message = '';

  constructor(
    private readonly account: Account,
    private readonly onOwnedChanged: () => void,
  ) {
    account.on(() => {
      this.renderChip();
      if (document.getElementById('tab-pass')?.classList.contains('active')) this.render();
      this.onOwnedChanged();
    });
    this.renderChip();
  }

  renderChip(): void {
    const chip = $('acct-chip');
    const p = this.account.profile;
    chip.innerHTML = p ? `<b>${esc(p.username)}</b><span class="lv">Lv ${this.account.level}</span>` : 'Sign in';
    chip.title = p ? 'Your Flight Path' : 'Sign in to earn XP and unlock drones and skins';
  }

  render(): void {
    const el = $('pass');
    const a = this.account;
    if (!a.profile) {
      el.innerHTML = this.authForm();
      this.bindAuth();
      return;
    }
    const prog = levelProgress(a.xp);
    const unclaimed: Reward[] = [];
    for (let l = 1; l <= prog.level; l++) unclaimed.push(...rewardsAt(l).filter((r) => a.canClaim(r)));
    let rows = '';
    for (let l = 1; l <= PATH.maxLevel; l++) {
      const rs = rewardsAt(l);
      const reached = prog.level >= l;
      rows += `<div class="tier${reached ? ' reached' : ''}${l === prog.level ? ' current' : ''}"><div class="tlv">${l}</div><div class="trw">${
        rs.length ? rs.map((r) => this.rewardChip(r, reached)).join('') : '<span class="muted">XP</span>'
      }</div></div>`;
    }
    el.innerHTML = `<div class="pass-head">
        <div class="pass-badge">${prog.level}</div>
        <div class="pass-who"><h2>${esc(a.profile.username)}</h2><div class="sub">Pilot Level ${prog.level}${prog.level >= PATH.maxLevel ? ' · max' : ` · ${Math.round(prog.into).toLocaleString()} / ${prog.span.toLocaleString()} XP to level ${prog.level + 1}`}</div>
          <div class="xpbar"><i style="width:${(prog.frac * 100).toFixed(1)}%"></i></div></div>
        <div class="pass-actions">${unclaimed.length ? `<button class="fly" id="claim-all">Claim all (${unclaimed.length})</button>` : ''}<button id="sign-out">Sign out</button></div>
      </div>
      <p class="sub pass-how">Earn XP with tricks in single player and multiplayer: flips, rolls, power loops, Split-S, dives, gaps, proximity and inverted hang time. Chain them within 3 s for a combo. Crash right after and the points are lost.</p>
      <p class="sub pass-day">${a.dayLeft === null ? '' : a.dayLeft > 0 ? `Today you can still earn <b>${a.dayLeft.toLocaleString()} XP</b> (the daily limit is ${PATH.perDayCap.toLocaleString()} and resets at midnight UTC).` : `<b>Daily XP limit reached.</b> Tricks still score, but XP counts again after midnight UTC.`}</p>
      ${this.message ? `<p class="pass-msg">${esc(this.message)}</p>` : ''}
      <div class="tiers">${rows}</div>`;
    el.querySelector('#sign-out')?.addEventListener('click', () => void a.signOut());
    el.querySelector('#claim-all')?.addEventListener('click', async () => {
      for (const r of unclaimed) await this.claim(r, false);
      this.render();
    });
    el.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = rewardsAt(Number(b.dataset.level)).find((x) => x.id === b.dataset.claim);
        if (r) void this.claim(r, true);
      }),
    );
    el.querySelector('.tier.current')?.scrollIntoView({ block: 'center' });
  }

  private rewardChip(r: Reward, reached: boolean): string {
    const a = this.account;
    const icon = r.kind === 'drone' ? '🛸' : '🎨';
    let swatch = '';
    if (r.kind === 'skin') {
      const c = getSkin(r.ref).colors.prop ?? getSkin(r.ref).colors.bell ?? [0.5, 0.5, 0.5];
      swatch = `<i class="sw" style="background:rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})"></i>`;
    }
    const sub = r.kind === 'drone' ? getDrone(r.ref).className : 'skin';
    const state = a.claims.has(r.id)
      ? '<span class="claimed">✓ Claimed</span>'
      : reached
        ? `<button class="fly sm" data-claim="${r.id}" data-level="${r.level}">Claim</button>`
        : '<span class="muted">🔒</span>';
    return `<div class="rw ${r.kind}">${swatch}<span class="ic">${icon}</span><div><b>${esc(r.kind === 'drone' ? r.name : r.name.replace(/ skin$/, ''))}</b><div class="sub">${esc(sub)}</div></div>${state}</div>`;
  }

  private async claim(r: Reward, rerender: boolean): Promise<void> {
    try {
      await this.account.claim(r);
      this.message = `Claimed ${r.name}!`;
    } catch (e) {
      this.message = `Could not claim ${r.name}: ${(e as Error).message}`;
    }
    if (rerender) this.render();
  }

  private authForm(): string {
    const up = this.mode === 'signup';
    return `<div class="auth">
      <h2>${up ? 'Create your pilot account' : 'Sign in'}</h2>
      <p class="sub">Your account keeps your <b>Pilot Level</b> and everything you unlock on the <b>Flight Path</b>: 20 more drones and 19 skins. Without one you fly the five starter drones and tricks don't earn XP.</p>
      <div class="auth-tabs"><button data-mode="signin" class="${up ? '' : 'on'}">Sign in</button><button data-mode="signup" class="${up ? 'on' : ''}">Create account</button></div>
      ${up ? '<label>User name<input id="auth-name" maxlength="20" autocomplete="nickname" placeholder="Shown to other pilots"></label>' : ''}
      <label>Email<input id="auth-email" type="email" autocomplete="email"></label>
      <label>Password<input id="auth-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? 'At least 6 characters' : ''}"></label>
      <div class="row"><button class="fly" id="auth-go" ${this.busy ? 'disabled' : ''}>${up ? 'Create account' : 'Sign in'}</button>${up ? '' : '<button id="auth-forgot" class="linkish">Forgot password?</button>'}</div>
      <p class="pass-msg" id="auth-msg">${esc(this.message)}</p>
    </div>`;
  }

  private bindAuth(): void {
    const el = $('pass');
    el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.mode = b.dataset.mode as 'signin' | 'signup';
        this.message = '';
        this.render();
      }),
    );
    for (const input of el.querySelectorAll('input')) {
      // Typing must not fly anything.
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') void this.submit();
      });
      input.addEventListener('keyup', (e) => e.stopPropagation());
    }
    el.querySelector('#auth-go')?.addEventListener('click', () => void this.submit());
    el.querySelector('#auth-forgot')?.addEventListener('click', async () => {
      const email = $<HTMLInputElement>('auth-email').value;
      if (!email) return this.say('Type your email first.');
      try {
        await this.account.resetPassword(email);
        this.say('A password reset link is on its way to your email.');
      } catch (e) {
        this.say((e as Error).message);
      }
    });
  }

  private say(text: string): void {
    this.message = text;
    const m = document.getElementById('auth-msg');
    if (m) m.textContent = text;
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const email = $<HTMLInputElement>('auth-email').value;
    const pass = $<HTMLInputElement>('auth-pass').value;
    if (!email || !pass) return this.say('Fill in your email and password.');
    this.busy = true;
    this.say(this.mode === 'signup' ? 'Creating your account…' : 'Signing in…');
    try {
      if (this.mode === 'signup') {
        const name = $<HTMLInputElement>('auth-name').value;
        const res = await this.account.signUp(email, pass, name);
        this.message = res === 'confirm' ? 'Almost there: open the email we sent and confirm, then sign in here.' : '';
        if (res === 'confirm') this.mode = 'signin';
      } else {
        await this.account.signIn(email, pass);
        this.message = '';
      }
    } catch (e) {
      this.message = (e as Error).message;
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
