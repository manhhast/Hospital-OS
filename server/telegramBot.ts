import {
  askHospitalAssistant,
  type LearnedMemoryEntry,
} from "./assistantEngine";

export interface TelegramConfigInput {
  botToken: string;
  defaultChatId?: string;
  enabled: boolean;
}

export interface TelegramBotStatusSnapshot {
  configured: boolean;
  enabled: boolean;
  pollingActive: boolean;
  botUsername?: string;
  botFirstName?: string;
  lastPollAt?: string;
  lastMessageAt?: string;
  totalAnswered: number;
  hasLiveContext: boolean;
  contextUpdatedAt?: string;
  lastError?: string;
}

class TelegramAssistantManager {
  private botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  private defaultChatId = (process.env.TELEGRAM_DEFAULT_CHAT_ID || "").trim();
  private enabled = Boolean(this.botToken);
  private pollingActive = false;
  private pollAbortController: AbortController | null = null;
  private pollLoopGeneration = 0;
  private lastUpdateOffset = 0;

  private botUsername: string | undefined;
  private botFirstName: string | undefined;
  private lastPollAt: string | undefined;
  private lastMessageAt: string | undefined;
  private totalAnswered = 0;
  private lastError: string | undefined;

  private liveContext: any = null;
  private contextUpdatedAt: string | undefined;
  private chatHistories = new Map<string, Array<{ sender: "user" | "assistant"; content: string }>>();
  private telegramLearnedMemories: LearnedMemoryEntry[] = [];
  private processedUpdateIds = new Set<number>();
  private recentChats = new Map<
    string,
    { chatId: string; title: string; type: string; username?: string; lastSeenAt: string }
  >();

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

  public configure(cfg: TelegramConfigInput) {
    const incomingToken = this.normalizeBotToken(cfg.botToken);
    const effectiveToken = incomingToken || this.normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN);
    const nextChatId = (cfg.defaultChatId || "").trim();
    const nextEnabled = Boolean(cfg.enabled && effectiveToken);

    const tokenChanged = effectiveToken !== this.botToken;
    const enabledChanged = nextEnabled !== this.enabled;

    this.botToken = effectiveToken;
    this.defaultChatId = nextChatId;
    this.enabled = nextEnabled;

    if (tokenChanged) {
      this.botUsername = undefined;
      this.botFirstName = undefined;
      this.lastUpdateOffset = 0;
      this.lastError = undefined;
      this.recentChats.clear();
    }

    if (!this.enabled) {
      this.stopPolling();
      return;
    }

    if (tokenChanged || enabledChanged || !this.pollingActive) {
      this.startPolling();
    }
  }

  public getStatus(): TelegramBotStatusSnapshot {
    return {
      configured: Boolean(this.botToken),
      enabled: this.enabled,
      pollingActive: this.pollingActive,
      botUsername: this.botUsername,
      botFirstName: this.botFirstName,
      lastPollAt: this.lastPollAt,
      lastMessageAt: this.lastMessageAt,
      totalAnswered: this.totalAnswered,
      hasLiveContext: Boolean(this.liveContext),
      contextUpdatedAt: this.contextUpdatedAt,
      lastError: this.lastError,
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
      .replace(/^###\s+(.+)$/gm, "<b>$1</b>")
      .replace(/^##\s+(.+)$/gm, "<b>$1</b>")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>");

    for (const lp of linkPlaceholders) {
      formatted = formatted.replace(lp.token, lp.html);
    }
    return formatted;
  }

  private splitTelegramMessage(text: string, maxLen = 3800): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf("\n", maxLen);
      if (splitAt < maxLen * 0.5) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    return chunks;
  }

  public async sendMessage(chatId: string | number, rawText: string, tokenOverride?: string) {
    const token = tokenOverride || this.botToken;
    if (!token) throw new Error("Thiếu Telegram Bot Token");

    const htmlBody = this.formatMarkdownToTelegramHtml(rawText);
    const chunks = this.splitTelegramMessage(htmlBody, 3800);

    for (const chunk of chunks) {
      try {
        await this.telegramApiCall(token, "sendMessage", {
          chat_id: chatId,
          text: chunk,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      } catch {
        // Fallback plain text if any HTML tag spans chunk boundary
        await this.telegramApiCall(token, "sendMessage", {
          chat_id: chatId,
          text: chunk.replace(/<\/?(b|i|code|a)[^>]*>/g, ""),
          disable_web_page_preview: true,
        });
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

    const wasPollingSameToken = isSameConfiguredBot && this.pollingActive;
    if (wasPollingSameToken) {
      this.stopPolling();
      await new Promise((r) => setTimeout(r, 400));
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
      if (wasPollingSameToken && this.enabled && this.botToken) {
        this.startPolling();
      }
    }

    return Array.from(this.recentChats.values()).sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    );
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
    if (!message || !message.text || message.from?.is_bot) return;

    const chatId = message.chat?.id;
    const chatType = message.chat?.type || "private";
    const senderName =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
      message.from?.username ||
      "Cán bộ CLS";
    const rawText = String(message.text || "").trim();
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

    try {
      await this.telegramApiCall(this.botToken, "sendChatAction", {
        chat_id: chatId,
        action: "typing",
      }).catch(() => {});

      const cleanText = botMention
        ? rawText.replace(new RegExp(`@${this.botUsername}`, "ig"), "").trim()
        : rawText;

      const lower = cleanText.toLowerCase();

      if (lower.startsWith("/start") || lower.startsWith("/help")) {
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
          `• "Hướng dẫn mới của Bộ Y tế về kiểm chuẩn xét nghiệm?"`;
        await this.sendMessage(chatId, helpMsg);
        this.totalAnswered += 1;
        return;
      }

      if (lower.startsWith("/nho ") || lower.startsWith("/remember ")) {
        const memo = cleanText.replace(/^\/(nho|remember)\s+/i, "").trim();
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
      if (lower.startsWith("/tomtat") || lower.startsWith("/giaoban")) {
        question =
          "Hãy tóm tắt nhanh tình hình toàn khoa hiện tại: số liệu ca gần nhất, tình trạng thiết bị cảnh báo, phòng quá tải, lịch trực hôm nay và công việc cần xử lý.";
      } else if (lower.startsWith("/hoi ") || lower.startsWith("/ask ") || lower.startsWith("/web ")) {
        question = cleanText.replace(/^\/(hoi|ask|web)\s+/i, "").trim();
      } else if (lower.startsWith("/hoi@") || lower.startsWith("/ask@") || lower.startsWith("/web@")) {
        question = cleanText.replace(/^\/(hoi|ask|web)@\S+\s*/i, "").trim();
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
    }
  }

  private stopPolling() {
    this.pollLoopGeneration += 1;
    this.pollingActive = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
  }

  private startPolling() {
    this.stopPolling();
    if (!this.botToken || !this.enabled) return;

    const myGen = ++this.pollLoopGeneration;
    this.pollingActive = true;

    const runLoop = async () => {
      try {
        const me = await this.telegramApiCall(this.botToken, "getMe");
        if (myGen !== this.pollLoopGeneration) return;
        this.botUsername = me.username;
        this.botFirstName = me.first_name;
        this.lastError = undefined;

        await this.telegramApiCall(this.botToken, "deleteWebhook", {
          drop_pending_updates: false,
        }).catch(() => {});
      } catch (err: any) {
        this.lastError = `Token không hợp lệ hoặc mất kết nối Telegram: ${err?.message || "Unknown"}`;
        this.pollingActive = false;
        return;
      }

      let consecutiveConflicts = 0;

      while (myGen === this.pollLoopGeneration && this.enabled && this.botToken) {
        try {
          this.pollAbortController = new AbortController();
          this.lastPollAt = new Date().toISOString();

          const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${
            this.lastUpdateOffset
          }&timeout=20&allowed_updates=${encodeURIComponent(
            JSON.stringify(["message", "edited_message", "channel_post", "my_chat_member"])
          )}`;

          const res = await fetch(url, { signal: this.pollAbortController.signal });
          const payload: any = await res.json();

          if (myGen !== this.pollLoopGeneration) break;

          if (!res.ok || !payload?.ok) {
            if (payload?.error_code === 409) {
              consecutiveConflicts += 1;
              this.lastError = `Đang có phiên getUpdates khác trùng Token (thử kết nối lại lần ${consecutiveConflicts})...`;
              await this.telegramApiCall(this.botToken, "deleteWebhook", {
                drop_pending_updates: false,
              }).catch(() => {});
              const waitMs = Math.min(12000, 2500 * consecutiveConflicts);
              await new Promise((r) => setTimeout(r, waitMs));
              continue;
            }
            this.lastError = payload?.description || `Telegram Poll HTTP ${res.status}`;
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }

          consecutiveConflicts = 0;
          this.lastError = undefined;
          const updates = Array.isArray(payload.result) ? payload.result : [];
          for (const upd of updates) {
            if (upd.update_id >= this.lastUpdateOffset) {
              this.lastUpdateOffset = upd.update_id + 1;
            }
            await this.handleIncomingUpdate(upd);
          }
        } catch (err: any) {
          if (err?.name === "AbortError" || myGen !== this.pollLoopGeneration) {
            break;
          }
          this.lastError = err?.message || "Mất kết nối tạm thời khi lắng nghe Telegram";
          await new Promise((r) => setTimeout(r, 4000));
        }
      }

      if (myGen === this.pollLoopGeneration) {
        this.pollingActive = false;
      }
    };

    void runLoop();
  }
}

export const telegramManager = new TelegramAssistantManager();
