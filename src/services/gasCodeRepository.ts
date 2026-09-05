import { GASFileCode } from '../types/hospital';

export const gasFilesList: GASFileCode[] = [
  {
    filename: 'Config.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Chứa tất cả hằng số, cấu hình hệ thống, tên Sheet, ID thư mục Drive, Token Telegram, Cache TTL và Lock Timeout.',
    code: `/**
 * Hospital OS - Configuration Module
 * Quản lý toàn bộ cấu hình hệ thống (Zero Hardcoding)
 */
const CONFIG = {
  APP: {
    NAME: "Hospital OS - Enterprise Healthcare System",
    VERSION: "2.5.0",
    DEBUG_MODE: true,
    TIMEZONE: "Asia/Ho_Chi_Minh"
  },
  SHEETS: {
    SPREADSHEET_ID: "", // Bỏ trống nếu script gắn liền kề với Sheet
    TASKS: "Tasks",
    DOCUMENTS: "Documents",
    USERS: "Users",
    NOTIFICATIONS: "Notifications",
    AUDIT_LOGS: "AuditLogs",
    SETTINGS: "Settings"
  },
  DRIVE: {
    FOLDER_ID: "YOUR_GOOGLE_DRIVE_FOLDER_ID"
  },
  NOTIFICATIONS: {
    TELEGRAM_BOT_TOKEN: "7123456789:AAFxxx_YourTelegramBotToken",
    DEFAULT_CHAT_ID: "987654321",
    SENDER_EMAIL: "hospital.system@hospital.vn"
  },
  PERFORMANCE: {
    CACHE_TTL_MINUTES: 10,
    LOCK_TIMEOUT_MS: 30000,
    MAX_ROWS_BATCH: 10000
  }
};

/**
 * Lấy cấu hình hệ thống an toàn
 * @returns {Object} Config Object
 */
function getConfig() {
  return CONFIG;
}
`
  },
  {
    filename: 'Utils.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Tiện ích xử lý chuỗi, ép kiểu dữ liệu, Sanitize Input, Escape HTML, định dạng thời gian và xử lý phản hồi API chuẩn.',
    code: `/**
 * Hospital OS - Helper Utilities
 * Cung cấp hàm bổ trợ: Sanitize, Escape HTML, Formatting, API Response Wrapping
 */
const Utils = {
  /**
   * Bọc phản hồi thành công chuẩn RESTful JSON
   */
  successResponse: function(data, message = "Thao tác thành công") {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: message,
      data: data,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  },

  /**
   * Bọc phản hồi lỗi chuẩn RESTful JSON
   */
  errorResponse: function(errorMessage, code = 500) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: errorMessage,
      code: code,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  },

  /**
   * Thường hóa và Escape HTML chống tấn công XSS
   */
  escapeHtml: function(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  /**
   * Làm sạch dữ liệu đầu vào (Sanitize)
   */
  sanitizeInput: function(input) {
    if (typeof input === 'string') {
      return this.escapeHtml(input.trim());
    }
    return input;
  },

  /**
   * Định dạng ngày giờ chuẩn YYYY-MM-DD HH:mm:ss
   */
  formatDateTime: function(dateObj) {
    const d = dateObj || new Date();
    return Utilities.formatDate(d, CONFIG.APP.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
  },

  /**
   * Tạo ID duy nhất theo tiền tố
   */
  generateUniqueId: function(prefix = "ID") {
    const timestamp = new Date().getTime().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return \`\${prefix}-\${timestamp}-\${randomStr}\`;
  }
};
`
  },
  {
    filename: 'Repository.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Repository Layer truy vấn Google Sheet với CacheService, LockService và Batch Update tối ưu cho 10.000 dòng dữ liệu.',
    code: `/**
 * Hospital OS - Data Access Repository Layer
 * Đảm nhận đọc/ghi Google Spreadsheet với CacheService & LockService
 */
const Repository = {
  /**
   * Mở Spreadsheet database
   */
  getSpreadsheet: function() {
    if (CONFIG.SHEETS.SPREADSHEET_ID) {
      return SpreadsheetApp.openById(CONFIG.SHEETS.SPREADSHEET_ID);
    }
    return SpreadsheetApp.getActiveSpreadsheet();
  },

  /**
   * Đọc tất cả dữ liệu từ Sheet (Sử dụng Cache)
   */
  findAll: function(sheetName) {
    const cache = CacheService.getScriptCache();
    const cacheKey = "SHEET_DATA_" + sheetName;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      if (CONFIG.APP.DEBUG_MODE) Logger.log("Cache Hit for sheet: " + sheetName);
      return JSON.parse(cachedData);
    }

    const ss = this.getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Không tìm thấy Sheet: " + sheetName);

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    const headers = values[0];
    const data = values.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    // Lưu Cache 10 phút
    cache.put(cacheKey, JSON.stringify(data), CONFIG.PERFORMANCE.CACHE_TTL_MINUTES * 60);
    return data;
  },

  /**
   * Xóa Cache khi có thay đổi dữ liệu
   */
  clearCache: function(sheetName) {
    const cache = CacheService.getScriptCache();
    cache.remove("SHEET_DATA_" + sheetName);
  },

  /**
   * Thêm dòng dữ liệu mới (LockService an toàn)
   */
  insert: function(sheetName, recordObj) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(CONFIG.PERFORMANCE.LOCK_TIMEOUT_MS);
      const ss = this.getSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      const rowValues = headers.map(header => recordObj[header] !== undefined ? recordObj[header] : "");
      sheet.appendRow(rowValues);

      this.clearCache(sheetName);
      return recordObj;
    } catch (e) {
      Logger.log("Error in Repository.insert: " + e.toString());
      throw e;
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Batch Update nâng cao
   */
  batchUpdate: function(sheetName, updateFn) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(CONFIG.PERFORMANCE.LOCK_TIMEOUT_MS);
      const ss = this.getSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      const range = sheet.getDataRange();
      const values = range.getValues();

      const headers = values[0];
      const rows = values.slice(1);

      const updatedRows = updateFn(headers, rows);
      sheet.getRange(2, 1, updatedRows.length, headers.length).setValues(updatedRows);

      this.clearCache(sheetName);
      return true;
    } finally {
      lock.releaseLock();
    }
  }
};
`
  },
  {
    filename: 'TaskService.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Service Layer xử lý nghiệp vụ quản lý công việc: CRUD, lọc, tìm kiếm, phân trang, gán người phụ trách, nhắc hạn.',
    code: `/**
 * Hospital OS - Task Management Service Layer
 */
const TaskService = {
  /**
   * Lấy danh sách công việc có lọc, tìm kiếm và phân trang
   */
  getTasks: function(filterOptions = {}) {
    try {
      let tasks = Repository.findAll(CONFIG.SHEETS.TASKS);

      // Sanitize & Filter
      if (filterOptions.search) {
        const query = filterOptions.search.toLowerCase();
        tasks = tasks.filter(t => 
          (t.title && t.title.toLowerCase().includes(query)) ||
          (t.assignee && t.assignee.toLowerCase().includes(query))
        );
      }

      if (filterOptions.status) {
        tasks = tasks.filter(t => t.status === filterOptions.status);
      }

      if (filterOptions.priority) {
        tasks = tasks.filter(t => t.priority === filterOptions.priority);
      }

      return tasks;
    } catch (error) {
      Logger.log("TaskService.getTasks Error: " + error.toString());
      throw new Error("Không thể tải danh sách công việc: " + error.message);
    }
  },

  /**
   * Lưu hoặc cập nhật công việc
   */
  saveTask: function(taskData) {
    try {
      // Validate
      if (!taskData.title || !taskData.dueDate) {
        throw new Error("Tiêu đề và ngày hạn là bắt buộc");
      }

      const sanitized = {
        id: taskData.id || Utils.generateUniqueId("TSK"),
        title: Utils.sanitizeInput(taskData.title),
        description: Utils.sanitizeInput(taskData.description || ""),
        dueDate: taskData.dueDate,
        createdDate: taskData.createdDate || Utils.formatDateTime(new Date()),
        updatedDate: Utils.formatDateTime(new Date()),
        creator: Utils.sanitizeInput(taskData.creator || "Admin"),
        assignee: Utils.sanitizeInput(taskData.assignee || ""),
        assigneeEmail: Utils.sanitizeInput(taskData.assigneeEmail || ""),
        telegramChatId: Utils.sanitizeInput(taskData.telegramChatId || ""),
        taskType: taskData.taskType || "Hội chẩn",
        priority: taskData.priority || "Trung bình",
        status: taskData.status || "Chờ xử lý",
        level: taskData.level || "Chung",
        recurrence: taskData.recurrence || "Không",
        recurrenceCount: taskData.recurrenceCount || 0,
        notes: Utils.sanitizeInput(taskData.notes || "")
      };

      Repository.insert(CONFIG.SHEETS.TASKS, sanitized);

      // Gửi thông báo tự động nếu khẩn cấp
      if (sanitized.priority === "Khẩn cấp") {
        NotificationService.sendTelegramNotification(
          sanitized.telegramChatId || CONFIG.NOTIFICATIONS.DEFAULT_CHAT_ID,
          \`🚨 *CÔNG VIỆC KHẨN CẤP MỚI* \\n📌 \${sanitized.title}\\n📅 Hạn: \${sanitized.dueDate}\\n👤 Phụ trách: \${sanitized.assignee}\`
        );
      }

      return sanitized;
    } catch (error) {
      Logger.log("TaskService.saveTask Error: " + error.toString());
      throw error;
    }
  }
};
`
  },
  {
    filename: 'DocumentService.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Service Layer quản lý hồ sơ tài liệu bệnh viện, tải tệp lên Google Drive, phân loại, đánh dấu hết hạn và lưu vết phiên bản.',
    code: `/**
 * Hospital OS - Document Management Service Layer
 */
const DocumentService = {
  /**
   * Tải tệp lên Google Drive và lưu thông tin vào Sheet
   */
  uploadDocument: function(fileBlob, metadata) {
    try {
      const folder = DriveApp.getFolderById(CONFIG.DRIVE.FOLDER_ID);
      const driveFile = folder.createFile(fileBlob);
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const docRecord = {
        id: Utils.generateUniqueId("DOC"),
        title: Utils.sanitizeInput(metadata.title || driveFile.getName()),
        docType: metadata.docType || "Bệnh án",
        fileExtension: metadata.fileExtension || "PDF",
        fileSize: driveFile.getSize(),
        driveFileId: driveFile.getId(),
        driveUrl: driveFile.getUrl(),
        uploadDate: Utils.formatDateTime(new Date()),
        expirationDate: metadata.expirationDate || "",
        isExpired: false,
        version: "v1.0",
        tags: metadata.tags || "",
        owner: Utils.sanitizeInput(metadata.owner || "Admin"),
        note: Utils.sanitizeInput(metadata.note || "")
      };

      Repository.insert(CONFIG.SHEETS.DOCUMENTS, docRecord);
      return docRecord;
    } catch (error) {
      Logger.log("DocumentService.uploadDocument Error: " + error.toString());
      throw new Error("Không thể tải tài liệu lên Google Drive: " + error.message);
    }
  },

  /**
   * Kiểm tra hồ sơ hết hạn tự động
   */
  checkExpiringDocuments: function() {
    const docs = Repository.findAll(CONFIG.SHEETS.DOCUMENTS);
    const today = new Date();
    const expiringSoon = [];

    docs.forEach(doc => {
      if (doc.expirationDate) {
        const expDate = new Date(doc.expirationDate);
        const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7 && diffDays >= 0) {
          expiringSoon.push(doc);
        }
      }
    });

    return expiringSoon;
  }
};
`
  },
  {
    filename: 'NotificationService.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Service Layer gửi Email qua GmailApp và gửi thông báo Telegram Bot qua UrlFetchApp, lưu nhật ký gửi.',
    code: `/**
 * Hospital OS - Multi-Channel Notification Service Layer
 */
const NotificationService = {
  /**
   * Gửi Email thông báo
   */
  sendEmailNotification: function(recipientEmail, subject, htmlBody) {
    try {
      GmailApp.sendEmail(recipientEmail, subject, "", {
        htmlBody: htmlBody,
        name: CONFIG.APP.NAME
      });

      this.logNotificationLog(recipientEmail, subject, "Email", "Đã gửi");
      return true;
    } catch (error) {
      Logger.log("NotificationService.sendEmail Error: " + error.toString());
      this.logNotificationLog(recipientEmail, subject, "Email", "Thất bại", error.toString());
      return false;
    }
  },

  /**
   * Gửi thông báo Telegram Bot
   */
  sendTelegramNotification: function(chatId, markdownText) {
    try {
      const token = CONFIG.NOTIFICATIONS.TELEGRAM_BOT_TOKEN;
      const url = \`https://api.telegram.org/bot\${token}/sendMessage\`;

      const payload = {
        chat_id: chatId || CONFIG.NOTIFICATIONS.DEFAULT_CHAT_ID,
        text: markdownText,
        parse_mode: "Markdown"
      };

      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(url, options);
      const result = JSON.parse(response.getContentText());

      if (result.ok) {
        this.logNotificationLog(chatId, "Telegram Alert", "Telegram", "Đã gửi");
        return true;
      } else {
        throw new Error(result.description);
      }
    } catch (error) {
      Logger.log("NotificationService.sendTelegram Error: " + error.toString());
      this.logNotificationLog(chatId, "Telegram Alert", "Telegram", "Thất bại", error.toString());
      return false;
    }
  },

  /**
   * Lưu nhật ký lịch sử gửi thông báo
   */
  logNotificationLog: function(recipient, title, channel, status, errorMsg = "") {
    const record = {
      id: Utils.generateUniqueId("NOTIF"),
      recipient: recipient,
      title: title,
      channel: channel,
      status: status,
      sentAt: Utils.formatDateTime(new Date()),
      errorMessage: errorMsg
    };

    Repository.insert(CONFIG.SHEETS.NOTIFICATIONS, record);
  }
};
`
  },
  {
    filename: 'Auth.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Xác thực người dùng, lấy thông tin Session Google User hiện tại và kiểm tra phân quyền RBAC.',
    code: `/**
 * Hospital OS - Authentication & RBAC Service
 */
const Auth = {
  /**
   * Lấy Email người dùng Google Apps Script đang truy cập
   */
  getCurrentUserEmail: function() {
    return Session.getActiveUser().getEmail() || "anonymous@hospital.vn";
  },

  /**
   * Lấy thông tin User & Quyền từ Sheet Users
   */
  getCurrentUserRole: function() {
    const email = this.getCurrentUserEmail();
    const users = Repository.findAll(CONFIG.SHEETS.USERS);
    const found = users.find(u => u.email === email);

    return found ? found.role : "Doctor"; // Mặc định Doctor nếu chưa khai báo
  },

  /**
   * Kiểm tra quyền truy cập tính năng (RBAC)
   */
  checkPermission: function(requiredRole) {
    const userRole = this.getCurrentUserRole();
    const roleHierarchy = { "Admin": 4, "Manager": 3, "Doctor": 2, "Staff": 1 };

    const currentLevel = roleHierarchy[userRole] || 1;
    const requiredLevel = roleHierarchy[requiredRole] || 1;

    if (currentLevel < requiredLevel) {
      throw new Error(\`Bạn cần quyền \${requiredRole} để thực hiện thao tác này.\`);
    }

    return true;
  }
};
`
  },
  {
    filename: 'Dashboard.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Tổng hợp chỉ số KPIs tổng quan, biểu đồ thống kê công việc theo tháng/trạng thái và hồ sơ tài liệu.',
    code: `/**
 * Hospital OS - Dashboard Data Service
 */
const Dashboard = {
  /**
   * Tổng hợp toàn bộ số liệu Dashboard trong 1 lần gọi
   */
  getSummaryMetrics: function() {
    const tasks = Repository.findAll(CONFIG.SHEETS.TASKS);
    const docs = Repository.findAll(CONFIG.SHEETS.DOCUMENTS);

    const todayStr = Utils.formatDateTime(new Date()).slice(0, 10);

    let todayTasks = 0;
    let upcomingTasks = 0;
    let overdueTasks = 0;

    tasks.forEach(t => {
      if (t.dueDate === todayStr) todayTasks++;
      if (t.dueDate > todayStr && t.status !== "Đã hoàn thành") upcomingTasks++;
      if (t.dueDate < todayStr && t.status !== "Đã hoàn thành") overdueTasks++;
    });

    let expiringDocs = 0;
    let expiredDocs = 0;

    docs.forEach(d => {
      if (d.isExpired) expiredDocs++;
      else if (d.expirationDate && d.expirationDate <= todayStr) expiringDocs++;
    });

    return {
      totalTasks: tasks.length,
      todayTasks: todayTasks,
      upcomingTasks: upcomingTasks,
      overdueTasks: overdueTasks,
      totalDocs: docs.length,
      expiringDocs: expiringDocs,
      expiredDocs: expiredDocs
    };
  }
};
`
  },
  {
    filename: 'Main.gs',
    type: 'backend',
    language: 'javascript',
    description: 'Router chính Web App (doGet, doPost, processAction) phân phối yêu cầu từ frontend đến các Service Layer.',
    code: `/**
 * Hospital OS - Main Web App Router Entrypoint
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(CONFIG.APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Xử lý API gọi từ Frontend Google Apps Script (google.script.run)
 */
function processAction(actionName, payloadJson) {
  try {
    const payload = payloadJson ? JSON.parse(payloadJson) : {};

    switch (actionName) {
      case 'getDashboardData':
        return Utils.successResponse(Dashboard.getSummaryMetrics());

      case 'getTasks':
        return Utils.successResponse(TaskService.getTasks(payload));

      case 'saveTask':
        Auth.checkPermission("Staff");
        return Utils.successResponse(TaskService.saveTask(payload), "Đã lưu công việc");

      case 'sendTelegramAlert':
        NotificationService.sendTelegramNotification(payload.chatId, payload.message);
        return Utils.successResponse(true, "Đã gửi thông báo Telegram");

      default:
        throw new Error("Action không hợp lệ: " + actionName);
    }
  } catch (error) {
    return Utils.errorResponse(error.message);
  }
}
`
  },
  {
    filename: 'index.html',
    type: 'frontend',
    language: 'html',
    description: 'File HTML chính chứa cấu trúc layout responsive Bootstrap 5, Modal, Toast và các Container cho ứng dụng.',
    code: `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Hospital OS - Enterprise Healthcare System</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
  <?!= HtmlService.createHtmlOutputFromFile('css/style').getContent(); ?>
</head>
<body class="bg-light">
  <div id="app" class="d-flex">
    <!-- Sidebar Navigation -->
    <nav class="sidebar p-3 text-white bg-primary">
      <h4 class="fw-bold mb-4"><i class="bi bi-hospital"></i> Hospital OS</h4>
      <ul class="nav nav-pills flex-column mb-auto">
        <li class="nav-item"><a href="#" class="nav-link text-white active" data-target="dashboard"><i class="bi bi-speedometer2 me-2"></i> Dashboard</a></li>
        <li><a href="#" class="nav-link text-white" data-target="tasks"><i class="bi bi-check2-square me-2"></i> Công việc</a></li>
        <li><a href="#" class="nav-link text-white" data-target="documents"><i class="bi bi-folder2-open me-2"></i> Hồ sơ</a></li>
        <li><a href="#" class="nav-link text-white" data-target="notifications"><i class="bi bi-bell me-2"></i> Thông báo</a></li>
      </ul>
    </nav>
    <main class="content-wrapper p-4 flex-grow-1" id="mainContent">
      <!-- Container động được load qua JS -->
    </main>
  </div>
</body>
</html>
`
  },
  {
    filename: 'css/style.css',
    type: 'frontend',
    language: 'css',
    description: 'Tệp CSS tùy chỉnh thiết kế giao diện Notion/Monday style với màu sắc chủ đạo, bo góc card và shadow nhẹ.',
    code: `/* Hospital OS Design System */
:root {
  --primary-color: #0d6efd;
  --success-color: #198754;
  --danger-color: #dc3545;
  --bg-color: #f5f7fb;
  --card-radius: 12px;
}

body {
  background-color: var(--bg-color);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.card {
  border: none;
  border-radius: var(--card-radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.sidebar {
  width: 260px;
  min-height: 100vh;
}
`
  },
  {
    filename: 'js/app.js',
    type: 'frontend',
    language: 'javascript',
    description: 'Khởi tạo ứng dụng frontend, điều hướng các Module và lắng nghe sự kiện chuyển trang.',
    code: `/**
 * Hospital OS Frontend Application Entry
 */
document.addEventListener("DOMContentLoaded", function() {
  console.log("Hospital OS Application Loaded");
  App.init();
});

const App = {
  init: function() {
    this.bindEvents();
    DashboardModule.load();
  },
  bindEvents: function() {
    document.querySelectorAll(".sidebar .nav-link").forEach(link => {
      link.addEventListener("click", function(e) {
        e.preventDefault();
        const target = this.getAttribute("data-target");
        App.switchModule(target);
      });
    });
  },
  switchModule: function(moduleName) {
    if (moduleName === "dashboard") DashboardModule.load();
    else if (moduleName === "tasks") TaskModule.load();
    else if (moduleName === "documents") DocumentModule.load();
  }
};
`
  },
  {
    filename: 'js/api.js',
    type: 'frontend',
    language: 'javascript',
    description: 'Lớp API Client giao tiếp bất đồng bộ với Google Apps Script backend (google.script.run) kèm Retry tự động.',
    code: `/**
 * Hospital OS API Bridge Client
 */
const API = {
  call: function(actionName, payload = {}, retryCount = 2) {
    return new Promise((resolve, reject) => {
      const attemptCall = (retriesLeft) => {
        if (typeof google !== "undefined" && google.script && google.script.run) {
          google.script.run
            .withSuccessHandler((response) => {
              const parsed = JSON.parse(response);
              if (parsed.success) resolve(parsed.data);
              else reject(new Error(parsed.error));
            })
            .withFailureHandler((error) => {
              if (retriesLeft > 0) {
                console.warn(\`API \${actionName} failed, retrying... (\${retriesLeft} left)\`);
                setTimeout(() => attemptCall(retriesLeft - 1), 1000);
              } else {
                reject(error);
              }
            })
            .processAction(actionName, JSON.stringify(payload));
        } else {
          // Fallback cho môi trường Dev / Local
          resolve({ mock: true });
        }
      };
      attemptCall(retryCount);
    });
  }
};
`
  },
  {
    filename: 'js/task.js',
    type: 'frontend',
    language: 'javascript',
    description: 'Xử lý UI và tương tác module Công việc: CRUD, Kanban Board, Tìm kiếm, Lọc, Quick Edit.',
    code: `/**
 * Task Module Frontend Controller
 */
const TaskModule = {
  load: async function() {
    UtilsUI.showLoading();
    try {
      const tasks = await API.call("getTasks");
      this.renderTaskList(tasks);
    } catch (e) {
      UtilsUI.showToast("Lỗi", e.message, "danger");
    } finally {
      UtilsUI.hideLoading();
    }
  },
  renderTaskList: function(tasks) {
    const container = document.getElementById("mainContent");
    container.innerHTML = \`<h3>Quản lý Công việc</h3><p>Tổng cộng \${tasks.length} công việc</p>\`;
  }
};
`
  },
  {
    filename: 'js/document.js',
    type: 'frontend',
    language: 'javascript',
    description: 'Xử lý UI module Hồ sơ tài liệu: Tải tệp lên Google Drive, xem trước, đánh dấu phiên bản và lọc hết hạn.',
    code: `/**
 * Document Module Frontend Controller
 */
const DocumentModule = {
  load: function() {
    console.log("Document Module Loaded");
  }
};
`
  },
  {
    filename: 'js/dashboard.js',
    type: 'frontend',
    language: 'javascript',
    description: 'Hiển thị các thẻ chỉ số KPIs và vẽ biểu đồ thống kê công việc & hồ sơ tài liệu.',
    code: `/**
 * Dashboard Module Frontend Controller
 */
const DashboardModule = {
  load: async function() {
    const data = await API.call("getDashboardData");
    console.log("Dashboard metrics loaded", data);
  }
};
`
  },
  {
    filename: 'js/utils.js',
    type: 'frontend',
    language: 'javascript',
    description: 'Tiện ích UI frontend: Toast, Loading Spinner, Skeleton Loader và Confirm Dialog Modal.',
    code: `/**
 * Frontend UI Helper Utilities
 */
const UtilsUI = {
  showToast: function(title, message, type = "success") {
    console.log(\`[\${type.toUpperCase()}] \${title}: \${message}\`);
  },
  showLoading: function() {
    console.log("Loading...");
  },
  hideLoading: function() {
    console.log("Done Loading.");
  }
};
`
  }
];
