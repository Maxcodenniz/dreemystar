import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Settings2, CheckCircle, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export interface ObsStudioHelpProps {
  eventId: string | number;
  channelName: string;
}

const DEFAULT_RTMP = 'rtmp://streaming.dreemystar.com:1935/live';

/**
 * Collapsible help for streaming via OBS (virtual camera or RTMP). Kept separate from AgoraStreamingStudio for clarity.
 */
const ObsStudioHelp: React.FC<ObsStudioHelpProps> = ({ eventId, channelName }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [copied, setCopied] = useState<'server' | 'key' | null>(null);

  useEffect(() => {
    setServerUrl('');
    setStreamKey('');
  }, [eventId]);

  const loadRtmpCredentials = useCallback(async () => {
    if (serverUrl) return;
    setLoading(true);
    try {
      const RTMP_SERVER = (import.meta as any).env?.VITE_RTMP_SERVER || DEFAULT_RTMP;
      const { data, error } = await supabase.from('events').select('stream_key').eq('id', eventId).single();

      if (error || !data?.stream_key) {
        setServerUrl(DEFAULT_RTMP);
        setStreamKey(channelName);
      } else {
        setServerUrl(RTMP_SERVER);
        setStreamKey(data.stream_key);
      }
    } catch {
      setServerUrl(DEFAULT_RTMP);
      setStreamKey(channelName);
    } finally {
      setLoading(false);
    }
  }, [eventId, channelName, serverUrl]);

  const onToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadRtmpCredentials();
  };

  const copyField = useCallback(
    async (field: 'server' | 'key') => {
      const text = field === 'server' ? serverUrl : streamKey;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(field);
        setTimeout(() => setCopied(null), 2000);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(field);
        setTimeout(() => setCopied(null), 2000);
      }
    },
    [serverUrl, streamKey]
  );

  const p = (key: string) => t(`goLivePage.obsStudio.${key}`);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${
          open
            ? 'bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-indigo-600/20 border-indigo-500/40'
            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              open
                ? 'bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-500/50'
                : 'bg-white/5 border border-white/10'
            }`}
          >
            <Monitor className={`w-5 h-5 ${open ? 'text-indigo-400' : 'text-gray-400'}`} />
          </div>
          <div className="text-left">
            <p className="font-bold text-white text-sm">{p('toggleTitle')}</p>
            <p className="text-xs text-gray-400">{p('toggleSubtitle')}</p>
          </div>
        </div>
        <Settings2 className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 bg-gradient-to-br from-gray-900/90 via-gray-800/70 to-gray-900/90 backdrop-blur-xl rounded-2xl border border-indigo-500/30 p-6 shadow-xl space-y-6">
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <h4 className="text-sm font-bold text-green-300">{p('virtualTitle')}</h4>
            </div>
            <p className="text-xs text-gray-300 mb-4">{p('virtualIntro')}</p>
            <ol className="text-xs text-gray-300 space-y-2 list-decimal list-inside">
              <li>{p('step1')}</li>
              <li>{p('step2')}</li>
              <li>{p('step3')}</li>
              <li>{p('step4')}</li>
              <li>{p('step5')}</li>
            </ol>
            <div className="mt-3 px-3 py-2 bg-green-500/10 rounded-lg">
              <p className="text-xs text-green-300">{p('tipMultitrack')}</p>
            </div>
          </div>

          <div className="border-t border-white/10 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Settings2 className="w-4 h-4 text-gray-400 shrink-0" />
              <h4 className="text-sm font-bold text-gray-400">{p('rtmpTitle')}</h4>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-300">{p('rtmpNote')}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {p('rtmpServerLabel')}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-400 font-mono select-all overflow-x-auto">
                      {serverUrl}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyField('server')}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all duration-200"
                      title={p('copyServerTitle')}
                    >
                      {copied === 'server' ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {p('streamKeyLabel')}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-400 font-mono select-all overflow-x-auto">
                      {streamKey}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyField('key')}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all duration-200"
                      title={p('copyKeyTitle')}
                    >
                      {copied === 'key' ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-500">{p('privacyNote')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ObsStudioHelp;
