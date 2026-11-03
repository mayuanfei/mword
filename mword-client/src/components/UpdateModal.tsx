import { useMemo } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import { marked } from 'marked';
import type { AppVersionResponse } from '../lib/types';
import { setSkipVersion, triggerAppUpdate } from '../lib/version';

interface UpdateModalProps {
  open: boolean;
  versionInfo: AppVersionResponse | null;
  currentVersion?: string;
  onClose: () => void;
}

export function UpdateModal({ open, versionInfo, currentVersion, onClose }: UpdateModalProps) {
  const renderedChangelog = useMemo(() => {
    if (!versionInfo?.changelog) return '';
    try {
      const parsed = marked.parse(versionInfo.changelog, {
        gfm: true,
        breaks: true,
      });
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return versionInfo.changelog;
    }
  }, [versionInfo?.changelog]);

  if (!open || !versionInfo) return null;

  const handleDownload = () => {
    triggerAppUpdate(versionInfo.downloadUrl);
  };

  const handleSkip = () => {
    setSkipVersion(versionInfo.latestVersionName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white text-stone-800 rounded-2xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-stone-900 leading-tight">
                发现新版本 v{versionInfo.latestVersionName}
              </h2>
              {currentVersion && (
                <p className="text-xs text-stone-500 mt-0.5">
                  当前安装版本：v{currentVersion}
                </p>
              )}
            </div>
          </div>
          {!versionInfo.forceUpdate && (
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 rounded-lg p-1.5 transition-colors hover:bg-stone-100"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Changelog Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1 text-sm text-stone-700">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
            更新内容 (Changelog)
          </div>
          {versionInfo.changelog ? (
            <div
              className="prose prose-sm max-w-none text-stone-700 prose-headings:text-stone-900 prose-headings:font-semibold prose-headings:text-sm prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1.5 prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderedChangelog }}
            />
          ) : (
            <p className="text-sm text-stone-400 italic py-4">暂无更新日志说明。</p>
          )}

          {versionInfo.forceUpdate && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              ⚠️ 此版本包含重大升级，需更新后方可继续使用。
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex items-center justify-between gap-3">
          {!versionInfo.forceUpdate ? (
            <button
              type="button"
              onClick={handleSkip}
              className="px-3.5 py-2 text-xs text-stone-500 hover:text-stone-800 transition-colors"
            >
              跳过此版本
            </button>
          ) : <div />}

          <div className="flex items-center gap-2 ml-auto">
            {!versionInfo.forceUpdate && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl hover:bg-stone-100 transition-colors"
              >
                稍后提醒
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="px-5 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5"
            >
              <Download size={15} />
              立即下载更新
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
