import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare state: ErrorBoundaryState;
  declare props: ErrorBoundaryProps;
  declare setState: (patch: Partial<ErrorBoundaryState>) => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: ''
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Đã xảy ra lỗi hiển thị không mong muốn.'
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught an error:', error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[320px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 shadow-lg text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {this.props.fallbackTitle || 'Đã phát hiện lỗi tạm thời trên giao diện'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Dữ liệu của bạn vẫn an toàn. Vui lòng thử khôi phục phân hệ hoặc tải lại trang.
              </p>
              {this.state.errorMessage && (
                <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 rounded-lg break-words">
                  {this.state.errorMessage}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Thử khôi phục
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tải lại ứng dụng</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
