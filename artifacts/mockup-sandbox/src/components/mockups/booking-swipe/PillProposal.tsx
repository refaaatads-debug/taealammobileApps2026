import './_group.css';

const brandIcon = '/__mockup/images/ajyal-icon.png';

export function PillProposal() {
  return (
    <main className="preview">
      <section className="request-card" dir="rtl">
        <div className="request-heading">
          <span className="avatar">م</span>
          <div>
            <strong>طلب حصة مع محمد رفعت إبراهيم</strong>
            <small>رياضيات · الأحد، ٤:٣٠ م</small>
          </div>
        </div>
        <div className="track proposal-track">
          <span className="side-label reject">اسحب للرفض</span>
          <span className="side-label accept">اسحب للقبول</span>
          <span className="handle proposal-handle">
            <img src={brandIcon} alt="شعار أجيال المعرفة" />
          </span>
        </div>
      </section>
      <style>{`
        .preview { min-height:190px; display:flex; align-items:center; justify-content:center; padding:18px; background:#f4f6f8; }
        .request-card { width:100%; padding:16px; border:1px solid var(--ajyal-border); border-radius:20px; background:var(--ajyal-surface); box-shadow:0 8px 24px rgba(21,28,40,.06); }
        .request-heading { display:flex; align-items:center; gap:12px; color:var(--ajyal-foreground); font-size:14px; }
        .request-heading div { display:grid; gap:5px; }
        .request-heading small { color:var(--ajyal-muted); font-size:11px; }
        .avatar { display:grid; place-items:center; width:38px; height:38px; border-radius:13px; color:var(--ajyal-primary); background:#f1f5fb; font-weight:700; }
        .track { position:relative; display:flex; align-items:center; justify-content:space-between; margin-top:15px; overflow:hidden; }
        .proposal-track { height:58px; padding:0 12px; border:1px solid rgba(23,62,140,.12); border-radius:29px; background:linear-gradient(108deg,#b8e7dc 0%,#85cbb9 46%,#a7d5e3 100%); box-shadow:inset 0 1px 2px rgba(255,255,255,.65),0 4px 9px rgba(23,62,140,.08); }
        .side-label { z-index:1; font-size:10px; font-weight:700; white-space:nowrap; }
        .reject { color:#a6373b; }
        .accept { color:#145843; }
        .handle { position:absolute; left:50%; transform:translateX(-50%); display:flex; align-items:center; justify-content:center; }
        .proposal-handle { width:48px; height:48px; border:2px solid rgba(23,62,140,.12); border-radius:50%; background:#fff; box-shadow:0 3px 8px rgba(16,36,62,.16); }
        .proposal-handle img { width:29px; height:29px; object-fit:contain; }
      `}</style>
    </main>
  );
}
