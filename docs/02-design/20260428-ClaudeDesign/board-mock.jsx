// Hi-fi mock of the RummiArena game screen with 3 variants of the top strip.
// Each artboard renders the FULL board UI; only the top region differs.

const TILE_COLORS = {
  r: { bg: 'linear-gradient(180deg, #f0f4ff 0%, #d9deea 100%)', text: '#dc2626' },
  y: { bg: 'linear-gradient(180deg, #f0f4ff 0%, #d9deea 100%)', text: '#d97706' },
  b: { bg: 'linear-gradient(180deg, #f0f4ff 0%, #d9deea 100%)', text: '#2563eb' },
  k: { bg: 'linear-gradient(180deg, #f0f4ff 0%, #d9deea 100%)', text: '#0f172a' },
};

function Tile({ n, c = 'r', size = 1, dim = false, sm = false }) {
  const w = sm ? 30 : 38;
  const h = sm ? 42 : 52;
  const fs = sm ? 16 : 20;
  const col = TILE_COLORS[c];
  return (
    <div style={{
      width: w, height: h, borderRadius: 5,
      background: col.bg,
      boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Inter", system-ui', fontWeight: 800,
      color: col.text, fontSize: fs, lineHeight: 1,
      opacity: dim ? 0.55 : 1,
      flexShrink: 0,
    }}>
      <div>{n}</div>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: col.text, marginTop: 4, opacity: 0.85 }}></div>
    </div>
  );
}

function PlayerCard({ name, sub, active, score, tiles, accent = '#94a3b8' }) {
  return (
    <div style={{
      background: active ? 'linear-gradient(180deg,#1c2230,#161b27)' : '#11151e',
      border: active ? `1px solid ${accent}55` : '1px solid #1e2532',
      borderLeft: active ? `3px solid ${accent}` : '1px solid #1e2532',
      borderRadius: 8, padding: '10px 12px', position: 'relative',
    }}>
      {active && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
          color: accent, textTransform: 'uppercase',
        }}>● 차례</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e6e9f0' }}>{name}</div>
      <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2 }}>{sub}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 10.5, color: '#9ca3af' }}>
        <span><span style={{ color: '#cbd5e1', fontWeight: 600 }}>{tiles}</span> 장</span>
        <span><span style={{ color: '#cbd5e1', fontWeight: 600 }}>{score}</span> 점</span>
      </div>
    </div>
  );
}

function Board({ children, height = 240 }) {
  return (
    <div style={{
      background: 'radial-gradient(ellipse at 50% 30%, #14422a 0%, #0d2c1c 60%, #081d12 100%)',
      borderRadius: 12, height, position: 'relative',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 80px rgba(0,0,0,0.5)',
      border: '1px solid #0a1f14',
      padding: 16, display: 'flex', flexWrap: 'wrap', gap: 18, alignContent: 'flex-start',
    }}>
      {children}
    </div>
  );
}

function CommittedSet({ tiles }) {
  return (
    <div style={{
      display: 'flex', gap: 3, padding: 4,
      background: 'rgba(255,255,255,0.03)', borderRadius: 8,
      border: '1px dashed rgba(255,255,255,0.08)',
    }}>
      {tiles.map((t, i) => <Tile key={i} n={t.n} c={t.c} sm />)}
    </div>
  );
}

function HandTiles() {
  const hand = [
    { n: 1, c: 'r' }, { n: 1, c: 'y' }, { n: 2, c: 'b' }, { n: 2, c: 'y' },
    { n: 3, c: 'b' }, { n: 4, c: 'r' }, { n: 6, c: 'b' }, { n: 7, c: 'r' },
    { n: 8, c: 'y' }, { n: 9, c: 'b' }, { n: 10, c: 'r' }, { n: 12, c: 'y' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {hand.map((t, i) => <Tile key={i} n={t.n} c={t.c} />)}
    </div>
  );
}

function ActionBar() {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <button style={{
        flex: 1, height: 38, borderRadius: 8, border: '1px solid #1e2532',
        background: '#141a25', color: '#cbd5e1', fontSize: 13, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>드로우</button>
      <button style={{
        width: 110, height: 38, borderRadius: 8, border: '1px solid #1e2532',
        background: 'transparent', color: '#6b7280', fontSize: 12,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>↺ 초기화</button>
      <button style={{
        flex: 1.4, height: 38, borderRadius: 8, border: 'none',
        background: 'linear-gradient(180deg, #d97706, #b45309)',
        color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 0.3,
        cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 12px rgba(217,119,6,0.35)',
      }}>제출</button>
    </div>
  );
}

function HintPanel() {
  return (
    <div style={{
      background: '#11151e', border: '1px solid #1e2532', borderRadius: 8,
      padding: 12, height: '100%',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#e6e9f0', marginBottom: 4 }}>힌트 리스트</div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>최대 8번 스크롤 가능</div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {['1·2·3 빨강', '7·7·7 (3색)', '9·10·11·12 파랑'].map((h, i) => (
          <div key={i} style={{
            fontSize: 11, color: '#cbd5e1', padding: '6px 8px',
            background: 'rgba(255,255,255,0.02)', borderRadius: 5,
            borderLeft: '2px solid #34d399',
          }}>{h}</div>
        ))}
      </div>
    </div>
  );
}

// ============ TOP STRIP VARIANTS ============

// VARIANT A — Tactical strip: orbital timer, now/next, round dots
function StripA() {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #11151e 0%, #0d121b 100%)',
      border: '1px solid #1e2532', borderRadius: 10,
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 24,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* subtle scanline */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.4,
        background: 'radial-gradient(circle at 12% 50%, rgba(245,158,11,0.08) 0%, transparent 40%)',
        pointerEvents: 'none',
      }}></div>

      {/* Orbital timer */}
      <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#1e2532" strokeWidth="3" />
          <circle cx="32" cy="32" r="28" fill="none" stroke="#f59e0b" strokeWidth="3"
            strokeDasharray="176" strokeDashoffset="58"
            transform="rotate(-90 32 32)" strokeLinecap="round" />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', lineHeight: 1, fontFamily: '"JetBrains Mono", monospace' }}>42</div>
          <div style={{ fontSize: 8, color: '#6b7280', marginTop: 2, letterSpacing: 0.8 }}>SEC</div>
        </div>
      </div>

      {/* Now playing */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 9, color: '#f59e0b', letterSpacing: 1.2, fontWeight: 700 }}>YOUR TURN</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', marginTop: 2 }}>네선용</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>최초 등록 필요 · 30점 이상의 세트를 보드에 올리세요</div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, alignSelf: 'stretch', background: 'linear-gradient(180deg, transparent, #1e2532, transparent)' }}></div>

      {/* Next */}
      <div style={{ minWidth: 90 }}>
        <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1.2, fontWeight: 700 }}>NEXT</div>
        <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg,#475569,#1e293b)', fontSize: 9, color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>S</div>
          shark
        </div>
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>~45s 대기</div>
      </div>

      <div style={{ width: 1, alignSelf: 'stretch', background: 'linear-gradient(180deg, transparent, #1e2532, transparent)' }}></div>

      {/* Round dots */}
      <div style={{ minWidth: 130 }}>
        <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1.2, fontWeight: 700 }}>ROUND 7</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {[
            { s: 'd' }, { s: 'd' }, { s: 'd' }, { s: 'c' }, { s: 'p' }, { s: 'p' },
          ].map((d, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: 3,
              background: d.s === 'd' ? '#34d39955' : d.s === 'c' ? '#f59e0b' : '#1e2532',
              border: d.s === 'c' ? '1px solid #fbbf24' : 'none',
              boxShadow: d.s === 'c' ? '0 0 8px #f59e0b88' : 'none',
            }}></div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 5 }}>3 / 6 턴</div>
      </div>
    </div>
  );
}

// VARIANT B — Coach card with progress to 30 points
function StripB() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0e1729 0%, #0d121b 100%)',
      border: '1px solid #1e3a5f', borderRadius: 10,
      padding: '16px 20px', display: 'flex', gap: 24,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* glow */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(59,130,246,0.18), transparent 70%)',
        pointerEvents: 'none',
      }}></div>

      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{ fontSize: 10, color: '#60a5fa', letterSpacing: 1.4, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 8px #60a5fa' }}></div>
          YOUR MOVE
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 6, letterSpacing: -0.3 }}>
          최초 등록까지 <span style={{ color: '#fbbf24' }}>4점</span> 더 필요해요.
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>
          현재 보드에 26점을 올렸어요. 30점을 넘기면 등록이 완료됩니다.
        </div>

        {/* progress bar with 30 marker */}
        <div style={{ marginTop: 12, position: 'relative', maxWidth: 420 }}>
          <div style={{ height: 8, background: '#0a0e15', borderRadius: 4, overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)' }}>
            <div style={{
              height: '100%', width: '78%',
              background: 'linear-gradient(90deg, #10b981, #34d399)',
              boxShadow: '0 0 12px rgba(52,211,153,0.5)',
            }}></div>
          </div>
          <div style={{
            position: 'absolute', left: '90%', top: -3, height: 14,
            width: 1.5, background: '#fbbf24', boxShadow: '0 0 6px #fbbf24',
          }}></div>
          <div style={{
            position: 'absolute', left: '90%', top: -16,
            transform: 'translateX(-50%)',
            fontSize: 9, fontWeight: 700, color: '#fbbf24', letterSpacing: 0.5,
          }}>30</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6, fontFamily: '"JetBrains Mono", monospace' }}>26 / 30</div>
        </div>
      </div>

      {/* Side stats */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', position: 'relative' }}>
        <Stat label="핸드 가치" value="145" tone="#cbd5e1" />
        <Stat label="가능한 세트" value="3" tone="#34d399" />
        <Stat label="남은 시간" value="42s" tone="#fbbf24" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 64 }}>
      <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone, marginTop: 2, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// VARIANT C — AI live log + opponent thought bubble (during AI's turn)
function StripC() {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #11151e, #0d121b)',
      border: '1px solid #1e2532', borderRadius: 10,
      padding: '12px 16px', display: 'flex', gap: 18, alignItems: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* AI avatar with thinking pulse */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800, color: '#06b6d4',
          fontFamily: '"JetBrains Mono", monospace',
          boxShadow: '0 0 0 4px rgba(6,182,212,0.08), 0 0 20px rgba(6,182,212,0.2)',
        }}>
          ◆
        </div>
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 14, height: 14, borderRadius: '50%',
          background: '#06b6d4', border: '2px solid #0d121b',
          animation: 'mockPulse 1.4s infinite',
        }}></div>
      </div>

      {/* Thought stream */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc' }}>shark</div>
          <div style={{ fontSize: 9, color: '#06b6d4', padding: '2px 6px', background: 'rgba(6,182,212,0.1)', borderRadius: 3, letterSpacing: 0.6, fontWeight: 600 }}>GPT-4o · THINKING</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto', fontFamily: '"JetBrains Mono", monospace' }}>00:08</div>
        </div>
        <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6, lineHeight: 1.4, fontStyle: 'italic' }}>
          "보드의 7·8·9 빨강 런에 10을 추가하고, 핸드의 5·5·5로 새 그룹을…"
        </div>
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6, display: 'flex', gap: 14, fontFamily: '"JetBrains Mono", monospace' }}>
          <span>↳ 평가: 4 후보 수</span>
          <span>↳ 신뢰도: 0.82</span>
        </div>
      </div>

      {/* Mini round indicator on right */}
      <div style={{ alignSelf: 'flex-start', textAlign: 'right' }}>
        <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1.2, fontWeight: 700 }}>ROUND 7</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#cbd5e1', marginTop: 2, fontFamily: '"JetBrains Mono", monospace' }}>3/6</div>
      </div>
    </div>
  );
}

// ============ FULL MOCK ============

function GameMock({ topStrip, accentLeft = '#475569', accentRight = '#f59e0b', leftActive = false, rightActive = true }) {
  return (
    <div style={{
      width: 1180, height: 720,
      background: '#070a10',
      fontFamily: '"Inter", -apple-system, system-ui, sans-serif',
      color: '#e6e9f0',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* App header */}
      <div style={{
        height: 44, background: '#0b0e15', borderBottom: '1px solid #161b27',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1' }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: 'linear-gradient(135deg,#f59e0b,#dc2626)' }}></div>
          <span style={{ fontWeight: 700 }}>RummiArena</span>
          <span style={{ color: '#475569', margin: '0 8px' }}>/</span>
          <span style={{ color: '#6b7280', fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>Room 3f1f25d…</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button style={{ height: 26, padding: '0 10px', borderRadius: 5, background: '#11151e', border: '1px solid #1e2532', color: '#cbd5e1', fontSize: 11, fontFamily: 'inherit' }}>테스트</button>
          <button style={{ height: 26, padding: '0 10px', borderRadius: 5, background: '#11151e', border: '1px solid #1e2532', color: '#cbd5e1', fontSize: 11, fontFamily: 'inherit' }}>관전</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '180px 1fr 200px', gap: 12, padding: 12, minHeight: 0 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PlayerCard name="shark" sub="GPT-4o" tiles={14} score={-32} active={leftActive} accent={accentLeft} />
          <PlayerCard name="네선용" sub="나" tiles={14} score={-41} active={rightActive} accent={accentRight} />
          <div style={{
            background: '#11151e', border: '1px solid #1e2532', borderRadius: 8,
            padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 28, height: 38, borderRadius: 4,
              background: 'linear-gradient(135deg,#1e293b,#0f172a)',
              border: '1px solid #334155',
            }}></div>
            <div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>드로우 더미</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#cbd5e1', fontFamily: '"JetBrains Mono", monospace' }}>76<span style={{ fontSize: 10, color: '#6b7280', fontWeight: 400 }}> / 106</span></div>
            </div>
          </div>

          {/* Action log (fills empty bottom space) */}
          <div style={{
            flex: 1, background: '#11151e', border: '1px solid #1e2532', borderRadius: 8,
            padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
          }}>
            <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>액션 로그</div>
            {[
              { t: 'R7', who: 'shark', what: '8·9·10 노랑 추가', tone: '#94a3b8' },
              { t: 'R6', who: '나', what: '드로우', tone: '#94a3b8' },
              { t: 'R6', who: 'shark', what: '7·7·7 그룹', tone: '#94a3b8' },
              { t: 'R5', who: '나', what: '1·2·3 빨강', tone: '#94a3b8' },
            ].map((row, i) => (
              <div key={i} style={{ fontSize: 10.5, color: '#cbd5e1', display: 'flex', gap: 6, lineHeight: 1.35 }}>
                <span style={{ color: '#475569', fontFamily: '"JetBrains Mono", monospace', flexShrink: 0 }}>{row.t}</span>
                <span style={{ color: '#6b7280', flexShrink: 0 }}>{row.who}</span>
                <span style={{ color: '#cbd5e1' }}>{row.what}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {topStrip}

          <Board>
            <CommittedSet tiles={[{ n: 7, c: 'r' }, { n: 7, c: 'b' }, { n: 7, c: 'k' }]} />
            <CommittedSet tiles={[{ n: 9, c: 'b' }, { n: 10, c: 'b' }, { n: 11, c: 'b' }, { n: 12, c: 'b' }]} />
            <CommittedSet tiles={[{ n: 4, c: 'r' }, { n: 4, c: 'y' }, { n: 4, c: 'b' }]} />
          </Board>

          {/* Hand */}
          <div style={{
            background: '#0d1219', border: '1px solid #1e2532', borderRadius: 10,
            padding: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e6e9f0' }}>내 패</div>
              <div style={{ fontSize: 11, color: '#6b7280', fontFamily: '"JetBrains Mono", monospace' }}>145pt</div>
              <div style={{ marginLeft: 'auto', fontSize: 10, color: '#6b7280' }}>드래그하여 보드에 올리세요</div>
            </div>
            <HandTiles />
            <ActionBar />
          </div>
        </div>

        {/* Right */}
        <HintPanel />
      </div>

      <style>{`
        @keyframes mockPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.6); }
          50% { box-shadow: 0 0 0 6px rgba(6,182,212,0); }
        }
      `}</style>
    </div>
  );
}

function App() {
  return (
    <DesignCanvas>
      <DCSection id="hero" title="상단 빈 공간 — Hi-fi 검토" subtitle="현재 화면 / 3가지 개선안. 클릭으로 풀화면 비교 가능">
        <DCArtboard id="before" label="0 · BEFORE (현재)" width={1180} height={720}>
          <GameMock topStrip={
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 11.5, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠</span>
              <span>첫 번째 차례는 타일로 30점 이상 세트(들)를 만드는 것입니다. 그 다음 턴부터 보드 이어쓸이가 가능합니다.</span>
              <span style={{ marginLeft: 'auto', color: '#6b7280', cursor: 'pointer' }}>×</span>
            </div>
          } />
        </DCArtboard>

        <DCArtboard id="a" label="A · 턴 상태 스트립" width={1180} height={720}>
          <GameMock topStrip={<StripA />} />
        </DCArtboard>

        <DCArtboard id="b" label="B · 행동 코치 카드" width={1180} height={720}>
          <GameMock topStrip={<StripB />} />
        </DCArtboard>

        <DCArtboard id="c" label="C · AI 라이브 로그 (상대 차례)" width={1180} height={720}>
          <GameMock topStrip={<StripC />} leftActive={true} rightActive={false} accentLeft="#06b6d4" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
