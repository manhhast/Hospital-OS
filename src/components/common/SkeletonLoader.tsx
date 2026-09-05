import React from 'react';

export const SkeletonLoader: React.FC<{ type?: 'card' | 'table' | 'dashboard' }> = ({ type = 'card' }) => {
  if (type === 'dashboard') {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 animate-pulse">
        <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl p-4 space-y-3">
          <div className="h-4 bg-slate-300 dark:bg-slate-700 rounded-md w-3/4"></div>
          <div className="h-3 bg-slate-300 dark:bg-slate-700 rounded-md w-1/2"></div>
          <div className="h-12 bg-slate-300 dark:bg-slate-700 rounded-md"></div>
        </div>
      ))}
    </div>
  );
};
