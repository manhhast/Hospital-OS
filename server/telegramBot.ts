import crypto from "crypto";
import os from "os";
import {
  askHospitalAssistant,
  type LearnedMemoryEntry,
} from "./assistantEngine";
import {
  acquireTelegramPollLease,
  getTelegramPollLeaseInfo,
  loadTelegramUpdateOffsetFromDb,
  releaseTelegramPollLease,
  renewTelegramPollLease,
  saveTelegramUpdateOffsetToDb,
  subscribeTelegramTakeover,
} from "./postgresSync";

export interface TelegramExclusivityReport {
  checkedAt: string;
  botId?: number;
  botUsername?: string;
  botFirstName?: string;
  isExclusive: boolean;
  statusCode: "EXCLUSIVE" | "EXTERNAL_WEBHOOK" | "EXTERNAL_POLLING" | "CONFLICT_RETRY";
  summary: string;
  webhookUrl: string;
  pendingUpdateCount: number;
  externalListenerDetected: boolean;
  leaseSupported: boolean;
  leaseHolderHost?: string;
  leaseHeldByThisInstance: boolean;
}

export interface TelegramConfigInput {
  botToken: string;
  defaultChatId?: string;
  enabled: boolean;
}

export type TelegramBotMode =
  | "polling"
  | "standby"
  | "paused"
  | "conflict"
  | "webhook"
  | "unconfigured";

export interface TelegramBotStatusSnapshot {
  configured: boolean;
  enabled: boolean;
  pollingActive: boolean;
  startingPolling?: boolean;
  reconnecting?: boolean;
  reconnectingMessage?: string;
  conflictDetected?: boolean;
  pausedByUser?: boolean;
  standbyMode?: boolean;
  standbyHolder?: string;
  webhookUrl?: string;
  mode?: TelegramBotMode;
  instanceHost?: string;
  botUsername?: string;
  botFirstName?: string;
  lastPollAt?: string;
  lastMessageAt?: string;
  totalAnswered: number;
  hasLiveContext: boolean;
  contextUpdatedAt?: string;
  lastError?: string;
  nextConflictRetryAt?: string;
  autoRecovering?: boolean;
}

function resolveInitialHostLabel(): string {
  const appUrl = (process.env.APP_URL || "").trim();
  if (appUrl) {
    try {
      const host = new URL(appUrl).host;
      if (host) return host.slice(0, 120);
    } catch {
      // ignore invalid APP_URL
    }
  }
  return os.hostname() || "server";
}

class TelegramAssistantManager {
  private readonly instanceId = crypto.randomUUID();
  private instanceHost = resolveInitialHostLabel();

  private botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  private defaultChatId = (process.env.TELEGRAM_DEFAULT_CHAT_ID || "").trim();
  private enabled = Boolean(this.botToken);
  private pollingActive = false;
  private startingPolling = false;
  private conflictDetected = false;
  private pausedByUser = false;
  private standbyMode = false;
  private standbyHolder: string | undefined;
  private webhookUrl: string | undefined;

  private pollAbortController: AbortController | null = null;
  private standbyTimer: NodeJS.Timeout | null = null;
  private conflictRecoveryTimer: NodeJS.Timeout | null = null;
  private leaseHeartbeatTimer: NodeJS.Timeout | null = null;
  private nextConflictRetryAt: string | undefined;
  private sleepCancel: (() => void) | null = null;
  private pollLoopGeneration = 0;
  private lastUpdateOffset = 0;

  private botUsername: string | undefined;
  private botFirstName: string | undefined;
  private lastPollAt: string | undefined;
  private lastMessageAt: string | undefined;
  private totalAnswered = 0;
  private lastError: string | undefined;
  private reconnectingNotice: string | undefined;

  private liveContext: any = null;
  private contextUpdatedAt: string | undefined;
  private chatHistories = new Map<string, Array<{ sender: "user" | "assistant"; content: string }>>();
  private chatWorkerChains = new Map<string, Promise<void>>();
  private telegramLearnedMemories: LearnedMemoryEntry[] = [];
  private processedUpdateIds = new Set<number>();
  private recentChats = new Map<
    string,
    { chatId: string; title: string; type: string; username?: string; lastSeenAt: string }
  >();
  private unsubscribeTakeover: (() => void) | null = null;

  constructor() {
    this.unsubscribeTakeover = subscribeTelegramTakeover((evt) => {
      if (
        evt.winnerInstanceId !== this.instanceId &&
        evt.tokenHash &&
        evt.tokenHash === this.getTokenFingerprint() &&
        (this.pollingActive || this.startingPolling)
      ) {
        this.yieldToRemoteWinner(evt.winnerHost);
      }
    });
  }

  private getTokenFingerprint(token = this.botToken): string {
    if (!token) return "";
    return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  }

  public updateHostLabel(rawHost?: string) {
    const clean = String(rawHost || "").trim().slice(0, 120);
    if (!clean) return;
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(clean);
    if (!isLocal || !this.instanceHost || this.instanceHost === os.hostname()) {
      const changed = this.instanceHost !== clean;
      this.instanceHost = clean;
      if (changed && !isLocal && this.standbyMode && this.standbyHolder === clean) {
        // Container restarted on the same explicit domain: reclaim stale lease within 1s instead of waiting 20s
        this.scheduleStandbyCheck(this.pollLoopGeneration, 1000);
      }
    }
  }

  private normalizeBotToken(raw?: string): string {
    return String(raw || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^bot(?=\d+:)/i, "")
      .trim();
  }

  private recordChatFromMessage(message: any) {
    const chat = message?.chat;
    if (!chat?.id) return;
    const chatId = String(chat.id);
    const type = String(chat.type || "private");
    const title =
      chat.title ||
      [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
      chat.username ||
      `Chat ${chatId}`;
    this.recentChats.set(chatId, {
      chatId,
      title,
      type,
      username: chat.username,
      lastSeenAt: new Date().toISOString(),
    });
  }

  public updateLiveContext(ctx: any) {
    if (ctx && typeof ctx === "object") {
      this.liveContext = ctx;
      this.contextUpdatedAt = new Date().toISOString();
    }
  }

  public getLiveContext() {
    return this.liveContext;
  }

  public getLearnedMemories(): LearnedMemoryEntry[] {
    return this.telegramLearnedMemories;
  }

  private addLearnedMemory(entry: LearnedMemoryEntry) {
    const clean = (entry.content || "").trim().replace(/\s+/g, " ");
    if (!clean || clean.length < 3) return;
    const normalized = clean.toLowerCase();
    if (this.telegramLearnedMemories.some((m) => m.content.trim().toLowerCase() === normalized)) {
      return;
    }
    this.telegramLearnedMemories = [
      {
        id: `TGMEM-${Date.now().toString().slice(-6)}`,
        category: entry.category || "fact",
        content: clean.slice(0, 400),
        source: "telegram" as const,
        createdAt: new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 16),
      },
      ...this.telegramLearnedMemories,
    ].slice(0, 40);
  }

  private getMergedMemories(): LearnedMemoryEntry[] {
    const fromApp: LearnedMemoryEntry[] = Array.isArray(this.liveContext?.assistantMemory?.memories)
      ? this.liveContext.assistantMemory.memories
      : [];
    const seen = new Set<string>();
    const merged: LearnedMemoryEntry[] = [];
    for (const item of [...this.telegramLearnedMemories, ...fromApp]) {
      const key = String(item?.content || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.slice(0, 50);
  }

  public configure(cfg: TelegramConfigInput, forceTakeover = false) {
    const incomingToken = this.normalizeBotToken(cfg.botToken);
    const effectiveToken = incomingToken || this.normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN);
    const nextChatId = (cfg.defaultChatId || "").trim();
    const nextEnabled = Boolean(cfg.enabled && effectiveToken);

    const prevFingerprint = this.getTokenFingerprint();
    const tokenChanged = effectiveToken !== this.botToken;
    const enabledChanged = nextEnabled !== this.enabled;

    this.botToken = effectiveToken;
    this.defaultChatId = nextChatId;
    this.enabled = nextEnabled;

    if (tokenChanged) {
      if (prevFingerprint) {
        void releaseTelegramPollLease(prevFingerprint, this.instanceId);
      }
      this.botUsername = undefined;
      this.botFirstName = undefined;
      this.lastUpdateOffset = 0;
      this.lastError = undefined;
      this.reconnectingNotice = undefined;
      this.conflictDetected = false;
      this.pausedByUser = false;
      this.standbyMode = false;
      this.standbyHolder = undefined;
      this.webhookUrl = undefined;
      this.recentChats.clear();
    }

    if (enabledChanged && nextEnabled) {
      this.pausedByUser = false;
      this.conflictDetected = false;
      this.reconnectingNotice = undefined;
      this.lastError = undefined;
    }

    if (!this.enabled) {
      this.stopPolling();
      this.conflictDetected = false;
      this.standbyMode = false;
      this.standbyHolder = undefined;
      this.reconnectingNotice = undefined;
      const fp = this.getTokenFingerprint();
      if (fp) {
        void releaseTelegramPollLease(fp, this.instanceId);
      }
      return;
    }

    // Never interrupt an active or starting poll loop on routine sync-context / heartbeat calls
    if (!forceTakeover && !tokenChanged && !(enabledChanged && nextEnabled) && (this.pollingActive || this.startingPolling)) {
      return;
    }

    const blockedByGuard =
      this.pausedByUser || this.conflictDetected || this.standbyMode || Boolean(this.webhookUrl);

    if (
      forceTakeover ||
      tokenChanged ||
      (enabledChanged && nextEnabled) ||
      (!this.pollingActive && !this.startingPolling && !blockedByGuard)
    ) {
      this.pausedByUser = false;
      this.conflictDetected = false;
      this.standbyMode = false;
      this.standbyHolder = undefined;
      this.webhookUrl = undefined;
      this.reconnectingNotice = undefined;
      this.lastError = undefined;
      this.startPolling(forceTakeover);
    }
  }

  private resolveMode(): TelegramBotMode {
    if (!this.botToken) return "unconfigured";
    if (this.conflictDetected) return "conflict";
    if (this.pausedByUser || !this.enabled) return "paused";
    if (this.webhookUrl) return "webhook";
    if (this.standbyMode) return "standby";
    if (this.pollingActive || this.startingPolling) return "polling";
    return "paused";
  }

  public getStatus(): TelegramBotStatusSnapshot {
    return {
      configured: Boolean(this.botToken),
      enabled: this.enabled,
      pollingActive: this.pollingActive && !this.conflictDetected && !this.pausedByUser,
      startingPolling: this.startingPolling,
      reconnecting: Boolean(this.reconnectingNotice),
      reconnectingMessage: this.reconnectingNotice,
      conflictDetected: this.conflictDetected,
      pausedByUser: this.pausedByUser,
      standbyMode: this.standbyMode,
      standbyHolder: this.standbyHolder,
      webhookUrl: this.webhookUrl,
      mode: this.resolveMode(),
      instanceHost: this.instanceHost,
      botUsername: this.botUsername,
      botFirstName: this.botFirstName,
      lastPollAt: this.lastPollAt,
      lastMessageAt: this.lastMessageAt,
      totalAnswered: this.totalAnswered,
      hasLiveContext: Boolean(this.liveContext),
      contextUpdatedAt: this.contextUpdatedAt,
      lastError: this.lastError,
      nextConflictRetryAt: this.nextConflictRetryAt,
      autoRecovering: Boolean(
        this.conflictDetected && !this.pausedByUser && this.conflictRecoveryTimer
      ),
    };
  }

  public async waitForPollSettled(timeoutMs = 2600): Promise<TelegramBotStatusSnapshot> {
    const deadline = Date.now() + timeoutMs;
    while (this.startingPolling && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return this.getStatus();
  }

  public getDeliveryConfig() {
    return {
      botToken: this.botToken,
      defaultChatId: this.defaultChatId,
      enabled: this.enabled,
      hostLabel: this.instanceHost,
    };
  }

  private async telegramApiCall(token: string, method: string, body?: any, signal?: AbortSignal) {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const data: any = await res.json();
    if (!res.ok || !data?.ok) {
      const errMsg = data?.description || `Telegram HTTP ${res.status}`;
      const err: any = new Error(errMsg);
      err.statusCode = data?.error_code || res.status;
      throw err;
    }
    return data.result;
  }

  private escapeHtml(text: string): string {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private formatMarkdownToTelegramHtml(text: string): string {
    // Extract safe markdown links [title](https://...) before escaping
    const linkPlaceholders: Array<{ token: string; html: string }> = [];
    const withLinkTokens = String(text || "").replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label, url) => {
        const token = `@@TGLINK_${linkPlaceholders.length}@@`;
        const safeUrl = url.replace(/"/g, "&quot;");
        linkPlaceholders.push({
          token,
          html: `<a href="${safeUrl}">${this.escapeHtml(label)}</a>`,
        });
        return token;
      }
    );

    let formatted = this.escapeHtml(withLinkTokens)
      .replace(/^#{1,4}\s+(.+)$/gm, "<b>$1</b>")
      .replace(/^(\s*)-\s+/gm, "$1• ")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/(^|\s)_([^_\n]+?)_(?=\s|[.,;:!?)]|$)/gm, "$1<i>$2</i>");

    for (const lp of linkPlaceholders) {
      formatted = formatted.replace(lp.token, lp.html);
    }
    return formatted;
  }

  private splitTelegramMessage(text: string, maxLen = 3200): string[] {
    const clean = String(text || "");
    if (clean.length <= maxLen) return [clean];
    const chunks: string[] = [];
    let remaining = clean;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf("\n\n", maxLen);
      if (splitAt < maxLen * 0.45) {
        splitAt = remaining.lastIndexOf("\n", maxLen);
      }
      if (splitAt < maxLen * 0.45) {
        splitAt = remaining.lastIndexOf(" ", maxLen);
      }
      if (splitAt < maxLen * 0.35) {
        splitAt = maxLen;
      }
      chunks.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
    return chunks.filter((c) => c.length > 0);
  }

  public async sendMessage(chatId: string | number, rawText: string, tokenOverride?: string) {
    const token = tokenOverride || this.botToken;
    if (!token) throw new Error("Thiếu Telegram Bot Token");

    // Chunk raw markdown FIRST along natural line/section boundaries so HTML tags never split mid-tag
    const rawChunks = this.splitTelegramMessage(rawText, 3200);

    for (const rawChunk of rawChunks) {
      const htmlBody = this.formatMarkdownToTelegramHtml(rawChunk);
      const safeHtmlChunks =
        htmlBody.length > 4000 ? this.splitTelegramMessage(rawChunk, 2400).map((c) => this.formatMarkdownToTelegramHtml(c)) : [htmlBody];

      for (const chunk of safeHtmlChunks) {
        try {
          await this.telegramApiCall(token, "sendMessage", {
            chat_id: chatId,
            text: chunk,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
        } catch {
          // Fallback plain text if Telegram rejects any HTML formatting
          await this.telegramApiCall(token, "sendMessage", {
            chat_id: chatId,
            text: chunk.replace(/<\/?(b|i|code|a|pre|u|s)[^>]*>/g, ""),
            disable_web_page_preview: true,
          });
        }
      }
    }
  }

  public async testConnection(tokenInput?: string, testChatId?: string) {
    const token = this.normalizeBotToken(tokenInput) || this.botToken;
    if (!token) {
      throw new Error("Vui lòng nhập Telegram Bot Token trước khi kiểm tra.");
    }

    const me = await this.telegramApiCall(token, "getMe");
    this.botUsername = me.username;
    this.botFirstName = me.first_name;
    this.lastError = undefined;

    await this.telegramApiCall(token, "setMyCommands", {
      commands: [
        { command: "tomtat", description: "Tóm tắt nhanh giao ban toàn khoa" },
        { command: "giaoban", description: "Báo cáo số ca, thiết bị & lịch trực hôm nay" },
        { command: "hoi", description: "Hỏi Trợ lý AI (dữ liệu app + Internet)" },
        { command: "nho", description: "Dạy Trợ lý ghi nhớ quy ước hoặc kiến thức mới" },
        { command: "help", description: "Xem hướng dẫn sử dụng trợ lý" },
      ],
    }).catch(() => {});

    let messageSent = false;
    const targetChatId = (testChatId || this.defaultChatId || "").trim();
    if (targetChatId) {
      const ctxStatus = this.liveContext
        ? `Đã kết nối dữ liệu thực tế (${this.liveContext?.caseReports?.monthlyTotals?.length || 0} tháng báo cáo, ${this.liveContext?.equipment?.totalCount || 0} thiết bị, ${this.liveContext?.rooms?.roomsCount || 0} phòng) + tra cứu Internet.`
        : "Đã sẵn sàng tra cứu Internet và đang chờ đồng bộ ảnh dữ liệu từ trình duyệt.";

      await this.sendMessage(
        targetChatId,
        `🤖 **Trợ Lý Ảo CLS WorkHub (@${me.username}) đã sẵn sàng!**\n${ctxStatus}\n\nBạn có thể hỏi bất kỳ điều gì từ số liệu khoa đến kiến thức y khoa / thời sự (VD: "Báo cáo chi tiết số liệu ngày 16?", "Máy nào sắp hết hạn bảo trì?", "Quy định mới về kiểm chuẩn xét nghiệm?").\nHoặc dùng /nho <nội dung> để dạy tôi ghi nhớ quy ước của khoa.`,
        token
      );
      messageSent = true;
    }

    return {
      botUsername: me.username,
      botFirstName: me.first_name,
      messageSent,
      targetChatId,
    };
  }

  public async detectRecentChats(tokenInput?: string) {
    const token = this.normalizeBotToken(tokenInput) || this.botToken;
    if (!token) {
      throw new Error("Vui lòng nhập Telegram Bot Token trước khi dò Chat ID.");
    }

    const isSameConfiguredBot = token === this.botToken;
    if (isSameConfiguredBot && this.pollingActive && this.recentChats.size > 0) {
      return Array.from(this.recentChats.values()).sort((a, b) =>
        b.lastSeenAt.localeCompare(a.lastSeenAt)
      );
    }
    if (isSameConfiguredBot && this.standbyMode) {
      if (this.recentChats.size > 0) {
        return Array.from(this.recentChats.values()).sort((a, b) =>
          b.lastSeenAt.localeCompare(a.lastSeenAt)
        );
      }
      throw new Error(
        `Phiên bản khác (${this.standbyHolder || "máy chủ chính"}) đang giữ quyền lắng nghe Bot. Hãy bấm "Chuyển quyền Polling về đây" hoặc thao tác trên phiên bản chính để dò Chat ID mà không gây trùng lặp.`
      );
    }

    try {
      const me = await this.telegramApiCall(token, "getMe");
      if (isSameConfiguredBot) {
        this.botUsername = me.username;
        this.botFirstName = me.first_name;
      }
    } catch (err: any) {
      const code = err?.statusCode;
      if (code === 401 || code === 404) {
        throw new Error(
          "Telegram Bot Token không hợp lệ (lỗi 401/404). Vui lòng sao chép đúng Token từ @BotFather."
        );
      }
      throw new Error(`Không thể kết nối Telegram với Bot Token này: ${err?.message || "Lỗi mạng"}`);
    }

    const wasPollingSameToken = isSameConfiguredBot && (this.pollingActive || this.startingPolling);
    if (wasPollingSameToken) {
      this.stopPolling();
      await new Promise((r) => setTimeout(r, 1200));
    }

    try {
      await this.telegramApiCall(token, "deleteWebhook", {
        drop_pending_updates: false,
      }).catch(() => {});

      let updates: any[] = [];
      try {
        updates = await this.telegramApiCall(token, "getUpdates", {
          limit: 50,
          timeout: 0,
          allowed_updates: ["message", "edited_message", "channel_post", "my_chat_member", "chat_member"],
        });
      } catch (err: any) {
        if (err?.statusCode === 409) {
          await new Promise((r) => setTimeout(r, 1200));
          try {
            updates = await this.telegramApiCall(token, "getUpdates", {
              limit: 50,
              timeout: 0,
              allowed_updates: ["message", "edited_message", "channel_post", "my_chat_member", "chat_member"],
            });
          } catch (retryErr: any) {
            if (isSameConfiguredBot && this.recentChats.size > 0) {
              return Array.from(this.recentChats.values()).sort((a, b) =>
                b.lastSeenAt.localeCompare(a.lastSeenAt)
              );
            }
            if (retryErr?.statusCode === 409) {
              throw new Error(
                "Bot Token này đang có một kết nối lấy tin (getUpdates) khác đang chạy cùng lúc (lỗi 409 Conflict). Hãy đóng ứng dụng/tab khác đang dùng chung Bot Token hoặc thử lại sau vài giây."
              );
            }
            throw retryErr;
          }
        } else {
          throw err;
        }
      }

      if (Array.isArray(updates)) {
        for (const upd of updates) {
          const chatHolder =
            upd?.message ||
            upd?.edited_message ||
            upd?.channel_post ||
            upd?.my_chat_member ||
            upd?.chat_member;
          if (chatHolder?.chat) {
            this.recordChatFromMessage(chatHolder);
          }
        }
      }
    } finally {
      if (wasPollingSameToken && this.enabled && this.botToken && !this.pausedByUser && !this.conflictDetected) {
        this.startPolling(false);
      }
    }

    return Array.from(this.recentChats.values()).sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    );
  }

  public async verifyBotExclusivity(tokenInput?: string): Promise<TelegramExclusivityReport> {
    const token = this.normalizeBotToken(tokenInput) || this.botToken;
    if (!token) {
      throw new Error("Vui lòng nhập hoặc lưu Telegram Bot Token trước khi kiểm tra.");
    }

    const me = await this.telegramApiCall(token, "getMe");
    const isSameConfiguredBot = token === this.botToken;
    if (isSameConfiguredBot) {
      this.botUsername = me.username;
      this.botFirstName = me.first_name;
    }

    const webhookInfo = await this.telegramApiCall(token, "getWebhookInfo").catch(() => null);
    const webhookUrl = typeof webhookInfo?.url === "string" ? webhookInfo.url.trim() : "";
    const pendingUpdateCount = Number(webhookInfo?.pending_update_count || 0);

    const tokenHash = this.getTokenFingerprint(token);
    const leaseInfo = await getTelegramPollLeaseInfo(tokenHash);
    const leaseHeldByThisInstance = Boolean(
      leaseInfo.active && leaseInfo.holderInstanceId === this.instanceId
    );

    if (webhookUrl) {
      return {
        checkedAt: new Date().toISOString(),
        botId: me.id,
        botUsername: me.username,
        botFirstName: me.first_name,
        isExclusive: false,
        statusCode: "EXTERNAL_WEBHOOK",
        summary: `Bot @${me.username} đang trỏ Webhook ra ngoài tại ${webhookUrl}. Nếu đây không phải máy chủ của bạn, hãy bấm Kết nối lại hoặc tạo/thu hồi Token mới qua @BotFather.`,
        webhookUrl,
        pendingUpdateCount,
        externalListenerDetected: true,
        leaseSupported: leaseInfo.supported,
        leaseHolderHost: leaseInfo.holderLabel,
        leaseHeldByThisInstance,
      };
    }

    if (
      this.standbyMode &&
      leaseInfo.active &&
      !leaseHeldByThisInstance &&
      leaseInfo.holderLabel &&
      leaseInfo.holderLabel !== this.instanceHost
    ) {
      return {
        checkedAt: new Date().toISOString(),
        botId: me.id,
        botUsername: me.username,
        botFirstName: me.first_name,
        isExclusive: false,
        statusCode: "EXTERNAL_POLLING",
        summary: `Phiên bản khác (${leaseInfo.holderLabel}) đang giữ quyền lắng nghe Bot @${me.username}. Nếu muốn dùng tại đây, hãy bấm "Chiếm quyền & Kết nối lại tại đây".`,
        webhookUrl: "",
        pendingUpdateCount,
        externalListenerDetected: true,
        leaseSupported: leaseInfo.supported,
        leaseHolderHost: leaseInfo.holderLabel,
        leaseHeldByThisInstance: false,
      };
    }

    const wasPollingSameToken = isSameConfiguredBot && (this.pollingActive || this.startingPolling);
    const wasSameHostStandby =
      isSameConfiguredBot &&
      this.standbyMode &&
      (!this.standbyHolder || this.standbyHolder === this.instanceHost);
    if (wasPollingSameToken) {
      this.stopPolling();
      if (tokenHash) {
        await releaseTelegramPollLease(tokenHash, this.instanceId);
      }
      await new Promise((r) => setTimeout(r, 1200));
    }

    let externalListenerDetected = false;
    let transientClearedOwnSocket = false;
    const waitSteps = wasPollingSameToken ? [0, 3500, 5500] : [0, 2500];

    try {
      for (let i = 0; i < waitSteps.length; i++) {
        if (waitSteps[i] > 0) {
          await new Promise((r) => setTimeout(r, waitSteps[i]));
        }
        try {
          await this.telegramApiCall(token, "getUpdates", {
            offset: this.lastUpdateOffset || undefined,
            limit: 1,
            timeout: 2,
            allowed_updates: ["message", "edited_message", "channel_post", "my_chat_member"],
          });
          externalListenerDetected = false;
          transientClearedOwnSocket = true;
          break;
        } catch (err: any) {
          if (err?.statusCode === 409) {
            externalListenerDetected = true;
            continue;
          }
          throw err;
        }
      }
    } finally {
      if (
        isSameConfiguredBot &&
        this.enabled &&
        this.botToken &&
        !this.pausedByUser &&
        (wasPollingSameToken ||
          ((this.conflictDetected || wasSameHostStandby) && !externalListenerDetected && transientClearedOwnSocket))
      ) {
        this.conflictDetected = false;
        this.standbyMode = false;
        this.standbyHolder = undefined;
        this.reconnectingNotice = undefined;
        this.lastError = undefined;
        this.startPolling(true);
        await this.waitForPollSettled(2500);
      }
    }

    if (externalListenerDetected) {
      const otherHost =
        leaseInfo.active && !leaseHeldByThisInstance ? leaseInfo.holderLabel : undefined;
      return {
        checkedAt: new Date().toISOString(),
        botId: me.id,
        botUsername: me.username,
        botFirstName: me.first_name,
        isExclusive: false,
        statusCode: "EXTERNAL_POLLING",
        summary: otherHost
          ? `Phát hiện phiên bản khác (${otherHost}) của ứng dụng đang giữ quyền lắng nghe getUpdates cho @${me.username}.`
          : `Phát hiện có một tiến trình/ứng dụng khác bên ngoài đang gọi getUpdates bằng Token của @${me.username}. Để cắt đứt hoàn toàn mọi ứng dụng ngoài, hãy vào @BotFather chạy /revoke để đổi Token mới.`,
        webhookUrl: "",
        pendingUpdateCount,
        externalListenerDetected: true,
        leaseSupported: leaseInfo.supported,
        leaseHolderHost: leaseInfo.holderLabel,
        leaseHeldByThisInstance,
      };
    }

    const updatedLease = await getTelegramPollLeaseInfo(tokenHash);
    return {
      checkedAt: new Date().toISOString(),
      botId: me.id,
      botUsername: me.username,
      botFirstName: me.first_name,
      isExclusive: true,
      statusCode: "EXCLUSIVE",
      summary: `Đã kiểm tra trực tiếp trên Telegram API: Không có Webhook ngoài và không có ứng dụng nào khác đang lắng nghe @${me.username}. Bot đang dùng riêng cho ứng dụng hiện tại.`,
      webhookUrl: "",
      pendingUpdateCount,
      externalListenerDetected: false,
      leaseSupported: updatedLease.supported,
      leaseHolderHost: updatedLease.holderLabel || this.instanceHost,
      leaseHeldByThisInstance: Boolean(
        updatedLease.active && updatedLease.holderInstanceId === this.instanceId
      ),
    };
  }

  public async handleIncomingUpdate(update: any): Promise<void> {
    if (!update || typeof update !== "object") return;
    const updateId = Number(update.update_id);
    if (updateId && this.processedUpdateIds.has(updateId)) return;
    if (updateId) {
      this.processedUpdateIds.add(updateId);
      if (this.processedUpdateIds.size > 500) {
        const first = this.processedUpdateIds.values().next().value;
        if (first !== undefined) this.processedUpdateIds.delete(first);
      }
    }

    const anyChatHolder =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.my_chat_member ||
      update.chat_member;
    if (anyChatHolder?.chat) {
      this.recordChatFromMessage(anyChatHolder);
    }

    const message = update.message || update.edited_message;
    const rawBody = message?.text ?? message?.caption;
    if (!message || !rawBody || message.from?.is_bot) return;

    const chatId = message.chat?.id;
    const chatType = message.chat?.type || "private";
    const senderName =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
      message.from?.username ||
      "Cán bộ CLS";
    const rawText = String(rawBody || "").trim();
    if (!chatId || !rawText) return;

    const isCommand = rawText.startsWith("/");
    const botMention = this.botUsername ? `@${this.botUsername.toLowerCase()}` : "";
    const mentionsBot = botMention ? rawText.toLowerCase().includes(botMention) : false;
    const isReplyToBot = Boolean(
      message.reply_to_message?.from?.is_bot &&
        (!this.botUsername ||
          message.reply_to_message?.from?.username?.toLowerCase() === this.botUsername.toLowerCase())
    );

    if (chatType !== "private" && !isCommand && !mentionsBot && !isReplyToBot) {
      return;
    }

    this.lastMessageAt = new Date().toISOString();

    let typingTimer: NodeJS.Timeout | null = null;
    try {
      const sendTyping = () =>
        this.telegramApiCall(this.botToken, "sendChatAction", {
          chat_id: chatId,
          action: "typing",
        }).catch(() => {});

      await sendTyping();
      typingTimer = setInterval(() => {
        void sendTyping();
      }, 4500);

      const cleanText = botMention
        ? rawText.replace(new RegExp(`@${this.botUsername}`, "ig"), "").trim()
        : rawText;

      if (/^\/(start|help)(?:@\S+)?(?:\s|$)/i.test(cleanText)) {
        const helpMsg =
          `🏥 **Trợ Lý Ảo Thông Minh Khoa Cận Lâm Sàng (CLS WorkHub)**\n` +
          `Tôi kết nối trực tiếp dữ liệu khoa (số ca, máy móc, lịch trực, nhân sự, SOP) **và tra cứu Internet trực tiếp**, đồng thời ghi nhớ các quy ước bạn dạy.\n\n` +
          `📌 **Lệnh nhanh:**\n` +
          `• /tomtat hoặc /giaoban — Tóm tắt giao ban toàn khoa\n` +
          `• /hoi <câu hỏi> — Hỏi Trợ lý trong nhóm chat\n` +
          `• /nho <quy ước/kiến thức> — Dạy Trợ lý ghi nhớ lâu dài\n\n` +
          `💬 **Hoặc nhắn tự nhiên (chat riêng):**\n` +
          `• "Báo cáo chi tiết số liệu ngày 16"\n` +
          `• "Máy nào sắp đến hạn bảo trì hoặc kiểm chuẩn?"\n` +
          `• "Ai đang nghỉ phép tuần này?"`;
        await this.sendMessage(chatId, helpMsg);
        this.totalAnswered += 1;
        return;
      }

      const nhoMatch = cleanText.match(/^\/(nho|remember)(?:@\S+)?(?:\s+([\s\S]+))?$/i);
      if (nhoMatch) {
        const memo = (nhoMatch[2] || "").trim();
        if (!memo) {
          await this.sendMessage(
            chatId,
            "Vui lòng nhập nội dung cần tôi ghi nhớ sau lệnh, ví dụ: `/nho Phòng SA-02 ưu tiên ca cấp cứu trước 9h sáng`."
          );
          return;
        }
        this.addLearnedMemory({ content: memo, category: "rule", source: "telegram" });
        await this.sendMessage(
          chatId,
          `✅ **Đã ghi nhớ!** Tôi sẽ áp dụng lưu ý này cho các lần tư vấn và báo cáo sau:\n• "${memo}"`
        );
        this.totalAnswered += 1;
        return;
      }

      let question = cleanText;
      const askMatch = cleanText.match(/^\/(hoi|ask|web)(?:@\S+)?(?:\s+([\s\S]+))?$/i);
      if (/^\/(tomtat|giaoban)(?:@\S+)?(?:\s|$)/i.test(cleanText)) {
        question =
          "Hãy tóm tắt nhanh tình hình toàn khoa hiện tại: số liệu ca gần nhất, tình trạng thiết bị cảnh báo, phòng quá tải, lịch trực hôm nay và công việc cần xử lý.";
      } else if (askMatch) {
        question = (askMatch[2] || "").trim();
      }

      if (!question) {
        await this.sendMessage(chatId, "Vui lòng nhập câu hỏi sau lệnh, ví dụ: `/hoi Hôm nay có bao nhiêu ca?`");
        return;
      }

      const historyKey = String(chatId);
      const prevHistory = this.chatHistories.get(historyKey) || [];

      const result = await askHospitalAssistant({
        question,
        history: prevHistory,
        liveContext: this.liveContext,
        learnedMemories: this.getMergedMemories(),
        useWebSearch: this.liveContext?.assistantMemory?.webSearchEnabled !== false,
        userName: senderName,
        channel: "telegram",
      });

      if (result.newlyLearnedMemory) {
        this.addLearnedMemory({
          ...result.newlyLearnedMemory,
          source: "telegram",
        });
      }

      const updatedHistory = [
        ...prevHistory,
        { sender: "user" as const, content: question },
        { sender: "assistant" as const, content: result.answer },
      ].slice(-8);
      this.chatHistories.set(historyKey, updatedHistory);

      const webLinksBlock =
        result.webSources && result.webSources.length > 0
          ? `\n\n🌐 **Tham khảo Internet:**\n` +
            result.webSources
              .slice(0, 4)
              .map((w) => `• [${w.title}](${w.uri})`)
              .join("\n")
          : "";

      const sourcesLine =
        result.dataSourcesUsed.length > 0
          ? `\n\n📂 Nguồn: ${result.dataSourcesUsed.join(", ")}`
          : "";

      const learnedBanner = result.newlyLearnedMemory
        ? `\n\n🧠 _Đã ghi nhớ thêm: "${result.newlyLearnedMemory.content}"_`
        : "";

      await this.sendMessage(chatId, `${result.answer}${webLinksBlock}${learnedBanner}${sourcesLine}`);
      this.totalAnswered += 1;
      this.lastError = undefined;
    } catch (err: any) {
      console.error("[TelegramBot] handleIncomingUpdate error:", err);
      this.lastError = err?.message || "Lỗi xử lý tin nhắn Telegram";
      await this.sendMessage(
        chatId,
        `Xin lỗi ${senderName}, tôi vừa gặp sự cố kỹ thuật tạm thời khi xử lý yêu cầu (${this.lastError}). Bạn vui lòng thử gửi lại câu hỏi sau ít giây nhé.`
      ).catch(() => {});
    } finally {
      if (typingTimer) clearInterval(typingTimer);
    }
  }

  private clearStandbyTimer() {
    if (this.standbyTimer) {
      clearTimeout(this.standbyTimer);
      this.standbyTimer = null;
    }
  }

  private clearConflictRecoveryTimer() {
    if (this.conflictRecoveryTimer) {
      clearTimeout(this.conflictRecoveryTimer);
      this.conflictRecoveryTimer = null;
    }
    this.nextConflictRetryAt = undefined;
  }

  private clearLeaseHeartbeatTimer() {
    if (this.leaseHeartbeatTimer) {
      clearInterval(this.leaseHeartbeatTimer);
      this.leaseHeartbeatTimer = null;
    }
  }

  private yieldToRemoteWinner(holderLabel?: string) {
    this.stopPolling();
    this.conflictDetected = false;
    this.standbyMode = true;
    this.standbyHolder = holderLabel || "Phiên bản máy chủ khác";
    this.reconnectingNotice = undefined;
    this.lastError = undefined;
    this.scheduleStandbyCheck(this.pollLoopGeneration);
  }

  private startLeaseHeartbeat(gen: number, tokenHash: string) {
    this.clearLeaseHeartbeatTimer();
    if (!tokenHash) return;

    this.leaseHeartbeatTimer = setInterval(() => {
      if (gen !== this.pollLoopGeneration || !this.enabled || !this.botToken || this.pausedByUser) {
        this.clearLeaseHeartbeatTimer();
        return;
      }
      void renewTelegramPollLease(tokenHash, this.instanceId, this.instanceHost, 45000).then(
        (res) => {
          if (gen !== this.pollLoopGeneration) return;
          if (!res.acquired) {
            this.yieldToRemoteWinner(res.holderLabel);
          }
        }
      );
    }, 5000);
    this.leaseHeartbeatTimer.unref?.();
  }

  private enqueueChatUpdate(update: any) {
    const chatId = String(
      update?.message?.chat?.id ||
        update?.edited_message?.chat?.id ||
        update?.channel_post?.chat?.id ||
        "global"
    );
    const prev = this.chatWorkerChains.get(chatId) || Promise.resolve();
    const next = prev
      .then(() => this.handleIncomingUpdate(update))
      .catch((err) => {
        console.error("[TelegramBot] Async chat worker error:", err);
      })
      .finally(() => {
        if (this.chatWorkerChains.get(chatId) === next) {
          this.chatWorkerChains.delete(chatId);
        }
      });
    this.chatWorkerChains.set(chatId, next);
  }

  private scheduleConflictRecovery(gen: number, delayMs = 30000) {
    this.clearConflictRecoveryTimer();
    if (!this.enabled || !this.botToken || this.pausedByUser) return;

    this.nextConflictRetryAt = new Date(Date.now() + delayMs).toISOString();
    this.conflictRecoveryTimer = setTimeout(() => {
      this.conflictRecoveryTimer = null;
      this.nextConflictRetryAt = undefined;
      if (gen !== this.pollLoopGeneration || !this.enabled || !this.botToken || this.pausedByUser) {
        return;
      }
      this.conflictDetected = false;
      this.reconnectingNotice = "Đang tự động thử kết nối lại Telegram polling...";
      this.lastError = undefined;
      this.startPolling(false);
    }, delayMs);
    this.conflictRecoveryTimer.unref?.();
  }

  private scheduleStandbyCheck(gen: number, delayMs?: number) {
    this.clearStandbyTimer();
    if (!this.enabled || !this.botToken || this.pausedByUser) return;

    const isSameHostStale = Boolean(this.standbyHolder && this.standbyHolder === this.instanceHost);
    const effectiveDelay = typeof delayMs === "number" ? delayMs : isSameHostStale ? 3500 : 20000;

    this.standbyTimer = setTimeout(async () => {
      if (gen !== this.pollLoopGeneration || !this.enabled || !this.botToken || this.pausedByUser) {
        return;
      }
      const fp = this.getTokenFingerprint();
      const lease = await acquireTelegramPollLease(fp, this.instanceId, this.instanceHost, 45000, false);
      if (gen !== this.pollLoopGeneration || !this.enabled || !this.botToken || this.pausedByUser) {
        return;
      }
      if (lease.acquired) {
        this.standbyMode = false;
        this.standbyHolder = undefined;
        this.startPolling(false);
      } else {
        this.standbyHolder = lease.holderLabel || this.standbyHolder;
        this.scheduleStandbyCheck(gen);
      }
    }, effectiveDelay);
    this.standbyTimer.unref?.();
  }

  private async abortableSleep(ms: number, gen: number): Promise<boolean> {
    if (gen !== this.pollLoopGeneration) return false;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.sleepCancel = null;
        resolve(gen === this.pollLoopGeneration);
      }, ms);
      this.sleepCancel = () => {
        clearTimeout(timer);
        this.sleepCancel = null;
        resolve(false);
      };
    });
  }

  private stopPolling() {
    this.pollLoopGeneration += 1;
    this.pollingActive = false;
    this.startingPolling = false;
    this.clearStandbyTimer();
    this.clearConflictRecoveryTimer();
    this.clearLeaseHeartbeatTimer();
    if (this.sleepCancel) {
      this.sleepCancel();
      this.sleepCancel = null;
    }
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
  }

  public async pausePolling(): Promise<TelegramBotStatusSnapshot> {
    this.pausedByUser = true;
    this.conflictDetected = false;
    this.standbyMode = false;
    this.standbyHolder = undefined;
    this.reconnectingNotice = undefined;
    this.lastError = undefined;
    this.stopPolling();
    const fp = this.getTokenFingerprint();
    if (fp) {
      await releaseTelegramPollLease(fp, this.instanceId);
    }
    return this.getStatus();
  }

  public async retryPolling(forceTakeover = true): Promise<TelegramBotStatusSnapshot> {
    if (!this.botToken) {
      throw new Error("Chưa cấu hình Telegram Bot Token.");
    }
    this.enabled = true;
    this.pausedByUser = false;
    this.conflictDetected = false;
    this.standbyMode = false;
    this.standbyHolder = undefined;
    this.webhookUrl = undefined;
    this.reconnectingNotice = undefined;
    this.lastError = undefined;

    this.startPolling(forceTakeover);
    return this.waitForPollSettled(3200);
  }

  public async shutdown(): Promise<void> {
    this.stopPolling();
    if (this.unsubscribeTakeover) {
      this.unsubscribeTakeover();
      this.unsubscribeTakeover = null;
    }
    const fp = this.getTokenFingerprint();
    if (fp) {
      await releaseTelegramPollLease(fp, this.instanceId);
    }
  }

  private startPolling(forceTakeover = false) {
    this.stopPolling();
    if (!this.botToken || !this.enabled || this.pausedByUser) return;

    const myGen = ++this.pollLoopGeneration;
    const tokenSnapshot = this.botToken;
    const tokenHash = this.getTokenFingerprint(tokenSnapshot);
    this.startingPolling = true;

    const runLoop = async () => {
      try {
        // 1. Coordinate single active poller across instances sharing Postgres DB
        const lease = await acquireTelegramPollLease(
          tokenHash,
          this.instanceId,
          this.instanceHost,
          45000,
          forceTakeover
        );
        if (myGen !== this.pollLoopGeneration) return;

        if (!lease.acquired) {
          this.startingPolling = false;
          this.pollingActive = false;
          this.standbyMode = true;
          this.standbyHolder = lease.holderLabel || "Phiên bản máy chủ khác";
          this.conflictDetected = false;
          this.reconnectingNotice = undefined;
          this.lastError = undefined;
          this.scheduleStandbyCheck(myGen);
          return;
        }

        // Start 5s independent heartbeat immediately so slow Gemini responses NEVER let the lease expire
        this.startLeaseHeartbeat(myGen, tokenHash);

        // Give the displaced peer instance a brief moment to abort its getUpdates socket via pg_notify
        if (lease.tookOverFromInstanceId) {
          this.reconnectingNotice = `Đang chuyển quyền lắng nghe từ ${lease.tookOverFromHost || "phiên bản khác"} về máy chủ này...`;
          const ok = await this.abortableSleep(1500, myGen);
          if (!ok || myGen !== this.pollLoopGeneration) return;
        }

        // Hydrate persisted update offset so restarts never drop or duplicate messages
        if (this.lastUpdateOffset === 0 && tokenHash) {
          const savedOffset = await loadTelegramUpdateOffsetFromDb(tokenHash);
          if (myGen !== this.pollLoopGeneration) return;
          if (savedOffset > this.lastUpdateOffset) {
            this.lastUpdateOffset = savedOffset;
          }
        }

        // 2. Verify token & check webhook status
        const me = await this.telegramApiCall(tokenSnapshot, "getMe");
        if (myGen !== this.pollLoopGeneration) return;
        this.botUsername = me.username;
        this.botFirstName = me.first_name;

        const webhookInfo = await this.telegramApiCall(tokenSnapshot, "getWebhookInfo").catch(() => null);
        if (myGen !== this.pollLoopGeneration) return;

        const activeWebhookUrl = typeof webhookInfo?.url === "string" ? webhookInfo.url.trim() : "";
        if (activeWebhookUrl && !forceTakeover) {
          this.startingPolling = false;
          this.webhookUrl = activeWebhookUrl;
          this.pollingActive = false;
          this.conflictDetected = false;
          this.standbyMode = false;
          this.reconnectingNotice = undefined;
          this.lastError = undefined;
          this.clearLeaseHeartbeatTimer();
          await releaseTelegramPollLease(tokenHash, this.instanceId);
          return;
        }

        if (activeWebhookUrl || forceTakeover) {
          await this.telegramApiCall(tokenSnapshot, "deleteWebhook", {
            drop_pending_updates: false,
          }).catch(() => {});
          if (myGen !== this.pollLoopGeneration) return;
        }

        this.webhookUrl = undefined;
        this.standbyMode = false;
        this.standbyHolder = undefined;
        this.conflictDetected = false;
        this.clearConflictRecoveryTimer();
        this.reconnectingNotice = undefined;
        this.lastError = undefined;
        this.startingPolling = false;
        this.pollingActive = true;
      } catch (err: any) {
        if (myGen !== this.pollLoopGeneration) return;
        this.startingPolling = false;
        this.pollingActive = false;
        this.reconnectingNotice = undefined;
        this.lastError = `Token không hợp lệ hoặc mất kết nối Telegram: ${err?.message || "Unknown"}`;
        this.clearLeaseHeartbeatTimer();
        await releaseTelegramPollLease(tokenHash, this.instanceId);
        // Retry automatically on transient network glitches
        this.scheduleConflictRecovery(myGen, 25000);
        return;
      }

      let consecutiveConflicts = 0;
      let isFirstProbe = true;
      const CONFLICT_BACKOFF_MS = [1500, 2500, 3500, 4500, 6000, 7000];
      const MAX_TRANSIENT_CONFLICTS = CONFLICT_BACKOFF_MS.length;

      while (myGen === this.pollLoopGeneration && this.enabled && this.botToken === tokenSnapshot && !this.pausedByUser) {
        try {
          this.pollAbortController = new AbortController();
          this.lastPollAt = new Date().toISOString();

          const pollTimeoutSec = isFirstProbe ? 1 : 8;
          isFirstProbe = false;

          const url = `https://api.telegram.org/bot${tokenSnapshot}/getUpdates?offset=${
            this.lastUpdateOffset
          }&timeout=${pollTimeoutSec}&allowed_updates=${encodeURIComponent(
            JSON.stringify(["message", "edited_message", "channel_post", "my_chat_member"])
          )}`;

          const res = await fetch(url, { signal: this.pollAbortController.signal });
          const payload: any = await res.json();

          if (myGen !== this.pollLoopGeneration) break;

          if (!res.ok || !payload?.ok) {
            const errCode = payload?.error_code || res.status;

            if (errCode === 409) {
              // Confirm immediately whether another instance legitimately holds the DB lease
              const currentLease = await getTelegramPollLeaseInfo(tokenHash);
              if (myGen !== this.pollLoopGeneration) break;
              if (currentLease.active && currentLease.holderInstanceId !== this.instanceId) {
                this.yieldToRemoteWinner(currentLease.holderLabel);
                break;
              }

              consecutiveConflicts += 1;
              if (consecutiveConflicts <= MAX_TRANSIENT_CONFLICTS) {
                this.reconnectingNotice = `Đang chờ phiên getUpdates cũ đóng hoàn toàn (${consecutiveConflicts}/${MAX_TRANSIENT_CONFLICTS})...`;
                this.lastError = undefined;
                const waitMs = CONFLICT_BACKOFF_MS[consecutiveConflicts - 1] || 5000;
                const shouldContinue = await this.abortableSleep(waitMs, myGen);
                if (!shouldContinue) break;
                continue;
              }

              // Persistent external 409 Conflict -> halt polling cleanly AND schedule automatic retry
              this.pollingActive = false;
              this.conflictDetected = true;
              this.standbyMode = false;
              this.reconnectingNotice = undefined;
              this.lastError = `Phát hiện một ứng dụng/tiến trình bên ngoài khác đang gọi getUpdates bằng chung Token${
                this.botUsername ? ` (@${this.botUsername})` : ""
              }. Hệ thống đã tạm dừng để tránh xung đột 409 và tự động kiểm tra lại sau 30 giây.`;
              this.clearLeaseHeartbeatTimer();
              await releaseTelegramPollLease(tokenHash, this.instanceId);
              this.scheduleConflictRecovery(myGen, 30000);
              break;
            }

            if (errCode === 401 || errCode === 404) {
              this.pollingActive = false;
              this.reconnectingNotice = undefined;
              this.lastError = "Telegram Bot Token không hợp lệ hoặc đã bị thu hồi (401/404).";
              this.clearLeaseHeartbeatTimer();
              await releaseTelegramPollLease(tokenHash, this.instanceId);
              break;
            }

            this.lastError = payload?.description || `Telegram Poll HTTP ${res.status}`;
            const shouldContinue = await this.abortableSleep(4000, myGen);
            if (!shouldContinue) break;
            continue;
          }

          consecutiveConflicts = 0;
          this.conflictDetected = false;
          this.clearConflictRecoveryTimer();
          this.reconnectingNotice = undefined;
          this.pollingActive = true;
          this.lastError = undefined;
          const updates = Array.isArray(payload.result) ? payload.result : [];
          for (const upd of updates) {
            if (upd.update_id >= this.lastUpdateOffset) {
              this.lastUpdateOffset = upd.update_id + 1;
              void saveTelegramUpdateOffsetToDb(tokenHash, this.lastUpdateOffset);
            }
            // Run AI replies in non-blocking per-chat workers so poll loop & lease heartbeat never stall
            this.enqueueChatUpdate(upd);
          }
        } catch (err: any) {
          if (err?.name === "AbortError" || myGen !== this.pollLoopGeneration) {
            break;
          }
          this.lastError = err?.message || "Mất kết nối tạm thời khi lắng nghe Telegram";
          const shouldContinue = await this.abortableSleep(4000, myGen);
          if (!shouldContinue) break;
        }
      }

      if (myGen === this.pollLoopGeneration) {
        this.startingPolling = false;
        this.pollingActive = false;
        this.clearLeaseHeartbeatTimer();
      }
    };

    void runLoop();
  }
}

export const telegramManager = new TelegramAssistantManager();
