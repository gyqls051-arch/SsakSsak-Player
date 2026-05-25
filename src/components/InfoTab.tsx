import { usePlayerStore } from '../store/playerStore';
import { evalRate, formatBytes, formatBitrate, isHDR } from '../utils/format';

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-white/5 text-xs">
      <span className="text-white/40 shrink-0">{label}</span>
      <span
        className={`font-mono text-right truncate min-w-0 ${accent ? 'text-accent' : 'text-white/80'}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function formatDuration(s?: string): string {
  const sec = Number(s);
  if (!Number.isFinite(sec)) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = Math.floor(sec % 60);
  return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

export default function InfoTab() {
  const info = usePlayerStore((s) => s.ffprobe);
  const filename = usePlayerStore((s) => s.filename);

  if (!filename) {
    return <div className="p-4 text-xs text-white/30 text-center">파일이 열려있지 않습니다</div>;
  }
  if (!info) {
    return (
      <div className="p-4 text-xs text-white/30 text-center flex flex-col items-center gap-2">
        <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-accent rounded-full" />
        <p>정보 로드 중…</p>
      </div>
    );
  }

  const video = info.streams.find((s) => s.codec_type === 'video');
  const audios = info.streams.filter((s) => s.codec_type === 'audio');
  const subs = info.streams.filter((s) => s.codec_type === 'subtitle');
  const fmt = info.format;
  const fps = video ? evalRate(video.r_frame_rate) || evalRate(video.avg_frame_rate) : 0;

  return (
    <div className="p-3 space-y-4">
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-1">컨테이너</h3>
        <Row label="포맷" value={fmt.format_long_name || fmt.format_name || '-'} />
        <Row label="길이" value={formatDuration(fmt.duration)} />
        <Row label="크기" value={fmt.size ? formatBytes(Number(fmt.size)) : '-'} />
        <Row label="총 비트레이트" value={formatBitrate(fmt.bit_rate)} />
      </section>

      {video && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-1">비디오</h3>
          <Row label="코덱" value={video.codec_long_name || video.codec_name || '-'} />
          <Row
            label="해상도"
            value={video.width && video.height ? `${video.width} × ${video.height}` : '-'}
          />
          <Row label="FPS" value={fps > 0 ? fps.toFixed(3) : '-'} />
          <Row label="비트레이트" value={formatBitrate(video.bit_rate)} />
          <Row label="픽셀 포맷" value={video.pix_fmt || '-'} />
          <Row
            label="색공간"
            value={
              [video.color_space, video.color_primaries, video.color_transfer]
                .filter(Boolean)
                .join(' / ') || '-'
            }
          />
          {isHDR(video) && <Row label="HDR" value={`YES (${video.color_transfer})`} accent />}
        </section>
      )}

      {audios.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
            오디오 · {audios.length} 트랙
          </h3>
          {audios.map((a, i) => (
            <div key={a.index} className={i > 0 ? 'mt-2' : ''}>
              <div className="text-[10px] text-white/40 mb-0.5">#{i + 1}</div>
              <Row label="코덱" value={a.codec_long_name || a.codec_name || '-'} />
              <Row label="샘플레이트" value={a.sample_rate ? `${a.sample_rate} Hz` : '-'} />
              <Row
                label="채널"
                value={a.channel_layout || (a.channels ? `${a.channels}ch` : '-')}
              />
              <Row label="비트레이트" value={formatBitrate(a.bit_rate)} />
            </div>
          ))}
        </section>
      )}

      {subs.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
            자막 · {subs.length} 트랙
          </h3>
          {subs.map((s, i) => (
            <Row
              key={s.index}
              label={`#${i + 1}`}
              value={s.codec_long_name || s.codec_name || '-'}
            />
          ))}
        </section>
      )}
    </div>
  );
}
