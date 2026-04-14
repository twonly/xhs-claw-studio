// License 管理 — v3.0: 全功能免费开放
// 保留接口兼容性，所有功能始终解锁

const LICENSE = {
  TIERS: { FREE: 'free' },

  LIMITS: {
    free: {
      batchLimit: 999, dailyLimit: 999, maxDelay: 60, minDelay: 1,
      hasResume: true, hasAnalysis: true, hasJson: true,
      hasChunkCooldown: true, hasAiReport: true, hasCompare: true,
    },
  },

  async getInfo() {
    return { tier: 'free', limits: this.LIMITS.free };
  },

  async checkDailyUsage() { return 0; },
  async addDailyUsage() {},
};
