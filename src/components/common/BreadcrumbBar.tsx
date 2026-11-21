import React from 'react';
import { ChevronRight, Home, ShieldCheck } from 'lucide-react';
import { CONFIG_MODULE_IDS } from '../settings/SystemConfigHubView';

interface BreadcrumbBarProps {
  activeModule: string;
  onNavigateModule: (module: string) => void;
  defaultConfigModule?: string;
}

interface BreadcrumbMeta {
  groupLabel: string;
  groupTarget?: string;
  moduleLabel: string;
}

const getBreadcrumbMeta = (mod: string, defaultConfigModule: string): BreadcrumbMeta => {
  switch (mod) {
    case 'dashboard':
      return { groupLabel: 'Điều hành & Thống kê', moduleLabel: 'Tổng quan Hệ thống (Dashboard)' };
    case 'ai-ecosystem':
      return { groupLabel: 'Điều hành & Thống kê', groupTarget: 'dashboard', moduleLabel: 'Trợ lý AI Điều hành Khoa' };
    case 'reports':
      return { groupLabel: 'Điều hành & Thống kê', groupTarget: 'dashboard', moduleLabel: 'Báo cáo & Thống kê Dịch vụ' };
    case 'sync-history':
      return { groupLabel: 'Điều hành & Thống kê', groupTarget: 'reports', moduleLabel: 'Lịch sử Đồng bộ Dữ liệu' };
    case 'equipment':
      return { groupLabel: 'Quản lý Cận lâm sàng', groupTarget: 'rooms', moduleLabel: 'Quản lý Máy móc & Thiết bị' };
    case 'rooms':
      return { groupLabel: 'Quản lý Cận lâm sàng', groupTarget: 'rooms', moduleLabel: 'Phòng / Bộ phận Trực thuộc' };
    case 'documents':
      return { groupLabel: 'Quản lý Cận lâm sàng', groupTarget: 'documents', moduleLabel: 'Hồ sơ & Quy trình ISO 15189' };
    case 'tasks':
      return { groupLabel: 'Nhân sự & Công tác', groupTarget: 'tasks', moduleLabel: 'Công việc & Y vụ' };
    case 'schedule':
      return { groupLabel: 'Nhân sự & Công tác', groupTarget: 'schedule', moduleLabel: 'Lịch trực & Ca công tác' };
    case 'hr':
      return { groupLabel: 'Nhân sự & Công tác', groupTarget: 'hr', moduleLabel: 'Quản lý Nhân sự & Đào tạo' };
    case 'meetings':
      return { groupLabel: 'Nhân sự & Công tác', groupTarget: 'meetings', moduleLabel: 'Cuộc họp & Hội chẩn' };
    case 'discussion':
      return { groupLabel: 'Nhân sự & Công tác', groupTarget: 'discussion', moduleLabel: 'Kênh Trao đổi Nội bộ' };
    case 'settings':
      return { groupLabel: 'Quản trị Hệ thống', groupTarget: defaultConfigModule, moduleLabel: 'Cấu hình Hệ thống' };
    case 'telegram':
      return { groupLabel: 'Quản trị Hệ thống', groupTarget: defaultConfigModule, moduleLabel: 'Cài đặt Telegram Bot' };
    case 'users':
      return { groupLabel: 'Quản trị Hệ thống', groupTarget: defaultConfigModule, moduleLabel: 'Phân quyền Hệ thống' };
    case 'notifications':
      return { groupLabel: 'Quản trị Hệ thống', groupTarget: defaultConfigModule, moduleLabel: 'Thông báo Nội bộ' };
    case 'integration':
      return { groupLabel: 'Quản trị Hệ thống', groupTarget: defaultConfigModule, moduleLabel: 'Cổng API HIS / LIS / PACS' };
    case 'audit':
      return { groupLabel: 'Quản trị Hệ thống', groupTarget: defaultConfigModule, moduleLabel: 'Lịch sử Audit Log' };
    case 'gas-architecture':
      return { groupLabel: 'Quản trị Hệ thống', groupTarget: defaultConfigModule, moduleLabel: 'Kiến trúc GAS Code' };
    default:
      return {
        groupLabel: CONFIG_MODULE_IDS.includes(mod as typeof CONFIG_MODULE_IDS[number])
          ? 'Quản trị Hệ thống'
          : 'Quản lý Cận lâm sàng',
        moduleLabel: 'Phân hệ Chuyên môn'
      };
  }
};

export const BreadcrumbBar: React.FC<BreadcrumbBarProps> = ({
  activeModule,
  onNavigateModule,
  defaultConfigModule = 'settings'
}) => {
  const meta = getBreadcrumbMeta(activeModule, defaultConfigModule);

  return (
    <nav
      aria-label="Điều hướng phân cấp HIS"
      className="flex items-center justify-between gap-4 px-4 md:px-5 py-2 bg-white dark:bg-[#162033] border-b border-[#DFE7F0] dark:border-slate-700/80 text-xs shrink-0"
    >
      <ol className="flex items-center gap-1.5 min-w-0 overflow-x-auto whitespace-nowrap">
        <li>
          <button
            type="button"
            onClick={() => onNavigateModule('dashboard')}
            className={`inline-flex items-center gap-1 font-medium transition-colors cursor-pointer ${
              activeModule === 'dashboard'
                ? 'text-[#1976D2] dark:text-sky-400 font-semibold'
                : 'text-[#718096] hover:text-[#1976D2] dark:text-slate-400 dark:hover:text-sky-400'
            }`}
          >
            <Home className="w-3.5 h-3.5 shrink-0" />
            <span>Trang chủ</span>
          </button>
        </li>

        <li aria-hidden="true" className="text-[#718096]/70">
          <ChevronRight className="w-3.5 h-3.5" />
        </li>

        <li>
          {meta.groupTarget && meta.groupTarget !== activeModule ? (
            <button
              type="button"
              onClick={() => onNavigateModule(meta.groupTarget!)}
              className="text-[#718096] hover:text-[#1976D2] dark:text-slate-400 dark:hover:text-sky-400 font-medium transition-colors cursor-pointer"
            >
              {meta.groupLabel}
            </button>
          ) : (
            <span className="text-[#718096] dark:text-slate-400 font-medium">{meta.groupLabel}</span>
          )}
        </li>

        <li aria-hidden="true" className="text-[#718096]/70">
          <ChevronRight className="w-3.5 h-3.5" />
        </li>

        <li className="font-semibold text-[#155A9C] dark:text-sky-300 truncate">
          {meta.moduleLabel}
        </li>
      </ol>

      <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-[#718096] dark:text-slate-400 shrink-0">
        <ShieldCheck className="w-3.5 h-3.5 text-[#1976D2] dark:text-sky-400" />
        <span>BVĐK Sông Thương · Khoa Cận Lâm Sàng · ISO 15189:2022</span>
      </div>
    </nav>
  );
};
