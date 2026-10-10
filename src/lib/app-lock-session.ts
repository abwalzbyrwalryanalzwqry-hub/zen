/**
 * نسخة TypeScript من LockSession.java (1.29.0، M8) — للمحاكاة لا للحماية. يستعملها الجسر الوهمي في
 * اختبارات e2e (e2e/fake-native-lock.ts يحقنها كما هي في الصفحة)، فتسلك المحاكاة سلوك Java نفسه، ويشغّل
 * app-lock-session.test.ts عليها السيناريوهات المشتركة نفسها التي يشغّلها LockSessionScenarioTest على Java
 * (android/app/src/test/resources/app-lock-scenarios.json). لا تستورد شيئاً ولا تُستعمل في التطبيق.
 *
 * الكتلة كلها داخل دالة واحدة كي تُحقن بـ toString() في الصفحة دون وحدات.
 */
export function createLockSession() {
  const AUTH_UI_ALLOWANCE_MS = 60_000;
  const AUTH_WATCHDOG_MS = 90_000;
  const s = {
    unlocked: false,
    backgroundAt: -1,
    stoppedDuringAuth: false,
    authInProgress: false,
    authStartedAt: 0,
    authSucceededAt: -1,
    authorizedUntil: 0,
    proofMode: null as string | null,
    proofUntil: 0,
    lastInteraction: 0,
  };
  const shouldRelock = (away: number, grace: number) => away < 0 || away >= grace;
  const authActive = (now: number) =>
    s.authInProgress && now - s.authStartedAt >= 0 && now - s.authStartedAt < AUTH_WATCHDOG_MS;
  const relock = () => {
    const changed = s.unlocked;
    s.unlocked = false;
    s.authorizedUntil = 0;
    s.proofMode = null;
    s.proofUntil = 0;
    return changed;
  };
  return {
    state: s,
    authActive,
    relock,
    reset() {
      s.authInProgress = false;
      s.stoppedDuringAuth = false;
      s.backgroundAt = -1;
    },
    beginAuth(now: number) {
      if (authActive(now)) return false;
      s.authInProgress = true;
      s.authStartedAt = now;
      return true;
    },
    endAuth(now: number, success: boolean) {
      s.authInProgress = false;
      if (success) s.authSucceededAt = now;
    },
    unlock(now: number) {
      s.unlocked = true;
      s.lastInteraction = now;
    },
    onStop(now: number, enabled: boolean, grace: number) {
      if (!enabled) return false;
      s.backgroundAt = now;
      s.stoppedDuringAuth = authActive(now);
      if (s.stoppedDuringAuth) return false;
      if (!s.unlocked) {
        s.authorizedUntil = 0;
        s.proofMode = null;
        s.proofUntil = 0;
        return false;
      }
      return grace === 0 && relock();
    },
    onStart(now: number, enabled: boolean, grace: number) {
      let changed = false;
      if (enabled && s.backgroundAt >= 0) {
        const away = now - s.backgroundAt;
        const authWindow =
          s.stoppedDuringAuth &&
          (authActive(now) || s.authSucceededAt >= s.backgroundAt) &&
          away >= 0 &&
          away < AUTH_UI_ALLOWANCE_MS;
        if (s.unlocked && !authWindow && shouldRelock(away, grace)) changed = relock();
      }
      s.backgroundAt = -1;
      s.stoppedDuringAuth = false;
      return changed;
    },
    lockNow(enabled: boolean) {
      return enabled && relock();
    },
    onScreenOff(now: number, enabled: boolean, lockOnScreenOff: boolean) {
      if (!enabled || !lockOnScreenOff || authActive(now)) return false;
      return relock();
    },
    touch(now: number) {
      s.lastInteraction = now;
    },
    onIdleTick(now: number, enabled: boolean, idleMs: number) {
      if (!enabled || !s.unlocked || authActive(now) || idleMs <= 0) return false;
      const expired = now < s.lastInteraction || now - s.lastInteraction >= idleMs;
      return expired && relock();
    },
    authorized(now: number) {
      return now < s.authorizedUntil;
    },
    authorize(now: number, windowMs: number, requireUnlocked: boolean) {
      if (requireUnlocked && !s.unlocked) return;
      s.authorizedUntil = now + windowMs;
    },
    clearAuthorization() {
      s.authorizedUntil = 0;
    },
    setProof(mode: string, now: number, windowMs: number) {
      s.proofMode = mode;
      s.proofUntil = now + windowMs;
    },
    consumeProof(mode: string, now: number) {
      const ok = s.proofMode === mode && now < s.proofUntil;
      s.proofMode = null;
      s.proofUntil = 0;
      return ok;
    },
  };
}

export type LockSessionSim = ReturnType<typeof createLockSession>;
